import { createHash } from "node:crypto";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { errorResponse, HttpError } from "@/lib/create/platform/http";
import { getImage } from "@/lib/images/blob";
import { getJob } from "@/lib/images/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const EXT: Record<string, string> = { "image/webp": "webp", "image/png": "png", "image/jpeg": "jpg" };
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "image";

/** The owner's image bytes. Authenticated; the content never changes for an id, so browsers may cache it (private). */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const ws = await currentWorkspace(req);
    const job = await getJob(ws.id, (await params).id);
    if (!job || job.status !== "ready" || !job.blobId) throw new HttpError(404, "Image not found.", "not_found");
    const etag = `"${createHash("sha1").update(job.blobId).digest("hex").slice(0, 20)}"`;
    const base = { etag, "cache-control": "private, max-age=31536000, immutable", "x-content-type-options": "nosniff", vary: "Cookie" };
    if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: base });
    const img = await getImage(ws.id, job.blobId);
    if (!img) throw new HttpError(404, "Image not found.", "not_found");
    const download = new URL(req.url).searchParams.get("download") === "1";
    return new Response(new Uint8Array(img.bytes), {
      headers: {
        ...base,
        "content-type": img.contentType,
        "content-length": String(img.bytes.length),
        "content-security-policy": "default-src 'none'; sandbox",
        ...(download ? { "content-disposition": `attachment; filename="keplar-${slug(job.prompt)}-v${job.version}.${EXT[img.contentType] ?? "png"}"` } : {}),
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
