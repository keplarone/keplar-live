import { addDomain, listForSite } from "@/lib/domains/service";
import { errorResponse, HttpError, json, body } from "@/lib/create/platform/http";
import { currentWorkspace } from "@/lib/create/platform/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/domains?siteId=… : the domains of one of your sites, your allowance and whether the feature is configured. */
export async function GET(req: Request) {
  try {
    const ws = await currentWorkspace(req);
    const siteId = new URL(req.url).searchParams.get("siteId");
    if (!siteId) throw new HttpError(400, "siteId is required.");
    return json(await listForSite(ws, siteId));
  } catch (e) {
    return errorResponse(e);
  }
}

/** POST /api/domains {siteId, domain} */
export async function POST(req: Request) {
  try {
    const ws = await currentWorkspace(req);
    const { siteId, domain } = await body<{ siteId?: string; domain?: string }>(req);
    if (typeof siteId !== "string" || !siteId) throw new HttpError(400, "siteId is required.");
    return json({ domain: await addDomain(ws, siteId, domain) }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
