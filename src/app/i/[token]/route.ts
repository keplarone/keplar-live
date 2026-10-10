import { createHash } from "node:crypto";
import { BLOB_ID, getPublicImage } from "@/lib/images/blob";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ token: string }> };

/**
 * Public image for published sites: only images the owner added to a site, addressed by an unguessable 128-bit id.
 * Published pages have no cookies, so this is the one unauthenticated image route. Content never changes for an id.
 */
export async function GET(req: Request, { params }: Ctx) {
  const { token } = await params;
  const id = token.replace(/\.(?:webp|png|jpe?g)$/i, "");
  const notFound = () => new Response("Not found", { status: 404, headers: { "cache-control": "public, max-age=60", "x-content-type-options": "nosniff" } });
  if (!BLOB_ID.test(id)) return notFound();
  const etag = `"${createHash("sha1").update(id).digest("hex").slice(0, 20)}"`;
  const base = {
    etag,
    "cache-control": "public, max-age=31536000, immutable",
    "x-content-type-options": "nosniff",
    // Sandboxed (opaque-origin) site pages load this, so it must be readable cross-origin.
    "cross-origin-resource-policy": "cross-origin",
    "x-robots-tag": "noindex",
  };
  const img = await getPublicImage(id).catch(() => null);
  if (!img) return notFound();
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: base });
  return new Response(new Uint8Array(img.bytes), { headers: { ...base, "content-type": img.contentType, "content-length": String(img.bytes.length), "content-security-policy": "default-src 'none'; sandbox" } });
}
