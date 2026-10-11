/**
 * Better Auth plugin: the last step of the Keplar Business sign-in handoff (protocol: src/lib/business/handoff.ts).
 *
 *   GET /api/auth/business/finish?t=<ticket>&next=/work   on business.keplar.one only
 *       → checks the ticket against this browser's nonce cookie, issues the Business session cookie, redirects to `next`.
 */
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { clientIpOf, rateLimit, RateLimitError } from "@/lib/create/platform/ratelimit";
import { isBusinessHost, safeBusinessNext } from "@/lib/business-site";
import { cookieValue, HANDOFF_NONCE_COOKIE, verifyTicket } from "@/lib/business/handoff";
import { startSession } from "./session-issue";

type Opts = { secret: string };

const hostOfHeaders = (h: Headers | null | undefined) => (h?.get("host") ?? "").toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");

export const businessAuth = (opts: Opts) => ({
  id: "business-auth",
  endpoints: {
    businessFinish: createAuthEndpoint("/business/finish", { method: "GET", requireHeaders: true }, async (ctx) => {
      if (!isBusinessHost(hostOfHeaders(ctx.headers))) throw new APIError("NOT_FOUND", { message: "Not found." });
      try {
        await rateLimit(`business:finish:ip:${ctx.headers ? clientIpOf(new Request("http://x", { headers: ctx.headers })) : "local"}`, 40, 600, { shared: true });
      } catch (e) {
        if (e instanceof RateLimitError) throw new APIError("TOO_MANY_REQUESTS", { message: "Too many attempts. Wait a minute and try again.", code: "RATE_LIMITED" });
        throw e;
      }
      const q = (ctx.query ?? {}) as Record<string, unknown>;
      const check = verifyTicket(opts.secret, q.t, cookieValue(ctx.headers, HANDOFF_NONCE_COOKIE));
      ctx.setCookie(HANDOFF_NONCE_COOKIE, "", { maxAge: 0, path: "/", httpOnly: true, sameSite: "lax", secure: ctx.context.authCookies.sessionToken.attributes.secure });
      // A stale or foreign ticket never loops back into another handoff: the storefront says what happened.
      if (!check.ok) throw ctx.redirect(`/?signin=${check.reason}`);
      // The ticket is minted only from a keplar.one session that already passed its second factor (getSession refuses a session
      // whose mfa_pending is still set), and business.keplar.one has no two-factor page: asking again would leave a 2FA user's
      // Business session pending forever, i.e. signed out in a loop.
      await startSession(ctx, { email: check.user.email, name: check.user.name, provider: "business", remember: true, secondFactorDone: true });
      throw ctx.redirect(safeBusinessNext(q.next));
    }),
  },
  rateLimit: [{ pathMatcher: (p: string) => p.startsWith("/business/"), window: 60, max: 60 }],
}) satisfies BetterAuthPlugin;
