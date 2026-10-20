import { errorResponse } from "@/lib/create/platform/http";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { openDesktopAsset } from "@/lib/desktop/releases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/desktop/download?product=one|business&tag=v1.2.3&file=Keplar-One-...
 * Serves one installer (or SHA256SUMS) when GITHUB_RELEASES_TOKEN is set, so a private desktop repo can still be downloaded.
 * The browser is redirected to GitHub's short-lived asset URL. The token never leaves the server. Without the token, 404.
 */
export async function GET(req: Request) {
  try {
    await limitRequest(req, "desktop_download", { perIp: 60 });
  } catch (e) {
    return errorResponse(e);
  }
  const url = new URL(req.url);
  const product = url.searchParams.get("product");
  if (product !== "one" && product !== "business") {
    return new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  }
  return openDesktopAsset(product, url.searchParams.get("tag") ?? "", url.searchParams.get("file") ?? "");
}
