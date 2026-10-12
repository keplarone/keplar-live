/**
 * POST /api/extension/disconnect (Authorization: Bearer <the connection's key>) -> 204. The browser extension's Disconnect: revokes
 * the connection it holds. A key made by hand is refused (revoke those in Account → Developer API).
 */
import { disconnectExtension } from "@/lib/api/extension";
import { ApiError, bearerOf, looksLikeKey } from "@/lib/api/keys";
import { CORS, preflight, v1Failure } from "@/lib/api/http";
import { clientIpOf, rateLimit, RateLimitError } from "@/lib/create/platform/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

export async function POST(req: Request) {
  try {
    try {
      await rateLimit(`ext:disconnect:ip:${clientIpOf(req)}`, 30, 600, { shared: true });
    } catch (e) {
      if (e instanceof RateLimitError) throw new ApiError(429, "rate_limited", "Too many attempts. Wait a minute and try again.", e.retryAfterSec);
      throw e;
    }
    const token = bearerOf(req);
    if (!token || !looksLikeKey(token)) throw new ApiError(401, "invalid_api_key", "Missing or invalid connection.");
    const r = await disconnectExtension(token);
    if (r === "not_found") throw new ApiError(401, "invalid_api_key", "This connection is already gone.");
    if (r === "not_extension") throw new ApiError(403, "not_extension", "This is a key made by hand. Revoke it in Account → Developer API.");
    return new Response(null, { status: 204, headers: CORS });
  } catch (e) {
    return v1Failure(e);
  }
}
