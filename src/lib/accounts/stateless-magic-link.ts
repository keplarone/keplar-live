/**
 * Better Auth plugin: magic-link sign-in that needs no database.
 *
 * - POST /api/auth/sign-in/magic-link  (same body as Better Auth's magicLink
 *   plugin, so `authClient.signIn.magicLink` keeps working) mails a signed,
 *   15-minute link to /signin/verify?token=… (a landing page, not an API).
 * - The landing page only checks the token; nothing is consumed on GET, so
 *   email-client link scanners/prefetchers can't burn it.
 * - POST /api/auth/magic-link/confirm {token} (the page's "Sign in" button)
 *   verifies the HMAC + expiry, marks it used, and sets Better Auth's session
 *   cookies. With no `database` configured Better Auth runs stateless: the
 *   session lives in an encrypted (JWE) cookie that every instance can read.
 * - The user record is derived from the email (stable id), emailVerified:true
 *   because the link proved the address.
 */
import type { BetterAuthPlugin } from "better-auth";
import { createAuthEndpoint, formCsrfMiddleware, APIError } from "better-auth/api";
import { createAuthMiddleware } from "better-auth/api";
import { clientIpOf, rateLimit, RateLimitError } from "@/lib/create/platform/ratelimit";
import { dropUnverifiedCredential } from "./credentials";
import { checkMailDomain, mailDomainOf } from "./email-domain";
import { badMailDomain } from "./email-check";
import { consumeMagicToken, createMagicToken, MAGIC_LINK_TTL_SECONDS, randomToken, userIdForEmail, verifyMagicToken } from "./magic-token";
import { afterSignInPath } from "@/lib/onboarding/redirect";
import { claimMagicJti, createSessionRecord, ipFromHeaders, persistenceEnabled, revokeSession, SESSION_TTL_SECONDS, SHORT_SESSION_TTL_SECONDS, upsertUser } from "./persist";
import { noticeIfNewDevice } from "./new-device";
import { mfaEnabled } from "./mfa/store";
import { cookieSessionOf, dropPendingCookies, hasCookie, issueSessionCookies, REMEMBER_COOKIE, rememberFromRequest } from "./session-cookies";
import { forgetSession, guardSession } from "./session-guard";
import { stashPreviousAccount } from "./multi-ctx";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Store the new session server-side and retire the one this browser held before (session-id rotation). */
export async function recordSignIn(a: { session: { id: string; createdAt: Date }; userId: string; email?: string; headers: Headers | null | undefined; provider: string; remember: boolean; previousId?: string; secondFactorDone?: boolean }) {
  if (!persistenceEnabled()) return;
  // Before the new row exists, so "have we seen this device?" compares against earlier sign-ins only.
  if (a.email) await noticeIfNewDevice({ userId: a.userId, email: a.email, headers: a.headers, provider: a.provider });
  // 2FA: a session for an account with a second factor stays unusable until the code is checked (see ./mfa).
  const mfaPending = a.secondFactorDone ? false : await mfaEnabled(a.userId);
  try {
    await createSessionRecord({ id: a.session.id, userId: a.userId, mfaPending, userAgent: a.headers?.get("user-agent"), ip: ipFromHeaders(a.headers), provider: a.provider, remember: a.remember, createdAt: a.session.createdAt });
    if (a.previousId && a.previousId !== a.session.id) {
      await revokeSession(a.previousId, a.userId);
      forgetSession(a.previousId);
    }
  } catch {
    // A session id without a row is refused (persist.ts validateSession), so don't answer "signed in" with a dead cookie.
    console.error("[auth] could not save the session record; the sign-in is refused");
    throw new APIError("SERVICE_UNAVAILABLE", { message: "We couldn't finish signing you in. Try again in a minute.", code: "SESSION_STORE_UNAVAILABLE" });
  }
}

export type StatelessMagicLinkOptions = {
  secret: string;
  sendMagicLink: (data: { email: string; url: string; expiresInMinutes: number }) => Promise<void>;
};

export const statelessMagicLink = (opts: StatelessMagicLinkOptions) =>
  ({
    id: "stateless-magic-link",
    endpoints: {
      signInMagicLink: createAuthEndpoint(
        "/sign-in/magic-link",
        {
          method: "POST",
          requireHeaders: true,
          use: [formCsrfMiddleware],
        },
        async (ctx) => {
          const body = (ctx.body ?? {}) as Record<string, unknown>;
          const email = typeof body.email === "string" ? body.email.trim() : "";
          if (!EMAIL.test(email) || email.length > 254) throw new APIError("BAD_REQUEST", { message: "Enter a valid email address.", code: "INVALID_EMAIL" });
          // Per email (anyone can ask for a link to an address) and per IP+email, on top of the per-IP plugin limit.
          // Shared across instances (Upstash, else Postgres), like the password endpoints: per-instance memory would let a
          // flood spread over Vercel's instances multiply the limit.
          const key = email.toLowerCase();
          const ip = ctx.headers ? clientIpOf(new Request("http://x", { headers: ctx.headers })) : "local";
          try {
            await rateLimit(`magic:email:${key}`, 3, 600, { shared: true });
            await rateLimit(`magic:ipemail:${ip}:${key}`, 2, 60, { shared: true });
            await rateLimit(`magic:ip:${ip}`, 10, 600, { shared: true });
          } catch (e) {
            if (e instanceof RateLimitError) throw new APIError("TOO_MANY_REQUESTS", { message: "Too many sign-in emails requested. Try again in a few minutes.", code: "RATE_LIMITED" });
            throw e;
          }
          if ((await checkMailDomain(mailDomainOf(email))) === "no_mail") throw badMailDomain(email);
          const name = typeof body.name === "string" ? body.name : undefined;
          const callbackURL = typeof body.callbackURL === "string" ? body.callbackURL : undefined;
          const remember = body.remember !== false;
          const { token } = createMagicToken(opts.secret, { email, name, callbackURL, remember });
          const origin = new URL(ctx.context.baseURL || "http://localhost:3000").origin;
          const url = new URL("/signin/verify", origin);
          url.searchParams.set("token", token);
          await opts.sendMagicLink({ email, url: url.toString(), expiresInMinutes: MAGIC_LINK_TTL_SECONDS / 60 });
          return ctx.json({ status: true });
        },
      ),
      confirmMagicLink: createAuthEndpoint(
        "/magic-link/confirm",
        {
          method: "POST",
          requireHeaders: true,
          use: [formCsrfMiddleware],
        },
        async (ctx) => {
          // Login-CSRF guard: a browser POST always carries Origin; it must be ours.
          const origin = ctx.headers?.get("origin");
          if (origin && !ctx.context.isTrustedOrigin(origin)) throw new APIError("FORBIDDEN", { message: "Invalid origin", code: "INVALID_ORIGIN" });
          const token = (ctx.body as { token?: unknown } | undefined)?.token;
          const checked = verifyMagicToken(opts.secret, typeof token === "string" ? token : null);
          if (checked.ok && persistenceEnabled()) {
            try {
              const fresh = await claimMagicJti(checked.payload.jti, checked.payload.exp);
              if (!fresh) throw new APIError("BAD_REQUEST", { message: "This link was already used.", code: "MAGIC_LINK_USED" });
            } catch (e) {
              if (e instanceof APIError) throw e;
              throw new APIError("BAD_REQUEST", { message: "This link isn't valid.", code: "MAGIC_LINK_USED" });
            }
          }
          const res = consumeMagicToken(opts.secret, typeof token === "string" ? token : null);
          if (!res.ok) {
            throw new APIError("BAD_REQUEST", { message: res.reason === "expired" ? "This link has expired." : res.reason === "used" ? "This link was already used." : "This link isn't valid.", code: `MAGIC_LINK_${res.reason.toUpperCase()}` });
          }
          const { e: email, n: name, cb } = res.payload;
          const remember = res.payload.r !== 0;
          const ip = ctx.headers ? clientIpOf(new Request("http://x", { headers: ctx.headers })) : "local";
          try {
            await rateLimit(`confirm:ip:${ip}`, 20, 60, { shared: true });
          } catch (e) {
            if (e instanceof RateLimitError) throw new APIError("TOO_MANY_REQUESTS", { message: "Too many attempts. Try again in a minute.", code: "RATE_LIMITED" });
            throw e;
          }
          const now = new Date();
          let userId = userIdForEmail(opts.secret, email);
          let displayName = name || "";
          let createdAt = now;
          if (persistenceEnabled()) {
            try {
              const u = await upsertUser({ email, name, provider: "magic-link", id: userId });
              userId = u.id;
              displayName = u.name || displayName;
              createdAt = new Date(u.createdAt);
              // The link proved this address: a pending password sign-up for it (maybe someone else's) must not survive.
              await dropUnverifiedCredential(email).catch(() => undefined);
            } catch {
              console.error("[auth] could not save the user record; continuing with a cookie-only session");
            }
          }
          const user = { id: userId, email, emailVerified: true, name: displayName, image: null, createdAt, updatedAt: now };
          // A fresh random session id on every sign-in (never reused from an earlier cookie).
          const session = {
            id: randomToken(16),
            token: randomToken(24),
            userId,
            expiresAt: new Date(now.getTime() + (remember ? SESSION_TTL_SECONDS : SHORT_SESSION_TTL_SECONDS) * 1000),
            createdAt: now,
            updatedAt: now,
            ipAddress: null,
            userAgent: ctx.headers?.get("user-agent")?.slice(0, 300) ?? null,
          };
          const previous = await cookieSessionOf(ctx, ctx.headers);
          await stashPreviousAccount(ctx, email);
          await issueSessionCookies(ctx, { session, user }, remember);
          await recordSignIn({ session, userId, headers: ctx.headers, provider: "magic-link", email, remember, previousId: previous?.id });
          return ctx.json({ status: true, redirectTo: persistenceEnabled() ? await afterSignInPath(userId, cb) : cb });
        },
      ),
    },
    hooks: {
      before: [
        {
          // The HTTP session endpoint honours revocation too.
          matcher: (c) => c.path === "/get-session",
          handler: createAuthMiddleware(async (ctx) => {
            if (!persistenceEnabled() || !ctx.headers) return;
            const cs = await cookieSessionOf(ctx, ctx.headers);
            if (!cs) return;
            const ok = await guardSession({ session: { id: cs.id, userId: cs.userId, createdAt: cs.createdAt, expiresAt: cs.expiresAt }, user: { id: cs.userId, email: cs.email, name: cs.name } }, ctx.headers);
            if (!ok) throw new APIError("UNAUTHORIZED", { message: "This session was signed out.", code: "SESSION_REVOKED" });
          }),
        },
        {
          // Signing out ends the server-side session as well as clearing the cookies.
          matcher: (c) => c.path === "/sign-out",
          handler: createAuthMiddleware(async (ctx) => {
            if (!persistenceEnabled()) return;
            const cs = await cookieSessionOf(ctx, ctx.headers);
            if (!cs) return;
            try {
              await revokeSession(cs.id);
            } catch {
              console.error("[auth] could not revoke the session record on sign-out");
            }
            forgetSession(cs.id);
          }),
        },
      ],
      after: [
        {
          // Cookies issued before persistent sessions claim only 30 days inside; upgrade them in place (same session id).
          matcher: (c) => c.path === "/get-session",
          handler: createAuthMiddleware(async (ctx) => {
            const r = ctx.context.returned as { session?: { expiresAt?: Date | string }; user?: unknown } | null | undefined;
            if (!r?.session || !r.user || !persistenceEnabled()) return;
            const exp = new Date(String(r.session.expiresAt)).getTime();
            if (!Number.isFinite(exp) || exp > Date.now() + 100 * 86_400_000) return;
            if (hasCookie(ctx.headers, ctx.context.authCookies.dontRememberToken.name)) return;
            try {
              await issueSessionCookies(ctx, r as never, true);
            } catch {
              /* read-only context (RSC): the next API call upgrades it */
            }
          }),
        },
        {
          // Google / Microsoft: same persistent-cookie policy, user + session records, rotation.
          matcher: (c) => typeof c.path === "string" && c.path.startsWith("/callback/"),
          handler: createAuthMiddleware(async (ctx) => {
            const ns = ctx.context.newSession as { session: { id: string; token: string; userId: string; createdAt: Date; updatedAt: Date; expiresAt: Date; ipAddress?: string | null; userAgent?: string | null }; user: { id: string; email: string; name?: string | null; [k: string]: unknown } } | null;
            if (!ns?.session || !ns.user) return;
            const remember = rememberFromRequest(ctx.headers);
            const provider = String((ctx.params as { id?: string } | undefined)?.id ?? "oauth");
            let user = ns.user;
            if (persistenceEnabled()) {
              try {
                const u = await upsertUser({ email: user.email, name: user.name, provider, id: user.id });
                user = { ...user, id: u.id, name: user.name || u.name };
                await dropUnverifiedCredential(user.email).catch(() => undefined);
              } catch {
                console.error("[auth] could not save the user record; continuing with a cookie-only session");
              }
            }
            const previous = await cookieSessionOf(ctx, ctx.headers);
            const now = new Date();
            const session = { ...ns.session, id: randomToken(16), token: randomToken(24), userId: user.id, createdAt: now, updatedAt: now, expiresAt: new Date(now.getTime() + (remember ? SESSION_TTL_SECONDS : SHORT_SESSION_TTL_SECONDS) * 1000), userAgent: ctx.headers?.get("user-agent")?.slice(0, 300) ?? null };
            await stashPreviousAccount(ctx as never, user.email);
            await issueSessionCookies(ctx, { session, user }, remember);
            if (/(?:^|;\s*)keplar_remember=/.test(ctx.headers?.get("cookie") ?? "")) ctx.setCookie(REMEMBER_COOKIE, "", { maxAge: 0, path: "/" });
            try {
              await recordSignIn({ session, userId: user.id, email: user.email, headers: ctx.headers, provider, remember, previousId: previous?.id });
            } catch {
              // The browser is redirected, so a JSON error would be a dead end: back to the sign-in page with a message.
              dropPendingCookies(ctx, [ctx.context.authCookies.sessionToken.name, ctx.context.authCookies.sessionData.name, ctx.context.authCookies.dontRememberToken.name]);
              throw ctx.redirect("/signin?error=session_store");
            }
          }),
        },
      ],
    },
    rateLimit: [
      { pathMatcher: (p: string) => p.startsWith("/sign-in/magic-link"), window: 60, max: 3 },
      { pathMatcher: (p: string) => p.startsWith("/magic-link/confirm"), window: 60, max: 10 },
    ],
  }) satisfies BetterAuthPlugin;
