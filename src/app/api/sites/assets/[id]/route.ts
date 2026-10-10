/** Owner-only read and delete of one product image. Public access is only /i/<id>, and only once a site uses the image. */
import { errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { readAsset, removeAsset } from "@/lib/site-builder/product/assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  try {
    const ws = await currentWorkspace(req);
    const a = await readAsset(ws, (await params).id);
    if (!a) throw new HttpError(404, "Image not found.", "not_found");
    const download = new URL(req.url).searchParams.get("download") === "1";
    const ext = a.contentType === "image/png" ? "png" : a.contentType === "image/webp" ? "webp" : "jpg";
    return new Response(new Uint8Array(a.bytes), {
      headers: {
        "content-type": a.contentType,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; sandbox",
        ...(download ? { "content-disposition": `attachment; filename="${(a.row.name.replace(/\.[a-z0-9]{2,5}$/i, "") || "product").replace(/[^\w.-]+/g, "-")}.${ext}"` } : {}),
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const ws = await currentWorkspace(req);
    const ok = await removeAsset(ws, (await params).id);
    if (!ok) throw new HttpError(404, "Image not found, or it is already used by a site (remove it from the site first).", "not_found");
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
