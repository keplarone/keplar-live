import { createMediaJob, MEDIA_MODELS, estimateMedia, mediaUrl } from "@/lib/create/media";
import { errorResponse, json, body } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { mediaJobs } from "@/lib/create/repo";
import type { MediaKind } from "@/lib/create/types";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const ws = (await currentWorkspace(req));
    const jobs = (await mediaJobs().list(ws.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 60);
    const models = MEDIA_MODELS.map((m) => ({
      ...m,
      estimateUnits: estimateMedia(m, m.kind === "video" ? 5 : undefined).units,
      available: m.kind === "video" ? ws.entitlements.video && (!m.premium || ws.entitlements.premiumImages) : !m.premium || ws.entitlements.premiumImages,
    }));
    return json({ jobs: jobs.map((j) => ({ ...j, url: mediaUrl(j) })), models, entitlements: { video: ws.entitlements.video, maxVideoSeconds: ws.entitlements.maxVideoSeconds } });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const ws = (await currentWorkspace(req));
    await rateLimit(`${ws.id}:media`, Math.max(5, Math.floor(ws.entitlements.rpm / 2)));
    const input = await body<{ kind: MediaKind; prompt: string; model?: string; aspectRatio?: string; durationSec?: number; confirmUnits?: number }>(req);
    const job = await createMediaJob(ws, { ...input, kind: input.kind === "video" ? "video" : "image" });
    return json({ job: { ...job, url: mediaUrl(job) } }, { status: job.status === "blocked" ? 422 : 202 });
  } catch (e) {
    return errorResponse(e);
  }
}
