import { body, errorResponse, json } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { removeVideoJobs } from "@/lib/higgsfield/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Compare: remove the clips you didn't pick (or any finished clip). Already-delivered clips stay charged; running clips can't be removed. */
export async function POST(req: Request) {
  try {
    const ws = await currentWorkspace(req);
    await rateLimit(`vid:rm:${ws.id}`, 30, 60, { shared: true });
    const b = await body<{ ids?: unknown }>(req);
    return json(await removeVideoJobs(ws, b.ids));
  } catch (e) {
    return errorResponse(e);
  }
}
