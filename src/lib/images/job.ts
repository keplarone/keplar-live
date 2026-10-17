/**
 * One image job, end to end.
 *
 * prepareImageJob  everything that can refuse, synchronously, so the route answers with a proper status:
 *                  plan gate, size/prompt limits, local safety rules, rate limits, retry-storm guard, daily cap,
 *                  storage quota, estimate + explicit confirm, cooldown / global breaker / ops pause / credits, concurrency slot.
 *                  The job row is created with an idempotency-derived id, so a retry returns the same job.
 * runImageJob      UNDERSTANDING (prompt safety check) -> GENERATING (provider call) -> READY | FAILED, persisted at each step,
 *                  so the UI shows what the backend is really doing. Credits are charged only when an image is READY, from the
 *                  provider's real usage. A failed or blocked job costs the user nothing.
 */
import { assertCanSpend, charge, USD_PER_UNIT } from "@/lib/create/platform/compute";
import { HttpError } from "@/lib/create/platform/http";
import { id as newId, now } from "@/lib/create/platform/ids";
import { acquireJobSlot } from "@/lib/create/platform/jobs";
import { EntitlementError } from "@/lib/create/platform/plans";
import { rateLimit, RateLimitError } from "@/lib/create/platform/ratelimit";
import { recordSpend } from "@/lib/create/platform/spend";
import type { Workspace } from "@/lib/create/platform/workspace";
import { isDisabled, opsControls, OpsStopError } from "@/lib/ops/controls";
import { background } from "@/lib/ops/telemetry";
import { METER_MARGIN, meteredUsd } from "@/lib/orchestration/limits";
import { newBlobId, putImage } from "./blob";
import {
  DEFAULT_QUALITY, DEFAULT_SIZE, estimateImage, FREE_UPGRADE_MESSAGE, IMAGE_MODEL, IMAGE_VENDOR, imageLimitsFor, imageProvider, openaiKey, imagesConfigured, imagesKillSwitch, isQuality, isSize,
  type ImageEstimate, type ImageLimits, type ImageQuality, type ImageSize,
} from "./config";
import { generateImage, ProviderError } from "./provider";
import { defaultHfModel, hfModel } from "@/lib/higgsfield/catalog";
import { higgsfieldConfigured } from "@/lib/higgsfield/client";
import { parseReferences } from "@/lib/higgsfield/reference";
import { checkRefImages } from "@/lib/higgsfield/video";
import { checkImageOutput, checkImagePrompt, checkImagePromptLocal } from "./safety";
import { getJob, IDEMPOTENCY_KEY, imageJobs, jobIdFor, listJobs, recentFailures, usageOf, type ImageJob } from "./store";

export const SLOT_TTL_MS = 3 * 60_000;
export const STORM_WINDOW_MS = 10 * 60_000;
export const STORM_MAX = 4;

export type ImageInput = { prompt?: string; size?: unknown; quality?: unknown; regenerateOf?: string; idempotencyKey?: string; confirmUnits?: unknown; references?: unknown; rightsConfirmed?: unknown; model?: unknown; seed?: unknown; negativePrompt?: unknown; /** Quote only: price it as if this many references were attached (nothing is uploaded yet). */ referenceCount?: unknown };
export type Prepared = { job: ImageJob; existing: boolean; estimate: ImageEstimate; release: (() => Promise<void>) | null };

/** Plan gate: Free has no paid media. */
export function limitsOrThrow(ws: Workspace): ImageLimits {
  const L = imageLimitsFor(ws.plan);
  if (!L) throw new EntitlementError(FREE_UPGRADE_MESSAGE, "plus");
  return L;
}

/** Ops kill switch for the provider/model, then the shared spend gate (cooldown, breaker, windows, credits, admin cap). */
export async function assertImagesAllowed(ws: Workspace, units: number) {
  if (imagesKillSwitch()) throw new OpsStopError("Image generation is switched off right now. Nothing was charged.", "media_paused");
  const c = await opsControls();
  // The default provider (Higgsfield when its keys are set) decides which switch applies; either one pauses image generation.
  const off = imageProvider() === "higgsfield"
    ? isDisabled(c, { provider: "higgsfield", vendor: "higgsfield", modelId: "z-image/turbo" })
    : isDisabled(c, { provider: "openai", vendor: IMAGE_VENDOR, modelId: IMAGE_MODEL });
  if (off) throw new OpsStopError("Image generation is paused right now. Nothing was charged.", "media_paused");
  await assertCanSpend(ws, units, { paidMedia: true, kind: "media" });
}

/** Validates the model, seed and negative prompt choices against what the model documents. Unsupported choices are refused, not ignored. */
export function resolveChoice(input: ImageInput, parent: ImageJob | null): NonNullable<ImageJob["choice"]> {
  const model = input.model === undefined ? parent?.choice?.model : typeof input.model === "string" ? input.model : (() => { throw new HttpError(400, "Pick one of the listed models."); })();
  const out: NonNullable<ImageJob["choice"]> = {};
  if (model) {
    if (model.startsWith("openai/")) {
      if (model !== `openai/${IMAGE_MODEL}`) throw new HttpError(400, "Pick one of the listed models.");
      if (!openaiKey()) throw new HttpError(503, "That model isn't connected. Not configured.", "not_configured");
    } else {
      const m = hfModel(model);
      if (!m || m.kind !== "image" || m.mode !== "text-to-image") throw new HttpError(400, "Pick one of the listed models.");
      if (!higgsfieldConfigured()) throw new HttpError(503, "Higgsfield isn't connected yet. Not configured.", "not_configured");
    }
    out.model = model;
  }
  const m = model && !model.startsWith("openai/") ? hfModel(model) : model ? null : defaultHfModel("image");
  const seed = input.seed === undefined || input.seed === "" || input.seed === null ? undefined : Number(input.seed);
  if (seed !== undefined) {
    if (!m?.opts?.seed) throw new HttpError(400, "That model doesn't take a seed.", "unsupported_option");
    if (!Number.isInteger(seed) || seed < 0 || seed > 2147483647) throw new HttpError(400, "The seed must be a whole number from 0 to 2147483647.");
    out.seed = seed;
  }
  const neg = typeof input.negativePrompt === "string" ? input.negativePrompt.replace(/\s+/g, " ").trim() : "";
  if (neg) {
    if (!m?.opts?.negativePrompt) throw new HttpError(400, "That model doesn't take a negative prompt.", "unsupported_option");
    out.negativePrompt = neg.slice(0, 500);
  }
  return out;
}

function resolveParams(input: ImageInput, parent: ImageJob | null) {
  const size: ImageSize = input.size === undefined && parent ? parent.size : input.size === undefined ? DEFAULT_SIZE : isSize(input.size) ? input.size : (() => { throw new HttpError(400, "Pick one of the available sizes."); })();
  const quality: ImageQuality = input.quality === undefined && parent ? parent.quality : input.quality === undefined ? DEFAULT_QUALITY : isQuality(input.quality) ? input.quality : (() => { throw new HttpError(400, "Pick one of the available quality levels."); })();
  return { size, quality };
}

/** What a job would cost, with the same validation as the real thing (used by the estimate endpoint). */
export async function estimateFor(ws: Workspace, input: ImageInput) {
  const L = limitsOrThrow(ws);
  const rows = await listJobs(ws.id);
  const parent = input.regenerateOf ? (rows.find((r) => r.id === input.regenerateOf) ?? null) : null;
  const { size, quality } = resolveParams(input, parent);
  const estimate = estimateImage(quality, size, (Array.isArray(input.references) && input.references.length > 0) || (typeof input.referenceCount === "number" && input.referenceCount > 0), resolveChoice(input, parent).model);
  const u = usageOf(rows);
  return { estimate, usage: { today: u.today, perDay: ws.admin ? null : L.perDay, highToday: u.highToday, highPerDay: ws.admin ? null : L.highPerDay, stored: u.stored, storedImages: L.storedImages, running: u.running, concurrent: L.concurrent } };
}

export async function prepareImageJob(ws: Workspace, input: ImageInput): Promise<Prepared> {
  const L = limitsOrThrow(ws);
  if (!imagesConfigured()) throw new HttpError(503, "Image generation isn't connected yet.", "not_configured");

  const rows = await listJobs(ws.id);
  const parent = input.regenerateOf ? (rows.find((r) => r.id === input.regenerateOf) ?? null) : null;
  if (input.regenerateOf && !parent) throw new HttpError(404, "That image isn't available any more.", "not_found");
  const prompt = (input.prompt ?? parent?.prompt ?? "").replace(/\s+/g, " ").trim();
  if (prompt.length < 4) throw new HttpError(400, "Describe the image you want (at least a few words).");
  if (prompt.length > L.promptChars) throw new HttpError(413, `That prompt is too long (up to ${L.promptChars} characters).`, "too_large");
  const { size, quality } = resolveParams(input, parent);

  const key = input.idempotencyKey;
  if (key !== undefined && !IDEMPOTENCY_KEY.test(key)) throw new HttpError(400, "Invalid idempotency key.");
  const jobId = key ? jobIdFor(ws.id, key) : newId("img");
  const known = key ? (rows.find((r) => r.id === jobId) ?? null) : null;
  // References (image-to-image) are only possible through Higgsfield: no fallback exists, so say so plainly when it isn't connected.
  const hasRefs = Array.isArray(input.references) && input.references.length > 0;
  if (hasRefs && !higgsfieldConfigured()) throw new HttpError(503, "Reference images need Higgsfield, which isn't connected yet. Not configured.", "not_configured");
  const refSet = hasRefs ? parseReferences(ws.id, input.references, input.rightsConfirmed) : null;
  if (refSet && (refSet.videos.length > 0 || refSet.images.length === 0 || refSet.images.length > 3)) throw new HttpError(400, "Images can use 1 to 3 reference images (not a video).", "bad_reference");
  const choice = resolveChoice(input, parent);
  const estimate = estimateImage(quality, size, Boolean(refSet), choice.model);
  if (known) return { job: known, existing: true, estimate, release: null };

  const local = checkImagePromptLocal(prompt);
  if (!local.ok) throw new HttpError(422, local.message, "refused", { category: local.category });
  if (refSet) {
    const v = await checkImagePrompt(prompt);
    if (!v.ok) throw new HttpError(422, v.message, "refused", { category: v.category });
    await checkRefImages(refSet, prompt);
  }

  // Retry-storm guard first (the more useful message), then rate limits (shared across instances).
  const storm = recentFailures(rows, STORM_WINDOW_MS);
  if (storm.count >= STORM_MAX) {
    const mins = Math.max(1, Math.ceil((storm.clearsAt - Date.now()) / 60_000));
    throw new HttpError(429, `Several image attempts failed in a row, so Keplar is pausing for about ${mins} minute${mins === 1 ? "" : "s"}. Nothing was charged.`, "failing", { retryAfterSec: mins * 60 });
  }
  try {
    await rateLimit(`img:min:${ws.id}`, L.perMin, 60, { shared: true });
  } catch (e) {
    if (e instanceof RateLimitError) throw new HttpError(429, "You're creating images quickly. Wait a few seconds and try again.", "rate_limited");
    throw e;
  }
  const used = usageOf(rows);
  if (!ws.admin && used.today >= L.perDay) {
    throw new HttpError(429, `You've reached today's limit of ${L.perDay} images for your plan. It frees up as your earlier images pass 24 hours.${ws.plan === "plus" ? " Pro allows more." : ""}`, "daily_limit");
  }
  if (!ws.admin && quality === "high" && used.highToday >= L.highPerDay) {
    throw new HttpError(429, `You've used today's ${L.highPerDay} High quality images. Standard quality is still available (${Math.max(0, L.perDay - used.today)} left today), and High frees up as your earlier images pass 24 hours.${ws.plan === "plus" ? " Pro allows more." : ""}`, "daily_limit");
  }
  if (used.stored >= L.storedImages || used.storedBytes >= L.storedBytes) {
    throw new HttpError(413, "Your image library is full. Delete some images you don't need, then try again.", "storage_full");
  }

  await assertImagesAllowed(ws, estimate.units);
  if (input.confirmUnits !== estimate.units) {
    throw new HttpError(409, `This will use up to ${estimate.units.toLocaleString("en-US")} credits, and only if the image is created. Confirm to continue.`, "confirm", { estimate: { units: estimate.units, quality, size } });
  }

  const release = await acquireJobSlot(ws.id, "image", L.concurrent, SLOT_TTL_MS, "img", L.concurrent === 1 ? "You already have an image being created. Wait for it to finish." : `You already have ${L.concurrent} images being created. Wait for one to finish.`);
  const t = now();
  const root = parent?.rootId ?? jobId;
  const version = parent ? rows.filter((r) => r.rootId === root).reduce((m, r) => Math.max(m, r.version), 0) + 1 : 1;
  const job: ImageJob = {
    id: jobId, workspaceId: ws.id, rootId: root, parentId: parent?.id ?? null, version, prompt, size, quality, model: IMAGE_MODEL, status: "understanding",
    estimateUnits: estimate.units, units: null, usd: null, errorCode: null, error: null, blobId: null, contentType: null, bytes: 0, usedIn: [],
    ...(Object.keys(choice).length ? { choice } : {}),
    ...(refSet ? { referenceUrls: refSet.images.map((r) => r.url), rightsConfirmedAt: t } : {}),
    createdAt: t, updatedAt: t, startedAt: null, finishedAt: null,
  };
  try {
    const r = await imageJobs().insertIfAbsent(job);
    if (!r.inserted) {
      await release();
      return { job: r.row, existing: true, estimate, release: null };
    }
  } catch (e) {
    await release();
    throw e;
  }
  return { job, existing: false, estimate, release };
}

/* ── run ── */

const FRIENDLY: Record<string, string> = {
  busy: "The image service is busy right now. Nothing was charged. Try again in a minute.",
  timeout: "The image took too long and was stopped. Nothing was charged. Try again.",
  policy: "Keplar can't create that image. Try describing a different subject or scene.",
  bad_output: "The image came out unusable. Nothing was charged. Try again; a simpler prompt can help.",
  too_large: "The image came out unusable. Nothing was charged. Try again; a simpler prompt can help.",
  rejected: "Image generation hit a problem on our side. Nothing was charged. Please try again later.",
  not_configured: "Image generation isn't connected yet. Nothing was charged.",
  server: "Something went wrong while creating the image. Nothing was charged. Please try again.",
};
const CODE_OF: Record<string, string> = { policy: "refused", rejected: "server", not_configured: "server", too_large: "bad_output" };

async function patch(job: ImageJob, p: Partial<ImageJob>) {
  Object.assign(job, p, { updatedAt: now() });
  await imageJobs().update(job.workspaceId, job.id, { ...p, updatedAt: job.updatedAt });
}

async function fail(job: ImageJob, code: string, message: string, usd?: number) {
  await patch(job, { status: "failed", errorCode: code, error: message, usd: usd ?? null, finishedAt: now() });
}

export async function runImageJob(ws: Workspace, jobId: string, release: (() => Promise<void>) | null): Promise<ImageJob | null> {
  let hold = release;
  // Free the concurrency slot before any terminal status is written. A client that sees "failed" or "ready"
  // must be able to start the next picture; releasing only in `finally` races that next request.
  const freeSlot = async () => {
    const r = hold;
    hold = null;
    await r?.().catch(() => undefined);
  };
  const job = await getJob(ws.id, jobId);
  if (!job || job.status !== "understanding") {
    await freeSlot();
    return job;
  }
  try {
    // 1. UNDERSTANDING: safety check on the prompt (OpenAI moderation, fails closed).
    const verdict = await checkImagePrompt(job.prompt);
    if (!verdict.ok) {
      await freeSlot();
      await fail(job, verdict.transient ? "busy" : "refused", verdict.message);
      return job;
    }
    // Conditions can change between the request and now (breaker, pause, cooldown from another job).
    try {
      await assertImagesAllowed(ws, job.estimateUnits);
    } catch (e) {
      await freeSlot();
      await fail(job, "paused", e instanceof Error ? e.message : "Image generation is paused right now. Nothing was charged.");
      return job;
    }
    // 2. GENERATING
    await patch(job, { status: "generating", startedAt: now() });
    let out;
    try {
      out = await generateImage({ prompt: job.prompt, size: job.size, quality: job.quality, workspaceId: ws.id, referenceUrls: job.referenceUrls, model: job.choice?.model, seed: job.choice?.seed, negativePrompt: job.choice?.negativePrompt });
    } catch (e) {
      const pe = e instanceof ProviderError ? e : null;
      if (pe?.usd) await recordSpend(pe.usd, ws.plan).catch(() => undefined); // billed by the provider, not charged to the user
      if (pe?.code === "rejected" || pe?.code === "not_configured") console.error("[images] provider rejected the request:", pe.message);
      const code = CODE_OF[pe?.code ?? "server"] ?? pe?.code ?? "server";
      await freeSlot();
      await fail(job, code, FRIENDLY[pe?.code ?? "server"] ?? FRIENDLY.server, pe?.usd);
      return job;
    }
    // 3. Check what came back, store it, charge the real cost, mark READY.
    const outCheck = await checkImageOutput(out.bytes, out.contentType, job.prompt);
    if (!outCheck.ok) {
      await recordSpend(out.usd, ws.plan).catch(() => undefined);
      await freeSlot();
      await fail(job, "refused", "That image was filtered by the safety check, so it wasn't kept. Nothing was charged. Try a different description.", out.usd);
      return job;
    }
    const blobId = newBlobId();
    try {
      await putImage(blobId, ws.id, out.bytes, out.contentType);
    } catch (e) {
      console.error("[images] could not store image:", e instanceof Error ? e.name : "error");
      await recordSpend(out.usd, ws.plan).catch(() => undefined);
      await freeSlot();
      await fail(job, "server", "The image was created but couldn't be saved. Nothing was charged. Please try again.", out.usd);
      return job;
    }
    let units = 0;
    try {
      // A Higgsfield job that fell back to OpenAI is never charged more than the estimate the user confirmed.
      const billedUsd = out.fallback ? Math.min(out.usd, (job.estimateUnits * USD_PER_UNIT) / METER_MARGIN) : out.usd;
      units = await charge(ws, "image.generate", { usd: meteredUsd(billedUsd), ref: job.id });
    } catch (e) {
      console.error("[images] charge failed:", e instanceof Error ? e.name : "error"); // the image is kept; never lose a paid-for result
    }
    await freeSlot();
    await patch(job, { status: "ready", blobId, contentType: out.contentType, bytes: out.bytes.length, units, usd: out.usd, model: out.model, finishedAt: now() });
    return job;
  } catch (e) {
    console.error("[images] job failed:", e instanceof Error ? e.name : "error");
    await freeSlot();
    await fail(job, "server", FRIENDLY.server).catch(() => undefined);
    return job;
  } finally {
    await freeSlot();
  }
}

/** Runs after the response when possible (Next `after`), otherwise right away; always finishes the job. */
export function startImageJob(ws: Workspace, jobId: string, release: (() => Promise<void>) | null) {
  background(async () => {
    await runImageJob(ws, jobId, release);
  });
}
