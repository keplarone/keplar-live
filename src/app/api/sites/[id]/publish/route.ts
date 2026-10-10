import { errorResponse, json } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { seedBlogs } from "@/lib/site-builder/features/blog";
import { seedCollections } from "@/lib/site-builder/features/data";
import { getSite, headFiles, publishSite, toSummary, unpublishSite } from "@/lib/site-builder/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  try {
    const ws = await currentWorkspace(req, { team: "publish" });
    await rateLimit(`sb:publish:${ws.id}`, 10, 60, { shared: true });
    const site = await getSite(ws, (await params).id);
    const { site: saved, scan } = await publishSite(ws, site);
    const published = await headFiles(saved);
    await seedBlogs(saved, published).catch(() => undefined);
    await seedCollections(saved, published).catch(() => undefined); // first publish: the tables get the rows the site was generated with
    return json({ site: toSummary(saved, new URL(req.url).origin), scan });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const ws = await currentWorkspace(req, { team: "publish" });
    const site = await getSite(ws, (await params).id);
    return json({ site: toSummary(await unpublishSite(ws, site), new URL(req.url).origin) });
  } catch (e) {
    return errorResponse(e);
  }
}
