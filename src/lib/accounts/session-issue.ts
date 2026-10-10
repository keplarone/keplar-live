/** Start a Keplar session for a verified email: user record, fresh session id, cookies, session row (rotation). */
import type { GenericEndpointContext } from "@better-auth/core";
import { randomToken, userIdForEmail } from "./magic-token";
import { persistenceEnabled, SESSION_TTL_SECONDS, SHORT_SESSION_TTL_SECONDS, upsertUser } from "./persist";
import { cookieSessionOf, issueSessionCookies } from "./session-cookies";
import { stashPreviousAccount } from "./multi-ctx";
import { recordSignIn } from "./stateless-magic-link";
import { authSecret } from "./secret";

export async function startSession(ctx: GenericEndpointContext, a: { email: string; name?: string | null; provider: string; remember: boolean; /** The sign-in itself was two-factor (a user-verified passkey), so no authenticator-app code is asked for on top. */ secondFactorDone?: boolean }): Promise<{ userId: string }> {
  const now = new Date();
  let userId = userIdForEmail(authSecret(), a.email);
  let displayName = a.name ?? "";
  let createdAt = now;
  if (persistenceEnabled()) {
    try {
      const u = await upsertUser({ email: a.email, name: a.name, provider: a.provider, id: userId });
      userId = u.id;
      displayName = u.name || displayName;
      createdAt = new Date(u.createdAt);
    } catch {
      console.error("[auth] could not save the user record; continuing with a cookie-only session");
    }
  }
  const user = { id: userId, email: a.email, emailVerified: true, name: displayName, image: null, createdAt, updatedAt: now };
  const session = {
    id: randomToken(16),
    token: randomToken(24),
    userId,
    expiresAt: new Date(now.getTime() + (a.remember ? SESSION_TTL_SECONDS : SHORT_SESSION_TTL_SECONDS) * 1000),
    createdAt: now,
    updatedAt: now,
    ipAddress: null,
    userAgent: ctx.headers?.get("user-agent")?.slice(0, 300) ?? null,
  };
  const previous = await cookieSessionOf(ctx, ctx.headers);
  await stashPreviousAccount(ctx, a.email);
  await issueSessionCookies(ctx, { session, user }, a.remember);
  await recordSignIn({ session, userId, email: a.email, headers: ctx.headers, provider: a.provider, remember: a.remember, previousId: previous?.id, secondFactorDone: a.secondFactorDone });
  return { userId };
}
