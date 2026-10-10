/**
 * One member.
 *   PATCH { role } -> change their role (owner: any; admin: between member and viewer).
 *   DELETE -> remove them (owner/admin as allowed), or leave yourself. Takes effect on their next request.
 */
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { teamAs } from "@/lib/team/api";
import { teamCookie } from "@/lib/team/resolve";
import { memberRows } from "@/lib/team/rows";
import { changeRole, removeMember } from "@/lib/team/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; memberId: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id, memberId } = await params;
    const a = await teamAs(req, id, "manage");
    const m = await memberRows().get(a.access.team.id, memberId);
    if (!m) throw new HttpError(404, "That person is not on the team.", "not_found");
    const b = await body<{ role?: unknown }>(req);
    const next = await changeRole(a.access.team, a.access.role, a.actor, m.userId, b.role);
    return json({ member: { id: next.id, email: next.email, role: next.role } });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const { id, memberId } = await params;
    // Leaving needs only membership; removing someone else needs manage (checked again inside removeMember against the target's role).
    const a = await teamAs(req, id, "read");
    const m = await memberRows().get(a.access.team.id, memberId);
    if (!m) throw new HttpError(404, "That person is not on the team.", "not_found");
    const out = await removeMember(a.access.team, a.access.role, a.actor, m.userId);
    const res = json({ ok: true, removed: out.email });
    if (out.userId === a.userId) res.headers.append("set-cookie", teamCookie(null, new URL(req.url).protocol === "https:"));
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
