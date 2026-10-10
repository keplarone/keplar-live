/**
 * One invite.
 *   POST { via: "email" | "link" } -> the explicit send. "email" mails the invitee through Keplar's mail service (Resend) and answers
 *        { emailed:true } only when it was accepted; if mail isn't set up it says so and sends nothing. "link" sends nothing: it returns a one-time
 *        link ONCE for you to pass on yourself. Either way a new token replaces the old one.
 *   DELETE -> revoke (the link stops working at once).
 */
import { body, errorResponse, json } from "@/lib/create/platform/http";
import { teamAs } from "@/lib/team/api";
import { revokeInvite, sendInvite } from "@/lib/team/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; inviteId: string }> };

export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id, inviteId } = await params;
    const a = await teamAs(req, id, "manage");
    const b = await body<{ via?: unknown }>(req);
    const via = b.via === "link" ? "link" : "email";
    const out = await sendInvite(a.access.team, a.actor, inviteId, via, new URL(req.url).origin);
    return json({ ok: true, invite: { id: out.invite.id, status: out.invite.status, expiresAt: out.invite.expiresAt, sentVia: out.invite.sentVia }, emailed: out.emailed, emailAvailable: out.emailAvailable, link: out.link });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const { id, inviteId } = await params;
    const a = await teamAs(req, id, "manage");
    return json({ ok: await revokeInvite(a.access.team, a.actor, inviteId) });
  } catch (e) {
    return errorResponse(e);
  }
}
