import { blobs } from "@/lib/create/platform/blob";
import { errorResponse, HttpError } from "@/lib/create/platform/http";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { mediaJobs } from "@/lib/create/repo";
import { playbackSource } from "@/lib/higgsfield/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Plays or downloads a finished video for its owner: Keplar's stored copy, or (where the copy can't be served) Higgsfield's output URL while it is kept. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ws = await currentWorkspace(req);
    const job = await mediaJobs().get(ws.id, (await params).id);
    if (!job || job.status !== "completed" || !job.hf) throw new HttpError(404, "Video not found.", "not_found");
    const src = playbackSource(job);
    if (src.kind === "remote") return new Response(null, { status: 302, headers: { location: src.url, "cache-control": "private, no-store" } });
    if (src.kind === "gone") throw new HttpError(410, "This video is no longer stored. Videos are kept for 7 days.", "expired");
    const b = await blobs().get(src.key);
    if (!b) throw new HttpError(404, "Video not found.", "not_found");
    return new Response(new Uint8Array(b.body), {
      headers: { "content-type": b.contentType, "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; sandbox" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
