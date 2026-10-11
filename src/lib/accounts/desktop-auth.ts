/**
 * Better Auth plugin: sign in to the Keplar desktop app through the user's own browser. Protocol and state machine:
 * src/lib/desktop-auth/{core,service,store}.ts. Endpoints (under /api/auth):
 *
 *   POST /desktop/start     app      {challenge, label}          -> {rid, code, url, expiresIn}
 *   POST /desktop/approve   browser  {rid}  (signed in, same origin) -> {deepLink}
 *   POST /desktop/deny      browser  {rid}  (same origin)
 *   POST /desktop/poll      app      {rid, verifier}             -> {status, code?}     (fallback when keplar:// is not registered)
 *   POST /desktop/exchange  app      {rid, code, verifier}       -> {ticket}            (single use)
 *   POST /desktop/cancel    app      {rid, verifier}
 *   GET  /desktop/finish?ticket=...  the app's window            -> sets the session cookie, redirects into the app
 *
 * The app endpoints carry no cookies and no secrets of the user; what protects them is the PKCE verifier that never
 * leaves the app. The browser endpoints need the signed-in cookie and our Origin, like every other sign-in action.
 */
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { clientIpOf, rateLimit, RateLimitError } from "@/lib/create/platform/ratelimit";
import { afterSignInPath } from "@/lib/onboarding/redirect";
import { connectPath, DESKTOP_APPS, REQUEST_TTL_SECONDS } from "@/lib/desktop-auth/core";
import { approveRequest, cancelRequest, denyRequest, exchangeCode, pollRequest, redeemTicket, startRequest, type Deps } from "@/lib/desktop-auth/service";
import { isBusinessHost } from "@/lib/business-site";
import { defaultStore } from "@/lib/desktop-auth/store";
import { startSession } from "./session-issue";

type Opts = { secret: string; origin: () => string };

const ipOf = (ctx: { headers?: Headers | null }) => (ctx.headers ? clientIpOf(new Request("http://x", { headers: ctx.headers })) : "local");
const deps = (secret: string): Deps => ({ store: defaultStore(), key: secret });
const obj = (b: unknown) => (b && typeof b === "object" ? (b as Record<string, unknown>) : {});

async function limit(key: string, max: number, windowSec: number) {
  try {
    await rateLimit(key, max, windowSec, { shared: true });
  } catch (e) {
    if (e instanceof RateLimitError) throw new APIError("TOO_MANY_REQUESTS", { message: "Too many attempts. Wait a minute and try again.", code: "RATE_LIMITED" });
    throw e;
  }
}

function sameOrigin(ctx: { headers?: Headers | null; context: { isTrustedOrigin: (o: string) => boolean } }) {
  const origin = ctx.headers?.get("origin");
  if (!origin || !ctx.context.isTrustedOrigin(origin)) throw new APIError("FORBIDDEN", { message: "Invalid origin", code: "INVALID_ORIGIN" });
}

const REASON_TEXT: Record<string, string> = {
  invalid: "This sign-in link isn't valid. Start again from the app.",
  expired: "This sign-in link expired. Start again from the app.",
  used: "This sign-in link was already used. Start again from the app.",
  cancelled: "This sign-in was cancelled. Start again from the app.",
  not_approved: "This sign-in hasn't been approved in the browser yet.",
};

export const desktopAuth = (opts: Opts) => {
  const d = () => deps(opts.secret);
  return {
    id: "desktop-auth",
    endpoints: {
      desktopStart: createAuthEndpoint("/desktop/start", { method: "POST", requireHeaders: true }, async (ctx) => {
        await limit(`desktop:start:ip:${ipOf(ctx)}`, 20, 600);
        const b = obj(ctx.body);
        const r = await startRequest(d(), { challenge: b.challenge, label: b.label, app: b.app });
        if (!r.ok) throw new APIError("BAD_REQUEST", { message: "Invalid sign-in request.", code: "BAD_CHALLENGE" });
        return ctx.json({ rid: r.rid, code: r.code, url: new URL(connectPath(r.rid), opts.origin()).toString(), expiresIn: REQUEST_TTL_SECONDS });
      }),

      desktopApprove: createAuthEndpoint("/desktop/approve", { method: "POST", requireHeaders: true }, async (ctx) => {
        sameOrigin(ctx);
        const { getSession } = await import("./auth");
        const s = ctx.headers ? await getSession(ctx.headers) : null;
        if (!s) throw new APIError("UNAUTHORIZED", { message: "Log in first.", code: "NOT_SIGNED_IN" });
        await limit(`desktop:approve:user:${s.user.id}`, 20, 600);
        const r = await approveRequest(d(), obj(ctx.body).rid, { userId: s.user.id, email: s.user.email, name: s.user.name ?? null });
        if (!r.ok) throw new APIError("BAD_REQUEST", { message: r.reason === "expired" ? REASON_TEXT.expired : r.reason === "closed" ? "This sign-in request is closed. Start again from the app." : REASON_TEXT.invalid, code: `REQUEST_${r.reason.toUpperCase()}` });
        return ctx.json({ deepLink: r.deepLink });
      }),

      desktopDeny: createAuthEndpoint("/desktop/deny", { method: "POST", requireHeaders: true }, async (ctx) => {
        sameOrigin(ctx);
        await limit(`desktop:deny:ip:${ipOf(ctx)}`, 30, 600);
        return ctx.json(await denyRequest(d(), obj(ctx.body).rid));
      }),

      desktopPoll: createAuthEndpoint("/desktop/poll", { method: "POST", requireHeaders: true }, async (ctx) => {
        await limit(`desktop:poll:ip:${ipOf(ctx)}`, 900, 600);
        const b = obj(ctx.body);
        return ctx.json(await pollRequest(d(), b.rid, b.verifier));
      }),

      desktopExchange: createAuthEndpoint("/desktop/exchange", { method: "POST", requireHeaders: true }, async (ctx) => {
        await limit(`desktop:exchange:ip:${ipOf(ctx)}`, 60, 600);
        const b = obj(ctx.body);
        const r = await exchangeCode(d(), { rid: b.rid, code: b.code, verifier: b.verifier });
        if (!r.ok) throw new APIError("BAD_REQUEST", { message: REASON_TEXT[r.reason] ?? REASON_TEXT.invalid, code: `EXCHANGE_${r.reason.toUpperCase()}` });
        return ctx.json({ ticket: r.ticket });
      }),

      desktopCancel: createAuthEndpoint("/desktop/cancel", { method: "POST", requireHeaders: true }, async (ctx) => {
        await limit(`desktop:cancel:ip:${ipOf(ctx)}`, 60, 600);
        const b = obj(ctx.body);
        return ctx.json(await cancelRequest(d(), b.rid, b.verifier));
      }),

      desktopFinish: createAuthEndpoint("/desktop/finish", { method: "GET", requireHeaders: true }, async (ctx) => {
        await limit(`desktop:finish:ip:${ipOf(ctx)}`, 40, 600);
        // Each desktop app gets its session on its own host: Keplar One on keplar.one, Keplar Business on business.keplar.one.
        // A ticket opened on the other host is used up without signing anyone in (only misuse gets there).
        const onBusiness = isBusinessHost((ctx.headers?.get("host") ?? "").toLowerCase().replace(/:\d+$/, "").replace(/\.$/, ""));
        const who = await redeemTicket(d(), (ctx.query as Record<string, unknown> | undefined)?.ticket);
        if (!who || (who.app === "business") !== onBusiness) throw ctx.redirect(onBusiness ? "/?signin=expired" : "/signin?error=desktop_link_used&next=%2Fapp");
        const { userId } = await startSession(ctx, { email: who.email, name: who.name, provider: who.app === "business" ? "desktop-business" : "desktop", remember: true });
        if (who.app === "business") throw ctx.redirect(DESKTOP_APPS.business.home);
        throw ctx.redirect(await afterSignInPath(userId, "/app"));
      }),
    },
    rateLimit: [{ pathMatcher: (p: string) => p.startsWith("/desktop/"), window: 60, max: 120 }],
  } satisfies BetterAuthPlugin;
};
