/**
 * Session cookie policy (Better Auth cookies, written by our plugin and the OAuth callback hook).
 *
 * - Remembered (default): `session_token` carries Max-Age = 60 days, HttpOnly, SameSite=Lax, Secure on https,
 *   so it survives browser restarts. It is re-issued while the user is active (sliding window).
 * - "Remember me" off: the same cookies but with no Max-Age/Expires (a browser-session cookie), plus a signed
 *   `dont_remember` marker so refreshes keep it session-only. The server record also lapses after a day.
 * - The embedded session in the encrypted `session_data` cookie claims a long life when remembered (the cookie's own
 *   lifetime and the server record decide the real expiry): without it Better Auth's stateless mode would sign users out
 *   when the embedded date passes even though they were active. A session-only ("Remember me" off) sign-in embeds the
 *   same one day as its server record, which never slides, so the cookie stops working on its own when the record does.
 */
import { setSessionCookie, expireCookie, getCookieCache } from "better-auth/cookies";
import type { GenericEndpointContext } from "@better-auth/core";
import { SESSION_TTL_SECONDS, SHORT_SESSION_TTL_SECONDS } from "./persist";

export const SESSION_COOKIE_MAX_AGE = SESSION_TTL_SECONDS;
/** Lifetime claimed inside the encrypted cache (days); never the cookie's Max-Age. */
const EMBEDDED_DAYS = 365;
export const REMEMBER_COOKIE = "keplar_remember";

type Sess = { session: Record<string, unknown> & { expiresAt?: Date }; user: Record<string, unknown> };

/** Remove pending Set-Cookie entries for these cookie names (and their `.N` chunks) from this response. */
export function dropPendingCookies(ctx: GenericEndpointContext, names: string[]) {
  const targets = new Set<Headers>();
  const c = ctx as unknown as { responseHeaders?: Headers; context?: { responseHeaders?: Headers } };
  if (c.responseHeaders) targets.add(c.responseHeaders);
  if (c.context?.responseHeaders) targets.add(c.context.responseHeaders);
  for (const h of targets) {
    const existing = h.getSetCookie();
    const keep = existing.filter((e) => !names.some((n) => e.startsWith(`${n}=`) || e.startsWith(`${n}.`)));
    if (keep.length === existing.length) continue;
    h.delete("set-cookie");
    for (const e of keep) h.append("set-cookie", e);
  }
}

/** Write (or replace) the session cookies for `sess`, remembered or session-only. */
export async function issueSessionCookies(ctx: GenericEndpointContext, sess: Sess, remember: boolean) {
  const cookies = ctx.context.authCookies;
  dropPendingCookies(ctx, [cookies.sessionToken.name, cookies.sessionData.name, cookies.dontRememberToken.name]);
  const embedded = { ...sess, session: { ...sess.session, expiresAt: new Date(Date.now() + (remember ? EMBEDDED_DAYS * 86_400 : SHORT_SESSION_TTL_SECONDS) * 1000) } };
  // dontRememberMe is passed as false on purpose: Better Auth would otherwise shrink the encrypted cache to 5 minutes
  // (it assumes a database behind it). The token cookie's Max-Age is what differs.
  await setSessionCookie(ctx, embedded as never, false, remember ? { maxAge: SESSION_COOKIE_MAX_AGE } : { maxAge: undefined });
  if (remember) {
    if (hasCookie(ctx.headers, cookies.dontRememberToken.name)) expireCookie(ctx, cookies.dontRememberToken);
  }
  else await ctx.setSignedCookie(cookies.dontRememberToken.name, "true", ctx.context.secret, cookies.dontRememberToken.attributes);
}

/** Does the request carry a non-empty cookie with this name? */
export const hasCookie = (headers: Headers | null | undefined, name: string) =>
  (headers?.get("cookie") ?? "").split(/;\s*/).some((c) => c.startsWith(`${name}=`) && c.length > name.length + 1);

export type CookieSession = { id: string; userId: string; email: string; name: string | null; createdAt: Date; expiresAt: Date };

/** Decode the encrypted session cookie on a request (no database, no refresh). Null when absent or invalid. */
export async function cookieSessionOf(ctx: GenericEndpointContext, headers: Headers | null | undefined): Promise<CookieSession | null> {
  if (!headers) return null;
  try {
    const name = ctx.context.authCookies.sessionData.name;
    const p = await getCookieCache(headers, { strategy: "jwe", secret: ctx.context.secret, isSecure: name.startsWith("__Secure-") });
    const sess = p?.session as { id?: string; userId?: string; createdAt?: unknown; expiresAt?: unknown } | undefined;
    const user = p?.user as { email?: string; name?: string | null } | undefined;
    if (!sess?.id || !user?.email) return null;
    return { id: sess.id, userId: String(sess.userId ?? ""), email: user.email, name: user.name ?? null, createdAt: new Date(String(sess.createdAt)), expiresAt: new Date(String(sess.expiresAt)) };
  } catch {
    return null;
  }
}

/** The "Remember me" choice an OAuth sign-in started with (a short-lived, non-secret preference cookie). */
export const rememberFromRequest = (headers: Headers | null | undefined) => !/(?:^|;\s*)keplar_remember=0(?:;|$)/.test(headers?.get("cookie") ?? "");
