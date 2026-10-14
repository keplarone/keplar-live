import { errorResponse } from "@/lib/create/platform/http";
import { limitRequest, RateLimitError } from "@/lib/create/platform/ratelimit";
import { auth } from "@/lib/accounts/auth";
import { enabledOAuthProviders } from "@/lib/accounts/oauth";
import { authRedirectPath } from "@/lib/accounts/redirect";
import { welcomePath } from "@/lib/onboarding/model";
import { baseUrl } from "@/lib/space-studio/roblox-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const toSignin = (next: string, error?: string) => new Response(null, { status: 302, headers: { location: `${baseUrl()}/signin?${error ? `error=${error}&` : ""}next=${encodeURIComponent(next)}`, "cache-control": "no-store" } });

/**
 * Starts Google sign-in at once (Space Studio desktop app): GET ?next=/space-studio -> 302 to Google, through Better Auth's own
 * social sign-in (its state/PKCE cookie is passed on). Google comes back to /api/auth/callback/google, which lands on `next` (through
 * /welcome for new accounts, like the "Continue with Google" button). Without Google configured: 302 /signin?next=... instead.
 */
export async function GET(req: Request) {
  const next = authRedirectPath(new URL(req.url).searchParams.get("next"), "/space-studio");
  try {
    await limitRequest(req, "space_google_signin", { perIp: 20 });
    if (!enabledOAuthProviders().google) return toSignin(next);
    const res = await auth.api.signInSocial({
      body: { provider: "google", callbackURL: welcomePath(next), newUserCallbackURL: welcomePath(next), errorCallbackURL: "/signin" },
      headers: req.headers,
      asResponse: true,
    });
    const data = (await res.json().catch(() => null)) as { url?: unknown } | null;
    const url = typeof data?.url === "string" ? data.url : "";
    if (!res.ok || !url.startsWith("https://accounts.google.com/")) return toSignin(next, "oauth");
    const headers = new Headers({ location: url, "cache-control": "no-store" });
    for (const c of res.headers.getSetCookie()) headers.append("set-cookie", c);
    return new Response(null, { status: 302, headers });
  } catch (e) {
    if (e instanceof RateLimitError) return toSignin(next, "rate_limited");
    return errorResponse(e);
  }
}
