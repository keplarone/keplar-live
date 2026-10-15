import path from "node:path";
import { blobs } from "@/lib/create/platform/blob";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { errorResponse } from "@/lib/create/platform/http";

export const runtime = "nodejs";

/** Serves generated media for the current workspace only. Production: signed R2 URLs on the user-content domain. */
export async function GET(req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  let ws;
  try {
    ws = await currentWorkspace(req);
  } catch (e) {
    return errorResponse(e); // signed out is a clean 401, not an unhandled 500
  }
  const parts = (await params).key;
  // Segments arrive URL-decoded, so "..%2F" is the single segment "../". Refuse any segment that is empty or "." or holds a
  // separator ("/" or "\"), "..", or a NUL; then normalize exactly as the blob store does and check the owner prefix on THAT key.
  if (!parts.length || parts.some((p) => p === "" || p === "." || /[/\\\0]|\.\./.test(p))) return new Response("Not found", { status: 404 });
  const raw = parts.join("/");
  const key = path.posix.normalize(raw).replace(/^\/+/, "");
  if (key !== raw || !key.startsWith(`media/${ws.id}/`)) return new Response("Not found", { status: 404 });
  const b = await blobs().get(key);
  if (!b) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(b.body), {
    headers: {
      "content-type": b.contentType,
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
