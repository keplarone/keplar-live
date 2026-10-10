import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { getJob } from "@/lib/images/store";
import { addImageToSite } from "@/lib/images/site-use";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Insert the image into a page of one of your sites (a new site version, undoable). Free: no charge. */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const ws = await currentWorkspace(req);
    await rateLimit(`img:use:${ws.id}`, 20, 60, { shared: true });
    const job = await getJob(ws.id, (await params).id);
    if (!job) throw new HttpError(404, "Image not found.", "not_found");
    const input = await body<{ siteId?: string; page?: string; placement?: string; alt?: string }>(req);
    const r = await addImageToSite(ws, job, { siteId: input.siteId, page: input.page, placement: input.placement, alt: input.alt });
    return json(r);
  } catch (e) {
    return errorResponse(e);
  }
}
