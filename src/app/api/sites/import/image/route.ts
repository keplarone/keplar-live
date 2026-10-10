/**
 * Product import from a photo. The body is the image itself (raw bytes, `x-file-name` header). The original is stored per
 * workspace at full quality (see product/image.ts for the only cases where bytes change) and stays private until a site uses it.
 */
import { errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { MAX_ASSET_BYTES } from "@/lib/site-builder/product/limits";
import { importFromImage } from "@/lib/site-builder/product/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const ws = await currentWorkspace(req);
    await rateLimit(`sb:import:image:${ws.id}`, 12, 60, { shared: true });
    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > MAX_ASSET_BYTES + 200_000) throw new HttpError(413, "That image is too large to upload here (4 MB). Keplar reduces large photos in your browser first; try again.", "too_large");
    const bytes = Buffer.from(await req.arrayBuffer());
    if (bytes.length === 0) throw new HttpError(400, "No image was received.", "empty");
    if (bytes.length > MAX_ASSET_BYTES + 200_000) throw new HttpError(413, "That image is too large to upload here (4 MB). Keplar reduces large photos in your browser first; try again.", "too_large");
    let name = "product";
    try {
      name = decodeURIComponent(req.headers.get("x-file-name") ?? "product");
    } catch {
      /* keep the default */
    }
    return json(await importFromImage(ws, bytes, name));
  } catch (e) {
    return errorResponse(e);
  }
}
