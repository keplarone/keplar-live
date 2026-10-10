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
  if (parts.some((p) => p === ".." || p === "." || p === "")) return new Response("Not found", { status: 404 });
  const key = parts.join("/");
  if (!key.startsWith(`media/${ws.id}/`)) return new Response("Not found", { status: 404 });
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
