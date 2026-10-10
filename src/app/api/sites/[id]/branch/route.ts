import { errorResponse, HttpError, json, body } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { branchFromVersion, getSite, toSummary } from "@/lib/site-builder/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Branch a new draft from any version: { n }. Counts toward the plan's site/app limit; nothing is charged. */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const ws = await currentWorkspace(req, { team: true });
    await rateLimit(`sb:branch:${ws.id}`, 6, 60, { shared: true });
    const site = await getSite(ws, (await params).id);
    const input = await body<{ n?: number }>(req);
    const n = Number(input.n);
    if (!Number.isInteger(n) || n < 1) throw new HttpError(400, "Which version?");
    const copy = await branchFromVersion(ws, site, n);
    return json({ site: toSummary(copy, new URL(req.url).origin) }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
