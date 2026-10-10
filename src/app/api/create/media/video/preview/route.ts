import { body, errorResponse, json } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { previewVideo, type VideoInput } from "@/lib/higgsfield/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Cost preview for the approval step. Reads only: nothing is reserved, submitted or charged. */
export async function POST(req: Request) {
  try {
    const ws = await currentWorkspace(req);
    await rateLimit(`vid:preview:${ws.id}`, 40, 60, { shared: true });
    const input = await body<VideoInput>(req);
    const { items, totalUnits, priceKnown, large, refs, rightsNote } = await previewVideo(ws, input);
    return json({ preview: { items, totalUnits, priceKnown, large, refs, rightsNote } });
  } catch (e) {
    return errorResponse(e);
  }
}
