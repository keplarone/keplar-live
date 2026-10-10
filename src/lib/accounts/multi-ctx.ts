/** The Better Auth side of multi-account sign-in: keep the account that was active when someone signs in as another one. */
import type { GenericEndpointContext } from "@better-auth/core";
import { buildStash, chooseSlot, encodeStash, readParked, stashCookieName, STASH_MAX_AGE_SECONDS } from "./multi";
import { cookieSessionOf, hasCookie } from "./session-cookies";
import { guardSession } from "./session-guard";

/**
 * Call right before issuing the new session's cookies. The request still carries the previous account's cookies:
 *  - a different, still valid account is parked in a slot (sign-in adds an account, it never drops one);
 *  - a parked copy of the account that is signing in is removed (it is the active one now);
 *  - the same account signing in again (rotation) just replaces itself.
 * Never throws: a failure here must not block the sign-in itself.
 */
export async function stashPreviousAccount(ctx: GenericEndpointContext, signingInEmail: string): Promise<void> {
  try {
    const headers = ctx.headers;
    if (!headers) return;
    const cookies = ctx.context.authCookies;
    const secure = cookies.sessionToken.name.startsWith("__Secure-");
    const names = { sessionToken: cookies.sessionToken.name, sessionData: cookies.sessionData.name, dontRemember: cookies.dontRememberToken.name };
    const email = signingInEmail.trim().toLowerCase();
    const parked = readParked(headers.get("cookie"), secure);
    const attrs = { httpOnly: true, secure, sameSite: "lax" as const, path: "/" };

    let target: number | null = null;
    const prev = await cookieSessionOf(ctx, headers);
    if (prev && prev.email.trim().toLowerCase() !== email && prev.expiresAt.getTime() > Date.now()) {
      const alive = await guardSession({ session: { id: prev.id, userId: prev.userId, createdAt: prev.createdAt, expiresAt: prev.expiresAt }, user: { id: prev.userId, email: prev.email, name: prev.name } }, headers);
      const stash = alive ? buildStash(headers.get("cookie"), names, { id: prev.id, userId: prev.userId, email: prev.email, name: prev.name, createdAt: prev.createdAt, expiresAt: prev.expiresAt }, !hasCookie(headers, names.dontRemember)) : null;
      if (stash) {
        target = chooseSlot(parked.filter((p) => p.stash.e !== email), stash.e);
        ctx.setCookie(stashCookieName(secure, target), encodeStash(stash), { ...attrs, maxAge: STASH_MAX_AGE_SECONDS });
      }
    }
    for (const p of parked) if (p.stash.e === email && p.slot !== target) ctx.setCookie(stashCookieName(secure, p.slot), "", { ...attrs, maxAge: 0 });
  } catch {
    console.error("[auth] could not keep the previous account on this device");
  }
}
