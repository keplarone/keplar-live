/**
 * Image + video generation (async jobs with polling).
 * - live: OpenRouter Image API (POST /api/v1/images, sync) and Video API
 *   (POST /api/v1/videos → poll polling_url → GET content). Metered by the
 *   response's usage.cost.
 * Not set up without OPENROUTER_API_KEY (and a persistent filesystem); nothing is faked.
 */
import { blobs } from "./platform/blob";
import { assertCanSpend, charge, toUnits } from "./platform/compute";
import { createReady } from "./platform/config";
import { id, now } from "./platform/ids";
import { moderateMediaOutput, moderateText } from "./platform/moderation";
import { EntitlementError } from "./platform/plans";
import { defineJob, enqueue, type JobContext } from "./platform/queue";
import { HttpError } from "./platform/http";
import type { Workspace } from "./platform/workspace";
import { mediaJobs } from "./repo";
import type { MediaJob, MediaKind } from "./types";
import { createVideoJobs, videoUrl } from "@/lib/higgsfield/video";

export type MediaModel = {
  id: string;
  kind: MediaKind;
  label: string;
  /** Catalog estimate, USD. Image: per image. Video: per second (with audio where noted). */
  usd: number;
  unit: "image" | "second";
  premium?: boolean;
  note: string;
};

/** Checked Sep 2026 (docs/create.md §1d). Re-pull GET /api/v1/{images,videos}/models before launch. */
export const MEDIA_MODELS: MediaModel[] = [
  { id: "openai/gpt-image-2", kind: "image", label: "GPT Image 2", usd: 0.0135, unit: "image", note: "Default. $0.006–$0.0135 at default quality; `high` quality ≈ $0.21." },
  { id: "black-forest-labs/flux.2-pro", kind: "image", label: "FLUX.2 Pro", usd: 0.03, unit: "image", note: "Photographic; 8 reference images." },
  { id: "recraft/recraft-v4.1-vector", kind: "image", label: "Recraft v4.1 Vector", usd: 0.08, unit: "image", premium: true, note: "Editable SVG output (logos, icons)." },
  { id: "google/gemini-3-pro-image", kind: "image", label: "Gemini 3 Pro Image", usd: 0.134, unit: "image", premium: true, note: "Highest cost; strong text rendering." },
  { id: "alibaba/wan-2.7", kind: "video", label: "Wan", usd: 0.05, unit: "second", note: "Budget default. Reference: Wan 2.5 $0.05/s (fal)." },
  { id: "kling/kling-2.5-turbo-pro", kind: "video", label: "Kling 2.5 Turbo Pro", usd: 0.07, unit: "second", note: "Reference: $0.07/s (fal)." },
  { id: "google/veo-3.1-fast", kind: "video", label: "Veo 3.1 Fast (audio)", usd: 0.15, unit: "second", premium: true, note: "Reference: $0.10/s silent, $0.15/s with audio (fal)." },
  { id: "google/veo-3.1", kind: "video", label: "Veo 3.1 (audio)", usd: 0.4, unit: "second", premium: true, note: "Reference: $0.20/s silent, $0.40/s with audio at 720p/1080p (fal)." },
];

export function estimateMedia(model: MediaModel, durationSec = 5) {
  const usd = model.unit === "image" ? model.usd : model.usd * durationSec;
  return { usd, units: toUnits(usd) };
}

export async function createMediaJob(ws: Workspace, input: { kind: MediaKind; prompt: string; model?: string; aspectRatio?: string; durationSec?: number; confirmUnits?: number }) {
  // Higgsfield is the default video route (and the only one unless an OpenRouter model id is chosen explicitly). It always asks
  // for approval of the exact credit amount first (409 "confirm"), and says "not_configured" until its keys exist.
  if (input.kind === "video" && (!input.model || input.model.startsWith("hf/"))) {
    const jobs = await createVideoJobs(ws, { prompt: input.prompt, model: input.model, aspectRatio: input.aspectRatio, durationSec: input.durationSec, confirmUnits: input.confirmUnits });
    return jobs[0];
  }
  if (!createReady()) throw new HttpError(503, "Image and video generation aren't set up yet.", "not_configured");
  const prompt = (input.prompt ?? "").trim().slice(0, 2000);
  if (prompt.length < 3) throw new HttpError(400, "Describe what you want to create.");
  const model = MEDIA_MODELS.find((m) => m.id === input.model && m.kind === input.kind) ?? MEDIA_MODELS.find((m) => m.kind === input.kind)!;
  if (input.kind === "video" && !ws.entitlements.video) throw new EntitlementError("Video generation is available on Pro and Business.", "pro");
  if (model.premium && !ws.entitlements.premiumImages) throw new EntitlementError("That model is available on Plus and above.", "plus");
  const durationSec = input.kind === "video" ? Math.min(Math.max(2, input.durationSec ?? 5), ws.entitlements.maxVideoSeconds) : undefined;
  const est = estimateMedia(model, durationSec);

  const verdict = await moderateText(prompt);
  const base: MediaJob = {
    id: id("med"),
    workspaceId: ws.id,
    kind: input.kind,
    prompt,
    model: model.id,
    params: { aspectRatio: input.aspectRatio ?? (input.kind === "video" ? "16:9" : "1:1"), durationSec },
    status: "queued",
    estimatedUnits: est.units,
    units: null,
    outputKey: null,
    contentType: null,
    createdAt: now(),
    completedAt: null,
  };
  if (!verdict.allowed) {
    // Record the block (audit) but never run it.
    return mediaJobs().insert({ ...base, status: "blocked", error: verdict.reason, completedAt: now() });
  }
  await assertCanSpend(ws, est.units, { paidMedia: true, kind: "media" });
  const job = await mediaJobs().insert(base);
  await enqueue("media.run", { workspaceId: ws.id, jobId: job.id, plan: ws.plan });
  return job;
}

const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

/** A provider-returned URL we are willing to fetch: https, no credentials embedded. */
export function providerUrl(raw: unknown): URL | null {
  try {
    const u = new URL(String(raw));
    return u.protocol === "https:" && !u.username && !u.password ? u : null;
  } catch {
    return null;
  }
}

/** The bearer key goes to openrouter.ai only; any other host (a CDN, a signed storage URL) gets no Authorization. */
export function authFor(u: URL, headers: Record<string, string>): Record<string, string> {
  return u.hostname === "openrouter.ai" ? headers : {};
}

type MediaOut = { key: string; contentType: string; usd?: number };
const openRouterHeaders = () => ({ authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "content-type": "application/json" });

/** Poll interval and the overall video limit (40 polls of 15 s, as before). Tests shorten them. */
export const mediaTiming = { pollMs: 15_000, videoLimitMs: 10 * 60_000, /** Time a poll plus the download may need before the run's deadline. */ reserveMs: 165_000 };

async function runImage(job: MediaJob): Promise<MediaOut> {
  const res = await fetch("https://openrouter.ai/api/v1/images", {
    method: "POST",
    headers: openRouterHeaders(),
    body: JSON.stringify({ model: job.model, prompt: job.prompt, aspect_ratio: job.params.aspectRatio }),
    // Synchronous image generation: some models take most of a minute. A timeout fails the job like any provider error.
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`Image generation failed (${res.status}).`);
  const data = (await res.json()) as { data: { b64_json: string; media_type?: string }[]; usage?: { cost?: number } };
  const ct = data.data[0]?.media_type ?? "image/png";
  const key = `media/${job.workspaceId}/${job.id}.${ct.split("/")[1] ?? "png"}`;
  await blobs().put(key, Buffer.from(data.data[0].b64_json, "base64"), ct);
  return { key, contentType: ct, usd: data.usage?.cost };
}

/** Submits a video once and returns the provider's polling URL (stored on the job, so a resumed run never submits again). */
async function submitVideo(job: MediaJob): Promise<string> {
  const submit = await fetch("https://openrouter.ai/api/v1/videos", {
    method: "POST",
    headers: openRouterHeaders(),
    body: JSON.stringify({ model: job.model, prompt: job.prompt, duration: job.params.durationSec, aspect_ratio: job.params.aspectRatio, resolution: "720p" }),
    signal: AbortSignal.timeout(30_000), // submission only returns a polling URL
  });
  if (!submit.ok) throw new Error(`Video submission failed (${submit.status}).`);
  const { polling_url } = (await submit.json()) as { polling_url: string };
  // Provider-supplied URLs: https only, and the OpenRouter key is only ever sent to openrouter.ai (never to a CDN or any other host).
  const pollUrl = providerUrl(polling_url);
  if (!pollUrl) throw new Error("Video submission returned an unusable polling URL.");
  return pollUrl.href;
}

/**
 * Polls a submitted video until it is done, or returns "pending" when this run is close to its deadline (the queue continues it
 * in a later run, from the stored polling URL). Throws when the provider fails or the overall limit passes.
 */
async function pollVideo(job: MediaJob, pollHref: string, submittedAt: string, ctx: JobContext): Promise<MediaOut | "pending"> {
  const pollUrl = providerUrl(pollHref);
  if (!pollUrl) throw new Error("Video submission returned an unusable polling URL.");
  const headers = openRouterHeaders();
  for (;;) {
    if (Date.now() - Date.parse(submittedAt) > mediaTiming.videoLimitMs) throw new Error("Video generation timed out.");
    if (ctx.deadline - Date.now() < mediaTiming.reserveMs) return "pending";
    await new Promise((r) => setTimeout(r, mediaTiming.pollMs));
    await ctx.heartbeat();
    const pollRes = await fetch(pollUrl, { headers: authFor(pollUrl, headers), signal: AbortSignal.timeout(30_000) });
    if (!pollRes.ok) continue;
    const poll = (await pollRes.json().catch(() => ({ status: "unknown" }))) as { status: string; unsigned_urls?: string[]; usage?: { cost?: number }; error?: string };
    if (poll.status === "failed") throw new Error(poll.error ?? "Video generation failed.");
    if (poll.status === "completed" && poll.unsigned_urls?.[0]) {
      const out = providerUrl(poll.unsigned_urls[0]);
      if (!out) throw new Error("Video generation returned an unusable output URL.");
      const vid = await fetch(out, { headers: authFor(out, headers), signal: AbortSignal.timeout(120_000) });
      if (!vid.ok) throw new Error(`Downloading the video failed (${vid.status}).`);
      if (Number(vid.headers.get("content-length") ?? 0) > MAX_VIDEO_BYTES) throw new Error("The video is too large.");
      const bytes = Buffer.from(await vid.arrayBuffer());
      if (bytes.length > MAX_VIDEO_BYTES) throw new Error("The video is too large.");
      const key = `media/${job.workspaceId}/${job.id}.mp4`;
      await blobs().put(key, bytes, "video/mp4");
      return { key, contentType: "video/mp4", usd: poll.usage?.cost };
    }
  }
}

export const MEDIA_GAVE_UP = "Generation stopped before it finished. Nothing was charged. Please try again.";

/**
 * Durable job (platform/queue.ts): a row in the store, started after the response. If the instance dies mid-run the lease lapses
 * and the reaper resumes it (a video resumes polling the stored URL; it is never submitted twice). After 3 crashed runs the job
 * is marked failed. Users are only charged once the output is stored, so a failed or abandoned job costs nothing.
 */
defineJob(
  "media.run",
  async ({ workspaceId, jobId, plan }, ctx) => {
    const wsId = String(workspaceId);
    let job = await mediaJobs().get(wsId, String(jobId));
    // A "running" job is only picked up again by a resumed run of the queue (its earlier run died or yielded).
    if (!job || !(job.status === "queued" || (job.status === "running" && ctx.resumed))) return;
    if (job.status === "queued") await mediaJobs().update(wsId, job.id, { status: "running" });
    try {
      let out: MediaOut;
      if (job.kind === "image") out = await runImage(job);
      else {
        if (!job.pollUrl) {
          const pollUrl = await submitVideo(job);
          job = (await mediaJobs().update(wsId, job.id, { pollUrl, submittedAt: now() })) ?? { ...job, pollUrl, submittedAt: now() };
        }
        const r = await pollVideo(job, job.pollUrl!, job.submittedAt ?? job.createdAt, ctx);
        if (r === "pending") return { requeue: true, delayMs: mediaTiming.pollMs };
        out = r;
      }
      const post = await moderateMediaOutput(out.key, job.prompt);
      if (!post.allowed) {
        await blobs().removePrefix(out.key);
        await mediaJobs().update(wsId, job.id, { status: "blocked", error: post.reason, completedAt: now() });
        return;
      }
      const { workspaceById } = await import("./platform/workspace");
      const ws = await workspaceById(wsId, plan as Workspace["plan"]);
      if (!ws) throw new Error("Workspace not found.");
      const units = await charge(ws, job.kind === "video" ? "video.generate" : "image.generate", { usd: out.usd ?? estimateMedia(MEDIA_MODELS.find((m) => m.id === job!.model)!, job.params.durationSec).usd, ref: job.id });
      await mediaJobs().update(wsId, job.id, { status: "completed", outputKey: out.key, contentType: out.contentType, units, completedAt: now() });
    } catch (err) {
      await mediaJobs().update(wsId, job.id, { status: "failed", error: err instanceof Error ? err.message : "Generation failed.", completedAt: now() });
    }
  },
  {
    maxAttempts: 3,
    onGiveUp: async ({ workspaceId, jobId }) => {
      const job = await mediaJobs().get(String(workspaceId), String(jobId));
      if (job && (job.status === "queued" || job.status === "running")) await mediaJobs().update(job.workspaceId, job.id, { status: "failed", error: MEDIA_GAVE_UP, completedAt: now() });
    },
  },
);

/** What the API returns for a job: never the provider's polling URL. */
export function publicMediaJob(job: MediaJob) {
  const { pollUrl: _p, submittedAt: _s, ...rest } = job;
  void _p;
  void _s;
  return { ...rest, url: mediaUrl(job) };
}

export function mediaUrl(job: MediaJob) {
  if (job.hf) return videoUrl(job);
  return job.outputKey ? `/api/create/blob/${job.outputKey}` : null;
}
