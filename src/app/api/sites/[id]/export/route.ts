import { errorResponse, HttpError } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { getSite, headFiles } from "@/lib/site-builder/store";
import { watermarkFiles, watermarkRequired } from "@/lib/site-builder/watermark";
import { makeZip } from "@/lib/site-builder/zip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const README = (name: string, watermark = false) => `${name}\n${"=".repeat(name.length)}\n\nStatic site exported from Keplar. Open index.html in a browser, or upload the folder to any static host.\nThe site uses plain HTML and CSS (no JavaScript). Contact forms only work on Keplar-hosted sites, because they save to your Keplar lead inbox; point each <form> at your own form service when you host it elsewhere.\n${watermark ? "\nEach page ends with a small \"Made with Keplar\" link. Plus and above export without it.\n" : ""}`;

export async function GET(req: Request, { params }: Ctx) {
  try {
    const ws = await currentWorkspace(req, { team: true });
    await rateLimit(`sb:export:${ws.id}`, 10, 60, { shared: true });
    const site = await getSite(ws, (await params).id);
    const files = await headFiles(site);
    if (!files["index.html"]) throw new HttpError(409, "Build something first.", "conflict");
    // Free/Lite exports carry the "Made with Keplar" strip in every page; Plus and above are exported clean (plan read now, not from the site).
    const zip = makeZip({ ...watermarkFiles(files, ws.plan), "README.txt": README(site.name, watermarkRequired(ws.plan)) });
    return new Response(new Uint8Array(zip), { headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${site.slug}.zip"`, "cache-control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
