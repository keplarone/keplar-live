/**
 * The signed-in user's devices.
 *   GET    -> active sessions (this one flagged), newest activity first
 *   DELETE -> { id }                 sign out one device
 *   POST   -> { action: "all" }      sign out of every device (this one too; cookies are cleared)
 * Same-origin only, rate limited, session required. Without a database there is no session list: 501.
 */
import { auth, getSession } from "@/lib/accounts/auth";
import { deviceLabel, listSessions, persistenceEnabled, revokeAllSessions, revokeSession } from "@/lib/accounts/persist";
import { forgetAllSessions, forgetSession } from "@/lib/accounts/session-guard";
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { assertSameOrigin } from "@/lib/security/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function who(req: Request) {
  const session = await getSession(req.headers);
  if (!session) throw new HttpError(401, "Sign in to continue.", "unauthenticated");
  if (!persistenceEnabled()) throw new HttpError(501, "Device sessions need the account database, which isn't connected here.", "not_available");
  return session;
}

export async function GET(req: Request) {
  try {
    await limitRequest(req, "sessions_list", { perIp: 60 });
    const session = await who(req);
    const rows = await listSessions(session.user.id);
    return json({
      sessions: rows.map((r) => ({ id: r.id, current: r.id === session.session.id, device: deviceLabel(r.userAgent), provider: r.provider, createdAt: r.createdAt, lastSeen: r.lastSeen, expiresAt: r.expiresAt, remembered: r.remember })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request) {
  try {
    assertSameOrigin(req);
    await limitRequest(req, "sessions_revoke", { perIp: 30 });
    const session = await who(req);
    const { id } = await body<{ id?: unknown }>(req);
    if (typeof id !== "string" || !id || id.length > 64) throw new HttpError(400, "Say which session to sign out.", "bad_request");
    const ok = await revokeSession(id, session.user.id);
    forgetSession(id);
    if (!ok) throw new HttpError(404, "That session is already signed out.", "not_found");
    return json({ ok: true, current: id === session.session.id });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    await limitRequest(req, "sessions_revoke", { perIp: 30 });
    const session = await who(req);
    const { action } = await body<{ action?: unknown }>(req);
    if (action !== "all") throw new HttpError(400, "Unknown action.", "bad_request");
    const count = await revokeAllSessions(session.user.id);
    forgetAllSessions();
    // Clear this browser's cookies too (the revoked session would be refused anyway).
    const out = await auth.api.signOut({ headers: req.headers, asResponse: true }).catch(() => null);
    const res = json({ ok: true, revoked: count });
    out?.headers.getSetCookie().forEach((c) => res.headers.append("set-cookie", c));
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
