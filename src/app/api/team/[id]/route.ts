/**
 * One team.
 *   GET    -> the team as the caller's role may see it: members; admins and the owner also get the open invites, the audit log and the pool meter.
 *   PATCH  { name } -> rename (owner).
 *   DELETE { confirm: <team name> } -> delete the team and everything shared in it (owner). Export first: /api/team/<id>/export.
 */
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { meter } from "@/lib/create/platform/compute";
import { workspaceById } from "@/lib/create/platform/workspace";
import { roleCan, poolStatement, TEAM_POLICY } from "@/lib/team/policy";
import { teamAs } from "@/lib/team/api";
import { capacity, deleteTeam, listAudit, listInvites, listMembers, renameTeam } from "@/lib/team/store";
import { teamCookie } from "@/lib/team/resolve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const a = await teamAs(req, id, "read");
    const { team, role } = a.access;
    const members = await listMembers(team.id);
    const manage = roleCan(role, "manage");
    const cap = await capacity(team);
    const ws = await workspaceById(team.id);
    const m = ws ? await meter(ws).catch(() => null) : null;
    return json({
      team: { id: team.id, name: team.name, createdAt: team.createdAt },
      role,
      members: members.map((x) => ({ id: x.id, email: x.email, name: x.name, role: x.role, addedAt: x.addedAt, you: x.userId === a.userId })),
      invites: manage ? (await listInvites(team.id)).map((i) => ({ id: i.id, email: i.email, role: i.role, status: i.status, createdAt: i.createdAt, sentAt: i.sentAt, sentVia: i.sentVia, expiresAt: i.expiresAt, createdBy: i.createdByEmail })) : [],
      audit: manage ? (await listAudit(team.id, 100)).map((r) => ({ at: r.at, actor: r.actorEmail, action: r.action, target: r.target, detail: r.detail })) : [],
      capacity: { members: cap.members, maxMembers: cap.policy.maxMembers, openInvites: cap.openInvites, maxOpenInvites: cap.policy.openInvites },
      pool: { statement: poolStatement(TEAM_POLICY[cap.plan]), units: a.access.poolUnits, used: m ? m.used : null, resetsAt: ws?.period.end ?? null },
      plan: cap.plan,
      paused: !TEAM_POLICY[cap.plan].available,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const a = await teamAs(req, id, "owner");
    const b = await body<{ name?: unknown }>(req);
    const next = await renameTeam(a.access.team, a.actor, b.name);
    return json({ team: { id: next.id, name: next.name } });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const a = await teamAs(req, id, "owner");
    const b = await body<{ confirm?: unknown }>(req);
    if (typeof b.confirm !== "string" || b.confirm.trim() !== a.access.team.name) throw new HttpError(400, "Type the team's name exactly to confirm.", "confirm_mismatch");
    const out = await deleteTeam(a.access.team, a.actor);
    const res = json({ ok: true, deleted: out.deleted });
    res.headers.append("set-cookie", teamCookie(null, new URL(req.url).protocol === "https:"));
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
