/**
 * POST /api/account/delete { confirmEmail }: schedules deletion of the signed-in account after a grace period (default 14 days,
 *   KEPLAR_DELETE_GRACE_DAYS) and emails the owner; { confirmEmail, now: true } deletes immediately; { action: "cancel" } cancels a
 *   scheduled deletion. Without the account database there is nothing to schedule on, so it deletes immediately as before.
 * GET returns the scheduled date, if any.
 * The deletion, when it happens, removes the account and everything it owns.
 * Guards: same origin, verified signed-in session, typed email must match, rate limited, admin accounts refused, and an
 * active paid subscription must be cancelled first (Keplar cannot cancel it on Whop's side). Retained records: see
 * src/lib/privacy/account-data.ts. Nothing is deleted on any other route.
 */
import { auth, getSession } from "@/lib/accounts/auth";
import { deletionScheduledFor, persistenceEnabled, revokeAllSessions } from "@/lib/accounts/persist";
import { forgetAllSessions } from "@/lib/accounts/session-guard";
import { getWorkspace } from "@/lib/accounts/workspaces";
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { requireAccount } from "@/lib/create/platform/workspace";
import { logEvent } from "@/lib/ops/log";
import { writeAudit } from "@/lib/ops/audit";
import { activeSubscription, deleteLogin, deleteWorkspaceData } from "@/lib/privacy/account-data";
import { cancelDeletion, graceDays, scheduleDeletion } from "@/lib/privacy/deletion";
import { assertSameOrigin } from "@/lib/security/origin";
import { ownedTeam, removeUserFromTeams } from "@/lib/team/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const ws = await requireAccount(req);
    if (!ws.userId || !persistenceEnabled()) return json({ scheduledFor: null, graceDays: 0 });
    return json({ scheduledFor: await deletionScheduledFor(ws.userId).catch(() => null), graceDays: graceDays() });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const ws = await requireAccount(req);
    await limitRequest(req, "account_delete", { perIp: 5, perAccount: 3, accountId: ws.id, windowSec: 3600 });
    const { confirmEmail, now: immediately, action } = await body<{ confirmEmail?: unknown; now?: unknown; action?: unknown }>(req);
    const session = await getSession(req.headers);
    if (!session || !ws.userId || !ws.email) throw new HttpError(401, "Sign in to continue.", "unauthenticated");
    if (action === "cancel") {
      if (persistenceEnabled()) await cancelDeletion(ws.userId);
      return json({ ok: true, scheduledFor: null });
    }
    if (typeof confirmEmail !== "string" || confirmEmail.trim().toLowerCase() !== ws.email.toLowerCase()) {
      throw new HttpError(400, "Type your account email exactly to confirm.", "confirm_mismatch");
    }
    if (ws.admin) throw new HttpError(403, "Admin accounts can't be deleted here. Contact team@keplar.one.", "admin_protected");
    const row = await getWorkspace(ws.id);
    if (row && activeSubscription(row.billing)) {
      throw new HttpError(409, "Cancel your subscription first (Manage billing), then delete the account. Keplar can't cancel it for you.", "subscription_active");
    }
    // A team you own has other people's shared work in it: delete it (after exporting) or it blocks the account deletion. Members just leave.
    if (await ownedTeam(ws.userId)) throw new HttpError(409, "You own a team workspace. Export and delete it first (Team page), then delete your account. Other members' shared work is not removed with your personal account.", "team_owned");
    if (persistenceEnabled() && immediately !== true) {
      const on = await scheduleDeletion({ id: ws.userId, email: ws.email });
      logEvent("info", "account.delete_scheduled", { ws: ws.id }, req);
      return json({ ok: true, scheduledFor: on.toISOString() });
    }
    // Record that it happened (workspace id only, no content), then delete.
    await writeAudit("user", "account.delete", `workspace ${ws.id}`).catch(() => undefined);
    await removeUserFromTeams(ws.userId).catch(() => 0); // leave every team first; what was shared there stays with the team
    const result = await deleteWorkspaceData(ws.id);
    await revokeAllSessions(ws.userId).catch(() => undefined);
    forgetAllSessions();
    await deleteLogin(ws.userId, ws.email);
    logEvent("info", "account.delete", { ws: ws.id, deleted: result.deleted }, req);
    const out = await auth.api.signOut({ headers: req.headers, asResponse: true }).catch(() => null);
    const res = json({ ok: true, deleted: result.deleted, retained: "Payment records and usage counters are kept as described in the privacy policy." });
    out?.headers.getSetCookie().forEach((c) => res.headers.append("set-cookie", c));
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
