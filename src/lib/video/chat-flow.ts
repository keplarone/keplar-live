/**
 * Browser-side steps of a chat video. The server owns the plan gate, credits, moderation and the Higgsfield job
 * (/api/create/media/video and /api/create/media/:id). This file only asks them in the right order.
 */
import type { ChatAspect } from "./chat-intent";
import type { ChatVideo } from "./chat-types";

/** Same sentence as UPGRADE_MESSAGE in src/lib/higgsfield/video.ts. Kept here so the chat card does not import the server pipeline. */
export const VIDEO_PLAN_MESSAGE = "Video generation is part of Keplar Pro and Business, because every clip costs real money to make.";

export class VidError extends Error {
  constructor(message: string, public status: number, public code: string | undefined, public data: Record<string, unknown>) {
    super(message);
  }
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers });
  } catch {
    throw new VidError("Couldn't reach Keplar. Check your connection and try again.", 0, "network", {});
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new VidError(String(data.error ?? `Request failed (${res.status})`), res.status, typeof data.code === "string" ? data.code : undefined, data);
  return data as T;
}

export type Blocked = NonNullable<ChatVideo["blocked"]>;

export function blockedFrom(e: unknown): Blocked | null {
  if (!(e instanceof VidError)) return null;
  if (e.status === 401) return { reason: "signin", message: VIDEO_PLAN_MESSAGE, upgradeTo: "pro" };
  if (e.status === 402) return { reason: e.data.upgradeTo ? "plan" : "credits", message: e.message, ...(typeof e.data.upgradeTo === "string" ? { upgradeTo: e.data.upgradeTo } : {}) };
  if (e.status === 503) return { reason: e.code === "not_configured" ? "config" : "paused", message: e.message };
  if (e.status === 429 && (e.code === "daily_limit" || e.code === "cooldown" || e.code === "too_many_jobs" || e.code === "rate_limited")) return { reason: "limit", message: e.message };
  return null;
}

export type VideoConfigModel = {
  id: string;
  default?: boolean;
  mode: string;
  durations: number[] | null;
  aspectRatios: string[];
};

export type VideoConfig = {
  available: boolean;
  configured: boolean;
  message: string | null;
  upgradeTo: string | null;
  defaultModel: string;
  maxSeconds: number;
  models: VideoConfigModel[];
};

export async function loadVideoConfig(): Promise<VideoConfig> {
  const r = await api<{ config: VideoConfig }>("/api/create/media/video");
  return r.config;
}

/** The text-to-video model chat uses: the marked default, else the first text-to-video model. */
export function chatModel(config: VideoConfig): VideoConfigModel | null {
  const text = config.models.filter((m) => m.mode === "text-to-video");
  return text.find((m) => m.id === config.defaultModel) ?? text.find((m) => m.default) ?? text[0] ?? null;
}

export type Quote = { units: number; large: boolean; durationSec: number; aspectRatio: string; modelId: string };

export async function quoteVideo(input: { prompt: string; aspect: ChatAspect; durationSec: number; modelId: string }): Promise<Quote> {
  const r = await api<{ preview: { items: { modelId: string; durationSec: number | null; units: number | null; problem: string | null }[]; totalUnits: number | null; priceKnown: boolean; large: boolean } }>("/api/create/media/video/preview", {
    method: "POST",
    body: JSON.stringify({ prompt: input.prompt, model: input.modelId, durationSec: input.durationSec, aspectRatio: input.aspect, count: 1 }),
  });
  const item = r.preview.items[0];
  if (!item || item.problem) throw new VidError(item?.problem ?? "That length or shape isn't available.", 400, "model_unavailable", {});
  if (!r.preview.priceKnown || r.preview.totalUnits === null || item.durationSec === null) throw new VidError("The price for this video isn't available yet, so Keplar won't start it.", 409, "price_tbd", {});
  return { units: r.preview.totalUnits, large: r.preview.large, durationSec: item.durationSec, aspectRatio: input.aspect, modelId: item.modelId };
}

export type Started = { id: string; status: string; url: string | null; units: number | null; estimatedUnits: number; error?: string; params: { aspectRatio: string; durationSec?: number } };

export async function startVideo(input: { prompt: string; aspect: ChatAspect; durationSec: number; modelId: string; key: string; confirmUnits: number; acknowledgeLarge?: boolean }): Promise<Started> {
  const r = await api<{ jobs: Started[] }>("/api/create/media/video", {
    method: "POST",
    body: JSON.stringify({
      prompt: input.prompt, model: input.modelId, durationSec: input.durationSec, aspectRatio: input.aspect,
      count: 1, confirmUnits: input.confirmUnits, idempotencyKey: input.key, ...(input.acknowledgeLarge ? { acknowledgeLarge: true } : {}),
    }),
  });
  const job = r.jobs[0];
  if (!job) throw new VidError("The video didn't start. Nothing was charged.", 500, "server", {});
  return job;
}

export const getVideo = (id: string) => api<{ job: Started }>(`/api/create/media/${encodeURIComponent(id)}`).then((r) => r.job);

export async function cancelVideo(id: string): Promise<void> {
  await api(`/api/create/media/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** Polls until the clip is finished or the caller aborts. The server stops a stuck job. */
export async function waitForVideo(id: string, opts: { signal?: AbortSignal; intervalMs?: number; maxMs?: number; onTick?: (j: Started) => void } = {}): Promise<Started | null> {
  const { signal, intervalMs = 3000, maxMs = 26 * 60_000 } = opts;
  const t0 = Date.now();
  let misses = 0;
  while (!signal?.aborted && Date.now() - t0 < maxMs) {
    try {
      const j = await getVideo(id);
      misses = 0;
      opts.onTick?.(j);
      if (j.status === "completed" || j.status === "failed" || j.status === "blocked") return j;
    } catch (e) {
      if (signal?.aborted) return null;
      misses += 1;
      if (misses >= 5) throw e;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return signal?.aborted ? null : null;
}

export const newVideoKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k${Date.now()}${Math.random().toString(36).slice(2, 10)}`);
