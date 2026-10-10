import { errorResponse, json } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { pruneViews, summarize } from "@/lib/site-builder/features/analytics";
import { getSite } from "@/lib/site-builder/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Owner-only visit counts for one site. Real counts from the page views the server saw; nothing is estimated or filled in. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ws = await currentWorkspace(req);
    await rateLimit(`sb:an:${ws.id}`, 60, 60, { shared: true });
    const site = await getSite(ws, (await params).id);
    const days = Number(new URL(req.url).searchParams.get("days") ?? 30);
    await pruneViews(site);
    return json({ ...(await summarize(site, days)), counting: site.featureSettings?.analytics !== false, published: site.publishedVersion !== null });
  } catch (e) {
    return errorResponse(e);
  }
}
