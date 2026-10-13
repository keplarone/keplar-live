/**
 * POST /api/extension/token {rid, verifier} -> {status}. The browser extension's poll while the person approves on keplar.one;
 * once approved, the holder of the PKCE verifier gets {status: "connected", key, email}, exactly once (src/lib/api/extension.ts).
 */
import { magicLinkSecret } from "@/lib/accounts/auth";
import { collectConnection } from "@/lib/api/extension";
import { ApiError } from "@/lib/api/keys";
import { preflight, v1Failure, v1Json } from "@/lib/api/http";
import { clientIpOf, rateLimit, RateLimitError } from "@/lib/create/platform/ratelimit";
import { defaultStore } from "@/lib/desktop-auth/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

export async function POST(req: Request) {
  try {
    try {
      await rateLimit(`ext:token:ip:${clientIpOf(req)}`, 900, 600, { shared: true });
    } catch (e) {
      if (e instanceof RateLimitError) throw new ApiError(429, "rate_limited", "Too many attempts. Wait a minute and try again.", e.retryAfterSec);
      throw e;
    }
    const body = (await req.json().catch(() => null)) as { rid?: unknown; verifier?: unknown } | null;
    return v1Json(await collectConnection({ store: defaultStore(), key: magicLinkSecret() }, body?.rid, body?.verifier));
  } catch (e) {
    return v1Failure(e);
  }
}
