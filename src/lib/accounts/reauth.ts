/**
 * "Sign in again to continue" for sensitive account changes: adding a passkey, turning on two-factor sign-in or making
 * new recovery codes, deleting the account immediately, exporting its data and creating an API key.
 *
 * A session counts as recent when it was created in the last 10 minutes (the same window as Space Studio's account
 * linking, REAUTH_MS). A session's createdAt is when the person signed in: Better Auth keeps it across the sliding cookie
 * refresh, every sign-in mints a new session, and a handoff to Keplar Business or the desktop app carries the original
 * sign-in time over (./session-issue.ts), so a stolen or long-lived cookie can't be refreshed or handed over to pass.
 * The answer is a 403 with code "reauth_required"; the UI links to /signin?reauth=1&next=<where they were>.
 */
import { HttpError } from "@/lib/create/platform/http";
import { recentlyAuthenticated, REAUTH_MS } from "@/lib/space-studio/core/identities";

export const REAUTH_WINDOW_MS = REAUTH_MS;
export const REAUTH_CODE = "reauth_required";
export const REAUTH_MESSAGE = "Please sign in again to continue.";

type Sess = { session: { createdAt?: Date | string | null } };

/** When this session's sign-in happened (epoch ms), or null when unknown. */
export function signedInAt(s: Sess | null | undefined): number | null {
  const t = s?.session.createdAt ? new Date(s.session.createdAt).getTime() : NaN;
  return Number.isFinite(t) ? t : null;
}

export const signedInRecently = (s: Sess | null | undefined, now = Date.now()) => recentlyAuthenticated(signedInAt(s), now);

/** Throws 403 reauth_required unless the session signed in within the last 10 minutes. */
export function requireRecentSignIn(s: Sess | null | undefined, now = Date.now()): void {
  if (!signedInRecently(s, now)) throw new HttpError(403, REAUTH_MESSAGE, REAUTH_CODE);
}
