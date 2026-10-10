/**
 * Browser-side steps of "Create image" in chat, kept free of React so they are tested end to end against the real routes.
 * Everything that matters (plan gate, daily caps, credits, refunds on failure, storage at full quality, moderation) is the
 * server's: /api/images/estimate, /api/images, /api/images/:id. This file only asks them in the right order.
 */
import type { PublicImageJob } from "./store";
import type { ChatImage } from "./chat-types";
import { uploadReference, type SignedRef } from "@/lib/higgsfield/upload-client";

/** Up to this many credits (about 2.5 cents) a picture starts at once and the cost is shown on the card; above it, or with a reference, the person approves first. */
export const AUTO_UNITS = 15;
export const needsApproval = (units: number, hasReference: boolean) => hasReference || units > AUTO_UNITS;

export const REF_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const REF_MAX_BYTES = 10_000_000; // mirrors REF_LIMITS.image on the server, which checks again
export const REF_MAX = 3;
export const RIGHTS_TEXT = "Only use images you own or have permission to use. If a real person appears, they must have agreed. Keplar blocks requests that impersonate real people.";

export class ImgError extends Error {
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
    throw new ImgError("Couldn't reach Keplar. Check your connection and try again.", 0, "network", {});
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ImgError(String(data.error ?? `Request failed (${res.status})`), res.status, typeof data.code === "string" ? data.code : undefined, data);
  return data as T;
}

export type Blocked = NonNullable<ChatImage["blocked"]>;

/** Why a request could not start, in the card's terms. Null when it is something else (shown as a plain failure). */
export function blockedFrom(e: unknown): Blocked | null {
  if (!(e instanceof ImgError)) return null;
  if (e.status === 401) return { reason: "signin", message: "Sign in to create images." };
  if (e.status === 402) return { reason: e.data.upgradeTo ? "plan" : "credits", message: e.message, ...(typeof e.data.upgradeTo === "string" ? { upgradeTo: e.data.upgradeTo } : {}) };
  if (e.status === 503) return { reason: e.code === "not_configured" ? "config" : "paused", message: e.message };
  if (e.status === 429 && (e.code === "daily_limit" || e.code === "cooldown")) return { reason: "limit", message: e.message };
  return null;
}

export type Quote = { units: number; left: number | null; perDay: number | null };

/** What this picture would cost, with the plan gate and the same validation as the real job. Nothing is reserved or charged. */
export async function quote(input: { size: ChatImage["size"]; quality: ChatImage["quality"]; regenerateOf?: string; references?: number }): Promise<Quote> {
  const r = await api<{ estimate: { units: number }; usage: { today: number; perDay: number | null } }>("/api/images/estimate", {
    method: "POST",
    body: JSON.stringify({ size: input.size, quality: input.quality, ...(input.regenerateOf ? { regenerateOf: input.regenerateOf } : {}), ...(input.references ? { referenceCount: input.references } : {}) }),
  });
  const { today, perDay } = r.usage;
  return { units: r.estimate.units, perDay, left: perDay === null ? null : Math.max(0, perDay - today) };
}

/** The pictures to use as a reference, checked in the browser first (the server checks again). */
export function checkSources(files: { name: string; type: string; size: number }[]): string | null {
  if (!files.length) return "There is no image to start from.";
  if (files.length > REF_MAX) return `Up to ${REF_MAX} reference images.`;
  for (const f of files) {
    if (!REF_TYPES.includes(f.type)) return `${f.name || "That image"} is ${f.type === "image/gif" ? "a GIF" : "not a JPEG, PNG or WebP"}. Attach a JPEG, PNG or WebP picture to use it as a reference.`;
    if (f.size > REF_MAX_BYTES) return `${f.name || "That image"} is larger than ${REF_MAX_BYTES / 1_000_000} MB.`;
  }
  return null;
}

/** An earlier picture, as a file, to edit it or make a variation. Full quality: the stored original. */
export async function fetchStored(jobId: string, name = "keplar-image"): Promise<File> {
  const res = await fetch(`/api/images/${encodeURIComponent(jobId)}/file`).catch(() => null);
  if (!res?.ok) throw new ImgError("That picture isn't available any more.", res?.status ?? 0, "not_found", {});
  const blob = await res.blob();
  const type = blob.type || "image/png";
  return new File([blob], `${name}.${type === "image/jpeg" ? "jpg" : type === "image/webp" ? "webp" : "png"}`, { type });
}

/** Uploads the original files (no re-encoding); large ones go straight to storage. */
export async function uploadSources(files: File[]): Promise<SignedRef[]> {
  const problem = checkSources(files);
  if (problem) throw new ImgError(problem, 400, "bad_reference", {});
  const out: SignedRef[] = [];
  for (const f of files) {
    try {
      out.push(await uploadReference(f, "image"));
    } catch (e) {
      throw new ImgError(e instanceof Error ? e.message : "The upload didn't finish.", 400, "bad_reference", {});
    }
  }
  return out;
}

export async function startImage(input: { prompt: string; size: ChatImage["size"]; quality: ChatImage["quality"]; key: string; confirmUnits: number; regenerateOf?: string; references?: SignedRef[]; rights?: boolean }): Promise<PublicImageJob> {
  const r = await api<{ job: PublicImageJob }>("/api/images", {
    method: "POST",
    body: JSON.stringify({
      prompt: input.prompt, size: input.size, quality: input.quality, idempotencyKey: input.key, confirmUnits: input.confirmUnits,
      ...(input.regenerateOf ? { regenerateOf: input.regenerateOf } : {}),
      ...(input.references?.length ? { references: input.references, rightsConfirmed: input.rights === true } : {}),
    }),
  });
  return r.job;
}

export const getJob = (id: string) => api<{ job: PublicImageJob }>(`/api/images/${encodeURIComponent(id)}`).then((r) => r.job);

/** Polls until the picture is ready or failed (the server fails a stuck job after about three minutes). */
export async function waitForJob(id: string, opts: { signal?: AbortSignal; intervalMs?: number; maxMs?: number; onTick?: (j: PublicImageJob) => void } = {}): Promise<PublicImageJob | null> {
  const { signal, intervalMs = 1500, maxMs = 4 * 60_000 } = opts;
  const t0 = Date.now();
  let misses = 0;
  while (!signal?.aborted && Date.now() - t0 < maxMs) {
    try {
      const j = await getJob(id);
      misses = 0;
      opts.onTick?.(j);
      if (j.status === "ready" || j.status === "failed") return j;
    } catch (e) {
      if (e instanceof ImgError && e.status === 404) throw e;
      if (++misses >= 6) throw e; // a few network blips are fine; a dead connection is not
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

export const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k${Date.now()}${Math.random().toString(36).slice(2, 10)}`);

/** The words for a follow-up, from the picture it starts from. */
export function followUpPrompt(kind: "variation" | "edit", original: string, instruction?: string): string {
  if (kind === "edit") return (instruction ?? "").trim();
  return `A fresh variation of this image: keep the subject, style and mood, change the small details. Original description: ${original}`.slice(0, 600);
}

export const SIZE_LABEL: Record<ChatImage["size"], string> = { "1536x1024": "Wide", "1024x1024": "Square", "1024x1536": "Tall" };
