/**
 * Higgsfield video jobs (the default video provider). Flow:
 *   preview  per model: exact request body -> the account's own /estimate (else the published list price, else TBD) -> credits
 *   create   every check that can refuse runs first (Higgsfield configured, plan, safety, references + rights, price known,
 *            plan limits, spend gates, approval of the exact credit amount), then the job row is written and submitted with an
 *            Idempotency-Key. Nothing is charged at this point.
 *   progress a webhook (a "check now" signal only) and polling on every read both call refreshJob; the first one to see a terminal
 *            state wins a lock and finalizes exactly once: download -> store in Keplar storage -> charge on success only.
 * Failed, blocked (nsfw) and canceled requests are never charged (Higgsfield doesn't charge them either).
 */
import { assertCanSpend, charge } from "@/lib/create/platform/compute";
import { HttpError } from "@/lib/create/platform/http";
import { id as newId, now } from "@/lib/create/platform/ids";
import { moderateMediaOutput } from "@/lib/create/platform/moderation";
import { EntitlementError, type PlanId } from "@/lib/create/platform/plans";
import { rateLimit, RateLimitError } from "@/lib/create/platform/ratelimit";
import { blobs } from "@/lib/create/platform/blob";
import { collection } from "@/lib/create/platform/store";
import { workspaceById, type Workspace } from "@/lib/create/platform/workspace";
import { mediaJobs } from "@/lib/create/repo";
import type { MediaJob } from "@/lib/create/types";
import { checkImageOutput, checkImagePrompt, checkImagePromptLocal } from "@/lib/images/safety";
import { toUnits } from "@/lib/create/platform/compute";
import { windowRoom } from "@/lib/create/platform/windows";
import { meteredUsd } from "@/lib/orchestration/limits";
import { atListBasis, defaultHfModel, hfModel, hfModels, listPriceUsd, usesRefs, videoBody, type GenOpts, type HfModel, type RefUrls } from "./catalog";
import { hfCancel, hfDownload, hfEstimate, hfStatus, hfSubmit, higgsfieldConfigured, HiggsfieldError, isTerminal, webhookUrl, type HfRequest } from "./client";
import { parseReferences, REF_LIMITS, RIGHTS_NOTE, type RefSet } from "./reference";

export type VideoLimits = { perDay: number; perMin: number; concurrent: number; promptChars: number; maxCompare: number };
/** Keplar policy limits (TBD founder approval), not Higgsfield limits. Free, Lite and Plus have no video (src/lib/create/platform/plans.ts). */
export const VIDEO_LIMITS: Record<PlanId, VideoLimits | null> = {
  free: null, lite: null, plus: null,
  pro: { perDay: 6, perMin: 3, concurrent: 2, promptChars: 1000, maxCompare: 2 },
  business: { perDay: 15, perMin: 6, concurrent: 3, promptChars: 1000, maxCompare: 3 },
};
export const videoLimitsFor = (plan: PlanId) => VIDEO_LIMITS[plan];

/**
 * Compare: one prompt, up to 6 clips per selected model, shown side by side. Separate daily cap (policy values, TBD founder approval)
 * because one run can cost several dollars: Pro 2 runs/day on up to 2 models, Business 5 runs/day on up to 3. Only one run is active at a time.
 * Clips are sent to Higgsfield through a small window so its per-key concurrency limit is never reached.
 */
export const COMPARE_PER_MODEL = 6;
export const COMPARE_WINDOW = 4;
export const COMPARE_LIMITS: Record<PlanId, { runsPerDay: number } | null> = { free: null, lite: null, plus: null, pro: { runsPerDay: 2 }, business: { runsPerDay: 5 } };

/** At or above this many credits a second explicit acknowledgement is required (about $2.20 of provider cost). */
export const LARGE_JOB_UNITS = 1000;
export const VIDEO_TIMEOUT_MS = 25 * 60_000;
export const POLL_MIN_GAP_MS = 3_000;
export const MAX_VIDEO_BYTES = 150_000_000;
export const OUTPUT_RETENTION_MS = 7 * 86_400_000;
export const UPGRADE_MESSAGE = "Video generation is part of Keplar Pro and Business, because every clip costs real money to make.";

export type VideoInput = {
  prompt?: unknown; model?: unknown; models?: unknown; durationSec?: unknown; aspectRatio?: unknown;
  resolution?: unknown; sound?: unknown; negativePrompt?: unknown; count?: unknown; compare?: unknown;
  references?: unknown; rightsConfirmed?: unknown; confirmUnits?: unknown; acknowledgeLarge?: unknown; idempotencyKey?: unknown;
};

export type PreviewItem = {
  modelId: string; label: string; mode: string; durationSec: number | null; count: number; applied: string[]; ignoredOptions: string[];
  usd: number | null; units: number | null; source: "estimate" | "list" | "tbd";
  priceNote: string; usesRefs: { image: boolean; video: boolean }; ignoresRefs: boolean; problem: string | null;
};
export type Preview = { compare: boolean; /** Set when a usage window (5-hour or weekly) cannot cover this run: the message to show instead of the Start button. */ blocked: string | null; items: PreviewItem[]; totalUnits: number | null; priceKnown: boolean; large: boolean; refs: { images: number; video: boolean }; rightsNote: string };

const snapDuration = (m: HfModel, want: number, max: number, sourceSec?: number): { sec: number | null; problem: string | null } => {
  if (m.durationFollowsSource) {
    if (!sourceSec) return { sec: null, problem: "Add a source video." };
    return sourceSec > max ? { sec: null, problem: `Your plan allows up to ${max} s and the output follows your ${Math.round(sourceSec)} s source video.` } : { sec: Math.ceil(sourceSec), problem: null };
  }
  const allowed = (m.durations ?? []).filter((d) => d <= max);
  if (allowed.length === 0) return { sec: null, problem: `This model's shortest clip is longer than your plan's ${max} s limit.` };
  const best = allowed.reduce((a, d) => (Math.abs(d - want) < Math.abs(a - want) || (Math.abs(d - want) === Math.abs(a - want) && d < a) ? d : a), allowed[0]);
  return { sec: best, problem: null };
};

function needs(m: HfModel, r: RefSet): string | null {
  const wantImg = m.refs?.image?.min ?? 0;
  const wantVid = m.refs?.video?.min ?? 0;
  if (wantVid > r.videos.length) return "Add a source video (MP4, 4 s or longer).";
  if (wantImg > r.images.length) return wantImg === 1 ? "Add a reference image." : `Add at least ${wantImg} reference images.`;
  return null;
}

function refUrls(m: HfModel, r: RefSet): RefUrls {
  return {
    imageUrls: r.images.slice(0, m.refs?.image?.max ?? 0).map((x) => x.url),
    videoUrls: r.videos.slice(0, m.refs?.video?.max ?? 0).map((x) => x.url),
  };
}

function cleanPrompt(raw: unknown, max: number) {
  const prompt = (typeof raw === "string" ? raw : "").replace(/\s+/g, " ").trim();
  if (prompt.length < 4) throw new HttpError(400, "Describe the video you want (at least a few words).");
  if (prompt.length > max) throw new HttpError(413, `That prompt is too long (up to ${max} characters).`, "too_large");
  return prompt;
}

function chosenModels(input: VideoInput, L: VideoLimits): HfModel[] {
  const ids = Array.isArray(input.models) ? input.models.map(String) : input.model ? [String(input.model)] : [];
  const list = (ids.length ? ids : [defaultHfModel("video")!.id]).map((id) => {
    const m = hfModel(id);
    if (!m || m.kind !== "video") throw new HttpError(400, "Pick one of the listed video models.", "bad_model");
    return m;
  });
  const uniq = [...new Map(list.map((m) => [m.id, m])).values()];
  if (uniq.length > L.maxCompare) throw new HttpError(400, `Compare up to ${L.maxCompare} models on your plan.`, "too_many_models");
  return uniq;
}

export function requireVideoPlan(ws: Workspace): VideoLimits {
  const L = videoLimitsFor(ws.plan);
  if (!L || !ws.entitlements.video) throw new EntitlementError(UPGRADE_MESSAGE, "pro");
  return L;
}

async function priceOf(m: HfModel, body: Record<string, unknown>, sec: number | null, opts: GenOpts): Promise<{ usd: number | null; source: "estimate" | "list" | "tbd"; note: string }> {
  const est = await hfEstimate(m.endpoint, body);
  if (est) return { usd: est.usd, source: "estimate", note: "Higgsfield's own quote for these exact settings." };
  const list = atListBasis(m, opts) ? listPriceUsd(m, sec ?? undefined) : null;
  if (list !== null) return { usd: list, source: "list", note: "Higgsfield's published list price (the account quote wasn't available)." };
  return { usd: null, source: "tbd", note: "Price TBD: not published for this model and the account quote wasn't available." };
}

/** The user's option choices, kept only where the model documents them; the rest are reported back as ignored. */
function optionsFor(m: HfModel, input: VideoInput): { opts: GenOpts; applied: string[]; ignored: string[] } {
  const want: GenOpts = {
    resolution: typeof input.resolution === "string" && input.resolution ? input.resolution : undefined,
    sound: typeof input.sound === "boolean" ? input.sound : undefined,
    negativePrompt: typeof input.negativePrompt === "string" && input.negativePrompt.trim() ? input.negativePrompt.trim() : undefined,
  };
  const c = m.opts ?? {};
  const applied: string[] = [];
  const ignored: string[] = [];
  const opts: GenOpts = {};
  if (want.resolution) {
    if (c.resolutions?.includes(want.resolution)) { opts.resolution = want.resolution; applied.push("resolution"); } else ignored.push("resolution");
  }
  if (want.sound !== undefined) {
    if (c.sound) { opts.sound = want.sound; applied.push("sound"); } else ignored.push("sound");
  }
  if (want.negativePrompt) {
    if (c.negativePrompt) { opts.negativePrompt = want.negativePrompt; applied.push("negativePrompt"); } else ignored.push("negativePrompt");
  }
  return { opts, applied, ignored };
}

const unitsFor = (usd: number) => toUnits(meteredUsd(usd));

/** Everything the approval step shows. Reads only: nothing is reserved, submitted or charged. */
export async function previewVideo(ws: Workspace, input: VideoInput): Promise<Preview & { prompt: string; refSet: RefSet }> {
  if (!higgsfieldConfigured()) throw new HttpError(503, "Video generation isn't connected yet.", "not_configured");
  const L = requireVideoPlan(ws);
  const prompt = cleanPrompt(input.prompt, L.promptChars);
  const refSet = parseReferences(ws.id, input.references, input.rightsConfirmed);
  const models = chosenModels(input, L);
  const want = Math.max(2, Number(input.durationSec) || 5);
  const compare = input.compare === true;
  const count = compare
    ? Math.min(Math.max(1, Math.floor(Number(input.count) || COMPARE_PER_MODEL)), COMPARE_PER_MODEL)
    : Math.min(Math.max(1, Math.floor(Number(input.count) || 1)), L.concurrent);
  const items: PreviewItem[] = [];
  for (const m of models) {
    const use = usesRefs(m, { image: refSet.images.length > 0, video: refSet.videos.length > 0 });
    const ignores = (refSet.images.length > 0 || refSet.videos.length > 0) && !use.image && !use.video;
    const miss = needs(m, refSet);
    const sourceSec = refSet.videos[0]?.durationSec;
    const d = snapDuration(m, want, ws.entitlements.maxVideoSeconds, sourceSec);
    const problem = miss ?? d.problem;
    let usd: number | null = null;
    let source: PreviewItem["source"] = "tbd";
    let note = problem ?? "";
    const o = optionsFor(m, input);
    if (!problem) {
      const body = videoBody(m, { prompt, durationSec: d.sec ?? undefined, aspectRatio: typeof input.aspectRatio === "string" ? input.aspectRatio : undefined, refs: refUrls(m, refSet), opts: o.opts });
      const p = await priceOf(m, body, d.sec, o.opts);
      ({ usd, source, note } = p);
    }
    items.push({ modelId: m.id, label: m.label, mode: m.mode, durationSec: d.sec, count, applied: o.applied, ignoredOptions: o.ignored, usd, units: usd === null ? null : unitsFor(usd) * count, source, priceNote: note, usesRefs: use, ignoresRefs: ignores, problem });
  }
  const known = items.every((i) => i.units !== null);
  const total = known ? items.reduce((t, i) => t + (i.units ?? 0), 0) : null;
  const room = total !== null && total > 0 ? await windowRoom(ws, total) : null;
  return { compare, blocked: room?.blocked?.message ?? null, items, totalUnits: total, priceKnown: known, large: (total ?? 0) >= LARGE_JOB_UNITS, refs: { images: refSet.images.length, video: refSet.videos.length > 0 }, rightsNote: RIGHTS_NOTE, prompt, refSet };
}

const FRIENDLY: Record<string, string> = {
  busy: "Higgsfield is busy right now. Nothing was charged. Try again in a minute.",
  unavailable: "That video model is temporarily unavailable. Nothing was charged. Try another model or try later.",
  credits: "Video generation is paused on our side right now. Nothing was charged. Please try again later.",
  auth: "Video generation hit a problem on our side. Nothing was charged. Please try again later.",
  validation: "That video setting isn't supported by the model. Nothing was charged. Change the length, shape or reference and try again.",
  not_found: "That video model isn't available right now. Nothing was charged.",
  timeout: "The video took too long and was stopped. Nothing was charged. Try again.",
  server: "Something went wrong while creating the video. Nothing was charged. Please try again.",
  failed: "Higgsfield couldn't make this video. Nothing was charged. Try a different description or model.",
  canceled: "This video was canceled. Nothing was charged.",
  bad_output: "The video came out unusable. Nothing was charged. Try again.",
};
export const friendly = (code: string) => FRIENDLY[code] ?? FRIENDLY.server;

const videoJobsOf = (rows: MediaJob[]) => rows.filter((r) => r.hf);
const active = (j: MediaJob) => j.status === "queued" || j.status === "running";

export async function checkRefImages(refs: RefSet, prompt: string) {
  for (const r of refs.images) {
    const dl = await hfDownload(r.url, 10_000_000).catch(() => null);
    if (!dl) throw new HttpError(400, "A reference image couldn't be read. Remove it and add it again.", "bad_reference");
    const ok = await checkImageOutput(dl.bytes, r.contentType, prompt);
    if (!ok.ok) throw new HttpError(422, "Keplar can't use that reference image. Try a different one.", "refused");
  }
}

function refused(prompt: string) {
  const local = checkImagePromptLocal(prompt);
  return local.ok ? null : local;
}

export async function createVideoJobs(ws: Workspace, input: VideoInput): Promise<MediaJob[]> {
  const pv = await previewVideo(ws, input); // configured, plan, prompt length, references + rights, price per model
  const L = requireVideoPlan(ws);
  const { prompt, refSet } = pv;

  const local = refused(prompt);
  if (local) throw new HttpError(422, local.message.replace(/\bimage\b/g, "video"), "refused", { category: local.category });
  const bad = pv.items.find((i) => i.problem);
  if (bad) throw new HttpError(400, `${bad.label}: ${bad.problem}`, "model_unavailable");
  if (!pv.priceKnown || pv.totalUnits === null) throw new HttpError(409, "The price for this model isn't available yet (TBD), so Keplar won't start it. Pick another model.", "price_tbd");
  const total = pv.totalUnits;

  const verdict = await checkImagePrompt(prompt);
  if (!verdict.ok) throw new HttpError(422, verdict.message.replace(/\bimage\b/g, "video"), "refused", { category: verdict.category });
  await checkRefImages(refSet, prompt);

  try {
    await rateLimit(`vid:min:${ws.id}`, L.perMin, 60, { shared: true });
  } catch (e) {
    if (e instanceof RateLimitError) throw new HttpError(429, "You're creating videos quickly. Wait a moment and try again.", "rate_limited");
    throw e;
  }
  const jobCount = pv.items.reduce((t, i) => t + i.count, 0);
  const rows = videoJobsOf(await mediaJobs().list(ws.id));
  const dayAgo = Date.now() - 86_400_000;
  const compare = pv.compare;
  if (compare) {
    const C = COMPARE_LIMITS[ws.plan];
    if (!C) throw new EntitlementError(UPGRADE_MESSAGE, "pro");
    const runs = new Set(rows.filter((r) => r.hf?.compare && r.hf.compareId && Date.parse(r.createdAt) >= dayAgo).map((r) => r.hf!.compareId)).size;
    if (!ws.admin && runs >= C.runsPerDay) {
      throw new HttpError(429, `Compare is limited to ${C.runsPerDay} run${C.runsPerDay === 1 ? "" : "s"} a day on your plan. It frees up 24 hours after a run.${ws.plan === "pro" ? " Business allows more." : ""}`, "daily_limit");
    }
    if (rows.some((r) => r.hf?.compare && active(r) && Date.now() - Date.parse(r.createdAt) < 2 * VIDEO_TIMEOUT_MS)) {
      throw new HttpError(429, "Your Compare run is still being created. Wait for it to finish before starting another.", "too_many_jobs");
    }
  } else {
    const todays = rows.filter((r) => !r.hf?.compare && Date.parse(r.createdAt) >= dayAgo && r.status !== "blocked" && !(r.status === "failed" && !r.hf?.requestId)).length;
    if (!ws.admin && todays + jobCount > L.perDay) {
      throw new HttpError(429, `Today's limit is ${L.perDay} videos on your plan (${Math.max(0, L.perDay - todays)} left). It frees up as earlier videos pass 24 hours.${ws.plan === "pro" ? " Business allows more." : ""}`, "daily_limit");
    }
    const running = rows.filter((r) => !r.hf?.compare && active(r) && Date.now() - Date.parse(r.createdAt) < VIDEO_TIMEOUT_MS + 60_000).length;
    if (running + jobCount > L.concurrent) {
      throw new HttpError(429, running === 0 ? `Your plan can make ${L.concurrent} video${L.concurrent === 1 ? "" : "s"} at a time.` : `You already have ${running} video${running === 1 ? "" : "s"} being created. Wait for ${running === 1 ? "it" : "one"} to finish.`, "too_many_jobs");
    }
  }
  await assertCanSpend(ws, total, { paidMedia: true, kind: "media" });

  if (input.confirmUnits !== total) {
    throw new HttpError(409, `This will use up to ${total.toLocaleString("en-US")} credits, and only if the video is created. Confirm to continue.`, "confirm", { estimate: { totalUnits: total, items: pv.items.map((i) => ({ modelId: i.modelId, units: i.units })) } });
  }
  if (pv.large && input.acknowledgeLarge !== true) {
    throw new HttpError(409, `This is a large job (${total.toLocaleString("en-US")} credits). Confirm that you want to spend this much.`, "confirm_large", { estimate: { totalUnits: total } });
  }

  const compareId = compare || pv.items.length > 1 || jobCount > 1 ? newId("cmp") : null;
  const key = typeof input.idempotencyKey === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(input.idempotencyKey) ? input.idempotencyKey : null;
  const out: MediaJob[] = [];
  for (const item of pv.items) {
    const m = hfModel(item.modelId)!;
    const o = optionsFor(m, input);
    const perClip = unitsFor(item.usd!);
    for (let n = 0; n < item.count; n++) {
      const jobId = key ? `med_${key.replace(/[^A-Za-z0-9]/g, "").slice(0, 20)}_${out.length}` : newId("med");
      const existing = await mediaJobs().get(ws.id, jobId);
      if (existing) { out.push(existing); continue; }
      const aspect = typeof input.aspectRatio === "string" && m.aspectRatios.includes(input.aspectRatio) ? input.aspectRatio : (m.aspectRatios[0] ?? "16:9");
      const t = now();
      const job: MediaJob = {
        id: jobId, workspaceId: ws.id, kind: "video", prompt, model: m.id,
        params: { aspectRatio: aspect, durationSec: item.durationSec ?? undefined, ...(o.opts.sound !== undefined ? { audio: o.opts.sound } : {}), ...(o.opts.resolution ? { quality: o.opts.resolution } : {}), ...(o.opts.negativePrompt ? { negativePrompt: o.opts.negativePrompt } : {}) },
        status: "queued", estimatedUnits: perClip, units: null, outputKey: null, contentType: null, createdAt: t, completedAt: null,
        hf: {
          endpoint: m.endpoint, mode: m.mode, requestId: null, plan: ws.plan, quoteUsd: item.usd!, quoteSource: item.source === "estimate" ? "estimate" : "list",
          outputUrl: null, storedCopy: false, errorCode: null, submittedAt: null, lastPolledAt: null,
          refs: { images: refSet.images.length, video: refSet.videos.length > 0, ignored: item.ignoresRefs }, rightsConfirmedAt: refSet.images.length + refSet.videos.length ? t : null, compareId,
          ...(compare ? { compare: true, pending: out.length >= COMPARE_WINDOW ? refUrls(m, refSet) : null } : {}),
        },
      };
      const ins = await mediaJobs().insert(job);
      // Compare: the first few go out now, the rest wait for a free slot (refreshJob sends them) so Higgsfield's concurrency limit is never hit.
      out.push(job.hf!.pending ? ins : await submitJob(ws, ins, refUrls(m, refSet)));
    }
  }
  return out;
}

/** Sends one prepared job to Higgsfield (retried inside hfSubmit with the job id as Idempotency-Key). */
export async function submitJob(ws: { id: string }, job: MediaJob, urls: RefUrls, sleepMs?: (n: number) => number): Promise<MediaJob> {
  const m = hfModel(job.model)!;
  const body = videoBody(m, { prompt: job.prompt, durationSec: job.params.durationSec, aspectRatio: job.params.aspectRatio, refs: urls, opts: { resolution: job.params.quality, sound: job.params.audio, negativePrompt: job.params.negativePrompt } });
  try {
    const req = await hfSubmit(m.endpoint, body, { idempotencyKey: job.id, webhookUrl: webhookUrl(ws.id, job.id) ?? undefined, sleepMs });
    return (await mediaJobs().update(ws.id, job.id, { hf: { ...job.hf!, pending: null, requestId: req.request_id, submittedAt: now() }, status: req.status === "in_progress" ? "running" : "queued" })) ?? job;
  } catch (e) {
    const code = e instanceof HiggsfieldError ? e.code : "server";
    if (e instanceof HiggsfieldError && ["auth", "credits", "validation"].includes(e.code)) console.error("[video] Higgsfield rejected a submission:", e.code, e.status);
    return (await mediaJobs().update(ws.id, job.id, { status: "failed", error: friendly(code), completedAt: now(), hf: { ...job.hf!, pending: null, errorCode: code } })) ?? job;
  }
}

type Lock = { id: string; workspaceId: string; at: string };
const locks = () => collection<Lock>("hf_finalize");

async function takeLock(ws: string, jobId: string): Promise<boolean> {
  const r = await locks().insertIfAbsent({ id: jobId, workspaceId: ws, at: now() });
  if (r.inserted) return true;
  if (Date.now() - Date.parse(r.row.at) > 2 * 60_000) { await locks().update(ws, jobId, { at: now() }); return true; } // a crashed finalizer
  return false;
}

async function fail(job: MediaJob, code: string, status: MediaJob["status"] = "failed"): Promise<MediaJob> {
  return (await mediaJobs().update(job.workspaceId, job.id, { status, error: status === "blocked" ? "Blocked by the content safety check. Nothing was charged." : friendly(code), completedAt: now(), hf: { ...job.hf!, errorCode: code } })) ?? job;
}

const isMp4 = (b: Buffer) => b.length > 12 && b.subarray(4, 8).toString("latin1") === "ftyp";

/** Turns a terminal Higgsfield state into the job's final state. Idempotent: only the lock holder does the work. */
export async function finalizeJob(job: MediaJob, st: HfRequest): Promise<MediaJob> {
  const fresh = (await mediaJobs().get(job.workspaceId, job.id)) ?? job;
  if (!active(fresh)) return fresh;
  if (!(await takeLock(fresh.workspaceId, fresh.id))) return fresh;
  if (st.status === "nsfw") return fail(fresh, "nsfw", "blocked");
  if (st.status === "canceled") return fail(fresh, "canceled");
  if (st.status === "failed") return fail(fresh, "failed");
  const url = st.video?.url;
  if (!url) return fail(fresh, "bad_output");
  // Keplar storage first (a failure here is not fatal: the 7-day Higgsfield URL still plays and the user still got their video).
  let stored = false;
  let key: string | null = null;
  try {
    const dl = await hfDownload(url, MAX_VIDEO_BYTES);
    if (!isMp4(dl.bytes)) return fail(fresh, "bad_output");
    key = `media/${fresh.workspaceId}/${fresh.id}.mp4`;
    await blobs().put(key, dl.bytes, "video/mp4");
    stored = true;
  } catch (e) {
    if (e instanceof HiggsfieldError && e.code === "bad_output") return fail(fresh, "bad_output");
    key = null;
  }
  const post = await moderateMediaOutput(url, fresh.prompt); // prompt re-check; frame-level filtering is Higgsfield's own nsfw status
  if (!post.allowed) {
    if (key) await blobs().removePrefix(key).catch(() => undefined);
    return fail(fresh, "nsfw", "blocked");
  }
  const ws = await workspaceById(fresh.workspaceId, fresh.hf!.plan as PlanId);
  let units = 0;
  try {
    if (ws) units = await charge(ws, "video.generate", { usd: meteredUsd(fresh.hf!.quoteUsd), ref: fresh.id });
  } catch (e) {
    console.error("[video] charge failed:", e instanceof Error ? e.name : "error"); // never lose a delivered result
  }
  return (await mediaJobs().update(fresh.workspaceId, fresh.id, {
    status: "completed", outputKey: key, contentType: "video/mp4", units, completedAt: now(),
    hf: { ...fresh.hf!, outputUrl: url, storedCopy: stored, errorCode: null },
  })) ?? fresh;
}

/** One poll of an in-flight job (throttled). Safe to call from every read. */
export async function refreshJob(job: MediaJob, opts: { force?: boolean; at?: number; sleepMs?: (n: number) => number } = {}): Promise<MediaJob> {
  if (!job.hf || !active(job)) return job;
  const at = opts.at ?? Date.now();
  if (!job.hf.requestId && job.hf.pending) return promotePending(job, at, opts.sleepMs);
  if (!job.hf.requestId) {
    // Submission never reached Higgsfield (function died): fail it after a minute; nothing was charged.
    return at - Date.parse(job.createdAt) > 60_000 ? fail(job, "server") : job;
  }
  if (!opts.force && job.hf.lastPolledAt && at - Date.parse(job.hf.lastPolledAt) < POLL_MIN_GAP_MS) return job;
  const stamped = (await mediaJobs().update(job.workspaceId, job.id, { hf: { ...job.hf, lastPolledAt: new Date(at).toISOString() } })) ?? job;
  let st: HfRequest;
  try {
    st = await hfStatus(job.hf.requestId, { sleepMs: opts.sleepMs });
  } catch (e) {
    if (e instanceof HiggsfieldError && e.code === "not_found") return fail(stamped, "not_found");
    if (at - Date.parse(job.hf.submittedAt ?? job.createdAt) > VIDEO_TIMEOUT_MS) return timeoutJob(stamped);
    return stamped; // transient: try again on the next poll
  }
  if (isTerminal(st.status)) return finalizeJob(stamped, st);
  if (at - Date.parse(job.hf.submittedAt ?? job.createdAt) > VIDEO_TIMEOUT_MS) return timeoutJob(stamped);
  const next = st.status === "in_progress" ? "running" : "queued";
  return next === stamped.status ? stamped : ((await mediaJobs().update(job.workspaceId, job.id, { status: next })) ?? stamped);
}

/** A waiting Compare clip is sent once fewer than COMPARE_WINDOW of the workspace's clips are in flight. */
async function promotePending(job: MediaJob, at: number, sleepMs?: (n: number) => number): Promise<MediaJob> {
  if (at - Date.parse(job.createdAt) > 2 * VIDEO_TIMEOUT_MS) return fail(job, "timeout");
  const rows = videoJobsOf(await mediaJobs().list(job.workspaceId));
  const inFlight = rows.filter((r) => active(r) && r.hf?.requestId).length;
  if (inFlight >= COMPARE_WINDOW) return job;
  const claimed = await mediaJobs().get(job.workspaceId, job.id);
  if (!claimed?.hf?.pending || !active(claimed)) return claimed ?? job;
  return submitJob({ id: job.workspaceId }, claimed, claimed.hf.pending, sleepMs);
}

async function timeoutJob(job: MediaJob): Promise<MediaJob> {
  if (job.hf?.requestId) await hfCancel(job.hf.requestId); // only works while still queued
  return fail(job, "timeout");
}

/** Webhook entry: only a hint. The status is re-read with Keplar's own credentials; the payload is never trusted. */
export async function refreshById(workspaceId: string, jobId: string): Promise<MediaJob | null> {
  const job = await mediaJobs().get(workspaceId, jobId);
  return job ? refreshJob(job, { force: true }) : null;
}

export async function listVideoJobs(ws: Workspace): Promise<MediaJob[]> {
  const rows = (await mediaJobs().list(ws.id)).filter((j) => j.hf).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 60);
  const act = rows.filter(active).slice(0, 24);
  const fresh = await Promise.all(act.map((j) => refreshJob(j).catch(() => j)));
  const by = new Map(fresh.map((j) => [j.id, j]));
  return rows.map((j) => by.get(j.id) ?? j);
}

/** Stops a clip that is still queued or running. A finished clip is left as it is (nothing further is charged). */
export async function cancelVideoJob(ws: Workspace, jobId: string): Promise<MediaJob> {
  const job = await mediaJobs().get(ws.id, jobId);
  if (!job?.hf || job.workspaceId !== ws.id) throw new HttpError(404, "Video not found.", "not_found");
  if (!active(job)) return job;
  if (job.hf.requestId) await hfCancel(job.hf.requestId);
  return fail(job, "canceled");
}

/** Removes finished clips the owner doesn't want (Compare: keep the ones you picked). Running clips can't be removed. */
export async function removeVideoJobs(ws: Workspace, ids: unknown): Promise<{ removed: string[]; skipped: string[] }> {
  const list = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string").slice(0, 60) : [];
  if (list.length === 0) throw new HttpError(400, "Pick at least one video.", "bad_request");
  const removed: string[] = [];
  const skipped: string[] = [];
  for (const id of list) {
    const j = await mediaJobs().get(ws.id, id);
    if (!j?.hf || active(j)) { skipped.push(id); continue; }
    if (j.outputKey) await blobs().removePrefix(j.outputKey).catch(() => undefined);
    await mediaJobs().remove(ws.id, id);
    removed.push(id);
  }
  return { removed, skipped };
}

export function videoUrl(job: MediaJob) {
  return job.status === "completed" && job.hf ? `/api/create/media/${job.id}/file` : null;
}

/** Where a completed video is played from: the stored copy when it can be served, else Higgsfield's URL while it is still kept. */
export function playbackSource(job: MediaJob, at = Date.now()): { kind: "blob"; key: string } | { kind: "remote"; url: string } | { kind: "gone" } {
  const remoteOk = job.hf?.outputUrl && at - Date.parse(job.completedAt ?? job.createdAt) < OUTPUT_RETENTION_MS - 3_600_000;
  if (job.outputKey && job.hf?.storedCopy && !(process.env.VERCEL && remoteOk)) return { kind: "blob", key: job.outputKey };
  if (remoteOk) return { kind: "remote", url: job.hf!.outputUrl! };
  if (job.outputKey && job.hf?.storedCopy) return { kind: "blob", key: job.outputKey };
  return { kind: "gone" };
}

export { hfModels };

/** Everything the video studio needs to render: provider state, model picker (Higgsfield first, default marked), limits. */
export function videoConfig(ws: Workspace) {
  const L = videoLimitsFor(ws.plan);
  const configured = higgsfieldConfigured();
  const def = defaultHfModel("video")!;
  return {
    provider: "higgsfield" as const,
    configured,
    status: configured ? "ready" : "not_configured",
    beta: true,
    label: configured ? "Beta" : "Not configured",
    available: Boolean(L && ws.entitlements.video),
    upgradeTo: L && ws.entitlements.video ? null : "pro",
    message: L && ws.entitlements.video ? null : UPGRADE_MESSAGE,
    defaultModel: def.id,
    maxSeconds: ws.entitlements.maxVideoSeconds,
    compare: L && COMPARE_LIMITS[ws.plan] ? { maxModels: L.maxCompare, perModel: COMPARE_PER_MODEL, runsPerDay: ws.admin ? null : COMPARE_LIMITS[ws.plan]!.runsPerDay, window: COMPARE_WINDOW } : null,
    limits: L ? { perDay: ws.admin ? null : L.perDay, concurrent: L.concurrent, maxCompare: L.maxCompare, promptChars: L.promptChars, maxOutputs: L.concurrent } : null,
    models: hfModels("video").map((m) => ({
      id: m.id, label: m.label, mode: m.mode, note: m.note, default: m.id === def.id,
      durations: m.durations?.filter((d) => d <= ws.entitlements.maxVideoSeconds) ?? null, durationFollowsSource: Boolean(m.durationFollowsSource),
      aspectRatios: m.aspectRatios, refs: m.refs ?? null,
      options: { resolutions: m.opts?.resolutions ?? null, defaultResolution: m.opts?.defaultResolution ?? null, sound: Boolean(m.opts?.sound), negativePrompt: Boolean(m.opts?.negativePrompt), seed: Boolean(m.opts?.seed) },
      price: m.listUsd === null ? { known: false, label: "Price TBD (the account quote is used when available)" } : { known: true, label: `from published list price` },
    })),
    reference: { image: { types: REF_LIMITS.image.types, maxBytes: REF_LIMITS.image.maxBytes, max: REF_LIMITS.maxImages }, video: { types: REF_LIMITS.video.types, maxBytes: REF_LIMITS.video.maxBytes, minSec: REF_LIMITS.video.minSec, maxSec: REF_LIMITS.video.maxSec }, inlineMaxBytes: REF_LIMITS.inlineMaxBytes, rightsNote: RIGHTS_NOTE },
  };
}

export function publicVideoJob(j: MediaJob) {
  return {
    id: j.id, kind: j.kind, prompt: j.prompt, model: j.model, status: j.status, params: j.params, estimatedUnits: j.estimatedUnits, units: j.units,
    error: j.error, createdAt: j.createdAt, completedAt: j.completedAt, url: videoUrl(j),
    mode: j.hf?.mode ?? null, refs: j.hf?.refs ?? null, compareId: j.hf?.compareId ?? null, waiting: Boolean(j.hf?.pending), storedCopy: j.hf?.storedCopy ?? false,
  };
}
