import { errorResponse, json } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { duplicateSite, getSite, toSummary } from "@/lib/site-builder/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Copy a site's current version into a new draft (counts toward the plan's site limit; nothing is charged). */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const ws = await currentWorkspace(req, { team: true });
    await rateLimit(`sb:dup:${ws.id}`, 6, 60, { shared: true });
    const site = await getSite(ws, (await params).id);
    const copy = await duplicateSite(ws, site);
    return json({ site: toSummary(copy, new URL(req.url).origin) }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
