/**
 * Stale-tab guard. The browser tells the server which account its on-screen chats belong to
 * (`x-keplar-account`: the user id, or "anon" for device-local chats). If the session cookie now belongs to
 * someone else (signed in as another account in a second tab), the request is refused with 409 instead of
 * writing one account's chat into another account. If the screen shows an account but the request has no
 * session at all (the cookie expired or was cleared), it is refused with 401 `session_expired`: nothing changed
 * hands, the person only needs to sign in again. Requests without the header (older clients, API users) pass.
 */
import { HttpError } from "@/lib/create/platform/http";

export const ACCOUNT_HEADER = "x-keplar-account";

export function assertSameAccount(req: Request, userId: string | null): void {
  const claimed = req.headers.get(ACCOUNT_HEADER)?.trim();
  if (!claimed) return;
  if (claimed === (userId ?? "anon")) return;
  if (!userId && claimed !== "anon") {
    throw new HttpError(401, "Your session expired. Sign in again to continue.", "session_expired");
  }
  throw new HttpError(409, "You are signed in as a different account now. Reload to see that account's chats.", "account_changed");
}
