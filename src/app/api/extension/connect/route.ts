/**
 * POST /api/extension/connect {challenge, label} -> {rid, code, url, expiresIn}. The browser extension starts connecting to an
 * account (src/lib/api/extension.ts): no cookies, no account data, only a sign-in request that the person approves on keplar.one.
 */
import { magicLinkSecret } from "@/lib/accounts/auth";
import { ApiError } from "@/lib/api/keys";
import { preflight, v1Failure, v1Json } from "@/lib/api/http";
import { clientIpOf, rateLimit, RateLimitError } from "@/lib/create/platform/ratelimit";
import { connectPath, REQUEST_TTL_SECONDS } from "@/lib/desktop-auth/core";
import { startRequest } from "@/lib/desktop-auth/service";
import { defaultStore } from "@/lib/desktop-auth/store";
import { siteUrl } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

export async function POST(req: Request) {
  try {
    try {
      await rateLimit(`ext:connect:ip:${clientIpOf(req)}`, 20, 600, { shared: true });
    } catch (e) {
      if (e instanceof RateLimitError) throw new ApiError(429, "rate_limited", "Too many attempts. Wait a minute and try again.", e.retryAfterSec);
      throw e;
    }
    const body = (await req.json().catch(() => null)) as { challenge?: unknown; label?: unknown } | null;
    const r = await startRequest({ store: defaultStore(), key: magicLinkSecret() }, { challenge: body?.challenge, label: body?.label, app: "extension" });
    if (!r.ok) throw new ApiError(400, "invalid_request", "Invalid connect request.");
    return v1Json({ rid: r.rid, code: r.code, url: new URL(connectPath(r.rid), process.env.BETTER_AUTH_URL || siteUrl).toString(), expiresIn: REQUEST_TTL_SECONDS });
  } catch (e) {
    return v1Failure(e);
  }
}
