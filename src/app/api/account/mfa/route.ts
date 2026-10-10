/**
 * Second factor for the signed-in account.
 *   GET                                  { enabled, recoveryLeft } for the signed-in account
 *   POST { action: "setup" }             new secret + otpauth link (not active yet)
 *   POST { action: "enable", code }      prove the app works: turns 2FA on, returns 10 recovery codes (shown once)
 *   POST { action: "disable", code }     needs a current authenticator or recovery code
 *   POST { action: "regenerate", code }  needs a current code; the old recovery codes stop working
 *   POST { action: "challenge", code }   finish a sign-in that is waiting for its code (authenticator code or recovery code)
 * Same-origin only. The challenge is limited per IP, per session (the 5th wrong code ends that session) and per account.
 */
import { getSession } from "@/lib/accounts/auth";
import { completeMfa, persistenceEnabled, revokeSession } from "@/lib/accounts/persist";
import { forgetSession } from "@/lib/accounts/session-guard";
import { pendingMfaFor } from "@/lib/accounts/mfa/gate";
import { beginSetup, confirmSetup, disableMfa, mfaStatus, regenerateRecovery, verifySecondFactor } from "@/lib/accounts/mfa/store";
import { brand } from "@/lib/site";
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { limitRequest, rateLimit, RateLimitError } from "@/lib/create/platform/ratelimit";
import { writeAudit } from "@/lib/ops/audit";
import { assertSameOrigin } from "@/lib/security/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function signedIn(req: Request) {
  const session = await getSession(req.headers);
  if (!session) throw new HttpError(401, "Log in to continue.", "unauthenticated");
  if (!persistenceEnabled()) throw new HttpError(501, "Two-factor sign-in needs the account database, which isn't connected here.", "not_available");
  return session;
}

export async function GET(req: Request) {
  try {
    await limitRequest(req, "mfa_status", { perIp: 60 });
    const session = await signedIn(req);
    return json(await mfaStatus(session.user.id));
  } catch (e) {
    return errorResponse(e);
  }
}

async function guessBudget(userId: string) {
  try {
    await rateLimit(`mfa:user:${userId}`, 8, 600, { shared: true });
  } catch (e) {
    if (e instanceof RateLimitError) throw new HttpError(429, "Too many attempts. Wait a few minutes and try again.", "rate_limited");
    throw e;
  }
}

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    await limitRequest(req, "mfa", { perIp: 30, windowSec: 600 });
    // Anonymous callers are refused before anything else: every action needs a session, full or waiting for its code.
    const full = await getSession(req.headers);
    const pending = full ? null : await pendingMfaFor(req.headers);
    if (!full && !pending) throw new HttpError(401, "Log in to continue.", "unauthenticated");
    const { action, code } = await body<{ action?: unknown; code?: unknown }>(req);
    if (action === "setup") {
      const session = await signedIn(req);
      try {
        return json(await beginSetup(session.user.id, session.user.email, brand.name));
      } catch (e) {
        if (e instanceof Error && e.message === "already_enabled") throw new HttpError(409, "Two-factor sign-in is already on.", "already_enabled");
        throw e;
      }
    }
    if (action === "enable" || action === "disable" || action === "regenerate") {
      const session = await signedIn(req);
      if (typeof code !== "string" || code.length < 6 || code.length > 20) throw new HttpError(400, "Enter the 6-digit code from your authenticator app.", "bad_code");
      const uid = session.user.id;
      await guessBudget(uid);
      if (action === "enable") {
        const done = await confirmSetup(uid, code);
        if (!done.ok) throw new HttpError(400, "That code isn't right. Check the code in your authenticator app and try again.", "wrong_code");
        await writeAudit("user", "mfa.enabled", `user ${uid}`).catch(() => undefined);
        return json({ ok: true, recoveryCodes: done.recoveryCodes });
      }
      const check = await verifySecondFactor(uid, code);
      if (!check.ok) throw new HttpError(400, "That code isn't right. Use a current code from your authenticator app, or a recovery code.", "wrong_code");
      if (action === "disable") {
        await disableMfa(uid);
        await writeAudit("user", "mfa.disabled", `user ${uid}`).catch(() => undefined);
        return json({ ok: true });
      }
      const codes = await regenerateRecovery(uid);
      await writeAudit("user", "mfa.recovery_regenerated", `user ${uid}`).catch(() => undefined);
      return json({ ok: true, recoveryCodes: codes });
    }
    if (action !== "challenge") throw new HttpError(400, "Unknown action.", "bad_request");
    if (typeof code !== "string" || code.length < 6 || code.length > 20) throw new HttpError(400, "Enter the 6-digit code from your authenticator app, or a recovery code.", "bad_code");
    if (!pending) throw new HttpError(400, "You're already logged in.", "not_pending");
    // At most 8 guesses per account per 10 minutes across all sessions, and 5 per session.
    await guessBudget(pending.userId);
    const res = await verifySecondFactor(pending.userId, code);
    if (!res.ok) {
      let ended = false;
      try {
        await rateLimit(`mfa:session:${pending.sessionId}`, 4, 600, { shared: true });
      } catch {
        ended = true;
      }
      if (ended) {
        await revokeSession(pending.sessionId, pending.userId).catch(() => undefined);
        forgetSession(pending.sessionId);
        await writeAudit("user", "mfa.session_ended_too_many_failures", `user ${pending.userId}`).catch(() => undefined);
        throw new HttpError(401, "Too many wrong codes. Log in again.", "session_ended");
      }
      throw new HttpError(400, "That code isn't right. Check the code in your authenticator app and try again.", "wrong_code");
    }
    await completeMfa(pending.sessionId);
    forgetSession(pending.sessionId);
    return json({ ok: true, via: res.via, recoveryLeft: res.via === "recovery" ? res.recoveryLeft : undefined });
  } catch (e) {
    return errorResponse(e);
  }
}
