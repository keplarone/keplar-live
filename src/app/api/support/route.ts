/**
 * POST /api/support  { topic, subject, message, email?, website(honeypot) }
 * Stores a support ticket for /admin/inbox. Nothing is emailed automatically (a person replies from team@keplar.one).
 * Open to signed-out visitors: same-origin check, per-IP and per-account rate limits, honeypot, length caps, plain-text storage.
 */
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { isSameOrigin } from "@/lib/security/origin";
import { storeTicket, validateTicket } from "@/lib/support/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    if (!isSameOrigin(req)) throw new HttpError(403, "Cross-site request blocked.", "bad_origin");
    const ws = await currentWorkspace(req, { allowAnonymous: true });
    await limitRequest(req, "support", { perIp: 6, perAccount: 10, accountId: ws.anonymous ? null : ws.id, windowSec: 3600 });
    const v = validateTicket(await body<unknown>(req), ws.anonymous ? undefined : (ws as { email?: string }).email);
    if (!v.ok) throw new HttpError(400, v.error, "invalid");
    const row = await storeTicket(v.value, { workspaceId: ws.anonymous ? null : ws.id, plan: ws.anonymous ? undefined : ws.plan });
    return json({ ok: true, ref: row.id });
  } catch (e) {
    return errorResponse(e);
  }
}
