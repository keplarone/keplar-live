/**
 * "This wasn't me" from the new-device email: signs the account out of every device.
 * The signed, 7-day link in the email is the credential (it names the account's email); it can only ever sign sessions OUT,
 * so a stolen link cannot be used to get in. Same-origin only, rate limited. Safe to repeat.
 */
import { revokeAllSessions, persistenceEnabled, storedUserId } from "@/lib/accounts/persist";
import { verifyActionToken } from "@/lib/accounts/action-token";
import { userIdForEmail } from "@/lib/accounts/magic-token";
import { authSecret } from "@/lib/accounts/secret";
import { forgetAllSessions } from "@/lib/accounts/session-guard";
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { assertSameOrigin } from "@/lib/security/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    await limitRequest(req, "account_secure", { perIp: 10, windowSec: 600 });
    const { token } = await body<{ token?: unknown }>(req);
    const res = verifyActionToken(authSecret(), "secure", token);
    if (!res.ok) throw new HttpError(400, res.reason === "expired" ? "This link has expired. Sign in and use Sign out of all devices on your Account page." : "This link isn't valid.", "bad_link");
    if (!persistenceEnabled()) throw new HttpError(503, "Device sign-out isn't available on this server right now.", "not_available");
    const email = res.payload.e;
    const userId = (await storedUserId(email)) ?? userIdForEmail(authSecret(), email);
    const revoked = await revokeAllSessions(userId);
    forgetAllSessions();
    return json({ ok: true, revoked });
  } catch (e) {
    return errorResponse(e);
  }
}
