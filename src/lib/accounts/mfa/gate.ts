/**
 * "Signed in with the password, second factor still owed": the session cookie is valid but its row is flagged `mfa_pending`,
 * so `getSession` treats it as signed out everywhere. Only the two-factor page and API look at it, through this helper.
 */
import { getCookieCache } from "better-auth/cookies";
import { auth } from "../auth";
import { pendingMfaRow, persistenceEnabled } from "../persist";

export type PendingMfa = { sessionId: string; userId: string; email: string };

export async function pendingMfaFor(headers: Headers): Promise<PendingMfa | null> {
  if (!persistenceEnabled()) return null;
  try {
    // Read the session cookie directly: `auth.api.getSession` refuses a session that is waiting for its code.
    const c = await auth.$context;
    const name = c.authCookies.sessionData.name;
    const p = await getCookieCache(headers, { strategy: "jwe", secret: c.secret, isSecure: name.startsWith("__Secure-") });
    const id = (p?.session as { id?: string } | undefined)?.id;
    const email = (p?.user as { email?: string } | undefined)?.email;
    if (!id || !email) return null;
    const row = await pendingMfaRow(id);
    return row ? { sessionId: id, userId: row.userId, email } : null;
  } catch {
    return null;
  }
}

