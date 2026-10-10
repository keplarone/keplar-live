/**
 * Image jobs: one row per generation attempt (collection `img_jobs`, tenant-scoped). Regenerating creates a new row in the
 * same history (`rootId`), so every version of an image is kept and can be downloaded or used. Bytes live in blob.ts.
 */
import { createHash } from "node:crypto";
import { collection } from "@/lib/create/platform/store";
import { deleteImage } from "./blob";
import type { ImageQuality, ImageSize } from "./config";

export type ImageStatus = "understanding" | "generating" | "ready" | "failed";

export type ImageJob = {
  id: string;
  workspaceId: string;
  /** First job of this image's history; versions share it. */
  rootId: string;
  parentId: string | null;
  version: number;
  prompt: string;
  size: ImageSize;
  quality: ImageQuality;
  model: string;
  status: ImageStatus;
  estimateUnits: number;
  /** Credits actually charged (null until ready). */
  units: number | null;
  /** Provider cost in USD (internal; never shown to users). */
  usd: number | null;
  errorCode: string | null;
  error: string | null;
  blobId: string | null;
  contentType: string | null;
  bytes: number;
  usedIn: { siteId: string; siteName: string; page: string; at: string }[];
  /** Image-to-image: public URLs of the references (server side only; never in publicJob) and the user's rights confirmation. */
  referenceUrls?: string[];
  /** Options the user chose for this image (model id, seed, negative prompt). */
  choice?: { model?: string; seed?: number; negativePrompt?: string };
  rightsConfirmedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export const imageJobs = () => collection<ImageJob>("img_jobs");

/** Same key from the same account = same job, so a retried request never generates (or charges) twice. */
export const jobIdFor = (workspaceId: string, key: string) => `img_${createHash("sha256").update(`${workspaceId}\n${key}`).digest("hex").slice(0, 24)}`;
export const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,80}$/;

/** A job that never finished (function killed) is failed after this, so the UI never waits forever. */
export const STALE_MS = 170_000;

export const TERMINAL = (s: ImageStatus) => s === "ready" || s === "failed";

export function publicJob(j: ImageJob) {
  return {
    id: j.id,
    rootId: j.rootId,
    parentId: j.parentId,
    version: j.version,
    prompt: j.prompt,
    size: j.size,
    quality: j.quality,
    status: j.status,
    estimateUnits: j.estimateUnits,
    units: j.units,
    error: j.error,
    errorCode: j.errorCode,
    url: j.status === "ready" && j.blobId ? `/api/images/${j.id}/file` : null,
    bytes: j.bytes,
    usedIn: j.usedIn,
    createdAt: j.createdAt,
    startedAt: j.startedAt,
    finishedAt: j.finishedAt,
  };
}
export type PublicImageJob = ReturnType<typeof publicJob>;

/** Marks a long-silent in-flight job failed (no charge happens before READY). */
export async function reapIfStale(j: ImageJob, at = Date.now()): Promise<ImageJob> {
  if (TERMINAL(j.status) || at - Date.parse(j.updatedAt) < STALE_MS) return j;
  const t = new Date(at).toISOString();
  const next = await imageJobs().update(j.workspaceId, j.id, {
    status: "failed",
    errorCode: "timeout",
    error: "This took too long and was stopped. Nothing was charged. Try again.",
    updatedAt: t,
    finishedAt: t,
  });
  return next ?? j;
}

export async function listJobs(workspaceId: string): Promise<ImageJob[]> {
  const rows = await imageJobs().list(workspaceId);
  const out = await Promise.all(rows.map((r) => reapIfStale(r)));
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getJob(workspaceId: string, id: string): Promise<ImageJob | null> {
  const j = await imageJobs().get(workspaceId, id);
  return j ? reapIfStale(j) : null;
}

/** Usage figures behind the caps (counts only jobs that are READY or still running). */
export function usageOf(rows: ImageJob[], at = Date.now()) {
  const day = at - 86_400_000;
  const live = rows.filter((r) => r.status === "ready" || r.status === "understanding" || r.status === "generating");
  return {
    today: live.filter((r) => Date.parse(r.createdAt) >= day).length,
    highToday: live.filter((r) => r.quality === "high" && Date.parse(r.createdAt) >= day).length,
    stored: rows.filter((r) => r.status === "ready" && r.blobId).length,
    storedBytes: rows.reduce((t, r) => t + (r.status === "ready" ? r.bytes : 0), 0),
    running: rows.filter((r) => r.status === "understanding" || r.status === "generating").length,
  };
}

const COUNTED_FAILURES = new Set(["refused", "busy", "timeout", "bad_output", "server"]);

/** Recent failures in a row (retry-storm guard). Returns when the oldest counted failure leaves the window. */
export function recentFailures(rows: ImageJob[], windowMs: number, at = Date.now()) {
  const f = rows.filter((r) => r.status === "failed" && COUNTED_FAILURES.has(r.errorCode ?? "") && at - Date.parse(r.finishedAt ?? r.updatedAt) < windowMs).sort((a, b) => (a.finishedAt ?? "").localeCompare(b.finishedAt ?? ""));
  return { count: f.length, clearsAt: f[0] ? Date.parse(f[0].finishedAt ?? f[0].updatedAt) + windowMs : 0 };
}

export async function deleteJob(j: ImageJob) {
  if (j.blobId) await deleteImage(j.workspaceId, j.blobId);
  await imageJobs().remove(j.workspaceId, j.id);
}
