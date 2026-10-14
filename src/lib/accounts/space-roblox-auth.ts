/**
 * Better Auth plugin: the callback of "Sign in with Roblox" for Space Studio (flow and rules: src/lib/space-studio/roblox-signin.ts).
 *
 *   GET /api/auth/space-studio/roblox/callback?code&state  -> session for the account the Roblox user is linked to -> redirect to `next`
 *                                                          -> /signin?error=<code>&next=... for anything else (nothing signed in)
 *
 * The session is started with startSession (./session-issue.ts), like the desktop and passkey sign-ins, so it gets the same cookies,
 * session record, new-device notice and two-factor requirement. Roblox tokens are used once to read userinfo and never stored.
 */
import type { BetterAuthPlugin } from "better-auth";
import { createAuthEndpoint } from "better-auth/api";
import { clientIpOf, rateLimit, RateLimitError } from "@/lib/create/platform/ratelimit";
import { afterSignInPath } from "@/lib/onboarding/redirect";
import { finishLink, readFlowState, SIGNIN_BINDING, SIGNIN_FLOW } from "@/lib/space-studio/roblox-oauth";
import { authRedirectPath } from "./redirect";
import { persistenceEnabled, storedUserId } from "./persist";
import { userIdForEmail } from "./magic-token";
import { startSession } from "./session-issue";

export const SPACE_ROBLOX_DEFAULT_NEXT = "/space-studio";

export const spaceRobloxAuth = (opts: { secret: string }) =>
  ({
    id: "space-roblox-signin",
    endpoints: {
      spaceRobloxCallback: createAuthEndpoint("/space-studio/roblox/callback", { method: "GET", requireHeaders: true }, async (ctx) => {
        const q = (ctx.query ?? {}) as Record<string, unknown>;
        const str = (v: unknown) => (typeof v === "string" ? v : null);
        const cookie = ctx.headers?.get("cookie") ?? "";
        const clear = () => ctx.setCookie(SIGNIN_FLOW.cookie, "", { path: SIGNIN_FLOW.path, maxAge: 0, httpOnly: true, sameSite: "lax", secure: SIGNIN_FLOW.redirectUri().startsWith("https://") });
        const fail = (code: string, next = SPACE_ROBLOX_DEFAULT_NEXT): never => {
          clear();
          throw ctx.redirect(`/signin?error=${encodeURIComponent(code)}&next=${encodeURIComponent(next)}`);
        };
        try {
          const ip = ctx.headers ? clientIpOf(new Request("http://x", { headers: ctx.headers })) : "local";
          await rateLimit(`space-roblox-signin:ip:${ip}`, 20, 600, { shared: true });
        } catch (e) {
          if (e instanceof RateLimitError) fail("rate_limited");
          throw e;
        }
        if (!process.env.ROBLOX_OAUTH_CLIENT_ID?.trim() || !process.env.ROBLOX_OAUTH_CLIENT_SECRET?.trim()) fail("roblox_not_configured");
        const st = readFlowState(SIGNIN_FLOW, cookie, SIGNIN_BINDING, str(q.state));
        const next = authRedirectPath(st?.next, SPACE_ROBLOX_DEFAULT_NEXT);
        if (str(q.error)) fail(str(q.error) === "access_denied" ? "access_denied" : "roblox_error", next);
        const code = str(q.code);
        if (!st || !code || code.length > 2048) fail("state_mismatch", next);
        let user;
        try {
          user = await finishLink(code!, st!, { clientId: process.env.ROBLOX_OAUTH_CLIENT_ID!.trim(), clientSecret: process.env.ROBLOX_OAUTH_CLIENT_SECRET!.trim() });
        } catch (e) {
          const c = e instanceof Error && /^[a-z_]+$/.test(e.message) ? e.message : "roblox_error";
          console.warn(`[space-studio] roblox sign-in failed: ${c}`);
          return fail(c, next);
        }
        const { robloxSignInTarget } = await import("@/lib/space-studio/roblox-signin");
        const target = await robloxSignInTarget(user.subject);
        if (!target.ok) return fail(target.code, next);
        // The session must land on the same account the workspace belongs to (accounts are keyed by verified email).
        const expected = (persistenceEnabled() ? await storedUserId(target.email) : null) ?? userIdForEmail(opts.secret, target.email);
        if (expected !== target.userId) return fail("roblox_account_unavailable", next);
        clear();
        const { userId } = await startSession(ctx, { email: target.email, provider: "roblox", remember: true });
        throw ctx.redirect(await afterSignInPath(userId, next));
      }),
    },
    rateLimit: [{ pathMatcher: (p: string) => p.startsWith("/space-studio/"), window: 60, max: 30 }],
  }) satisfies BetterAuthPlugin;
