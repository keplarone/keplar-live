import { errorResponse } from "@/lib/create/platform/http";
import { limitRequest, RateLimitError } from "@/lib/create/platform/ratelimit";
import { authRedirectPath } from "@/lib/accounts/redirect";
import { robloxOAuthConfigured } from "@/lib/space-studio/account";
import { baseUrl, beginFlow, SIGNIN_BINDING, SIGNIN_FLOW } from "@/lib/space-studio/roblox-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const toSignin = (next: string, error: string) => new Response(null, { status: 302, headers: { location: `${baseUrl()}/signin?error=${error}&next=${encodeURIComponent(next)}`, "cache-control": "no-store" } });

/**
 * "Sign in with Roblox" (Space Studio desktop app): GET ?next=/space-studio -> 302 to Roblox OAuth (openid profile, PKCE S256).
 * Roblox comes back to /api/auth/space-studio/roblox/callback (src/lib/accounts/space-roblox-auth.ts), which signs in the Keplar
 * account the Roblox user is linked to, or sends the person to /signin?error=roblox_not_linked. Always a redirect, never a page,
 * so the desktop sign-in window stays open until the flow ends. `next` must be a same-site path (default /space-studio).
 */
export async function GET(req: Request) {
  const next = authRedirectPath(new URL(req.url).searchParams.get("next"), "/space-studio");
  try {
    await limitRequest(req, "space_roblox_signin", { perIp: 20 });
    if (!robloxOAuthConfigured()) return toSignin(next, "roblox_not_configured");
    let started: ReturnType<typeof beginFlow>;
    try {
      started = beginFlow(SIGNIN_FLOW, SIGNIN_BINDING, process.env.ROBLOX_OAUTH_CLIENT_ID!.trim(), { next });
    } catch {
      return toSignin(next, "roblox_not_configured");
    }
    return new Response(null, { status: 302, headers: { location: started.url, "set-cookie": started.cookie, "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof RateLimitError) return toSignin(next, "rate_limited");
    return errorResponse(e);
  }
}
