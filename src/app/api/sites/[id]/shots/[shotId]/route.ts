/** One Screen Library screenshot (JPEG). Owner only, private, never indexed. */
import { errorResponse, HttpError } from "@/lib/create/platform/http";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { getSite } from "@/lib/site-builder/store";
import { readShot } from "@/lib/site-builder/qa/shots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; shotId: string }> };

export async function GET(req: Request, { params }: Ctx) {
  try {
    const ws = await currentWorkspace(req);
    const { id, shotId } = await params;
    await getSite(ws, id);
    const s = await readShot(ws, shotId);
    if (!s || s.row.siteId !== id) throw new HttpError(404, "Screenshot not found.", "not_found");
    const download = new URL(req.url).searchParams.get("download") === "1";
    return new Response(new Uint8Array(s.bytes), {
      headers: {
        "content-type": "image/jpeg",
        "cache-control": "private, max-age=3600",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; sandbox",
        "x-robots-tag": "noindex",
        ...(download ? { "content-disposition": `attachment; filename="${s.row.page.replace(/\.html$/, "")}-${s.row.viewport}.jpg"` } : {}),
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
