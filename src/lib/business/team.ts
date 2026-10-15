/**
 * Keplar Business teams: the plan's seats are people the owner invites (Settings > Team in the workspace), built on Keplar's
 * team workspaces (src/lib/team). A teammate works INSIDE the owner's Business workspace (its agents, approvals, dashboard,
 * orders and reports), not in a separate team copy, with their team role checked on every request:
 *   viewer  reads everything (GET only)            member (Editor)  also creates and changes things
 *   admin   also deletes, and invites or removes members and viewers           owner  everything
 * On top of the method check, owner-only surfaces call requireBusinessRole: payments setup and onboarding, bank data and bank
 * links, connector sign-in/disconnect and tool switches, agent auto-send and caps. Approvals need owner or admin. The audit log
 * records the teammate (auditActor), never "owner", when a teammate acts.
 * Seats follow the Business tier the owner bought (src/lib/business/seats.ts), owner included.
 * Everything is read fresh from the member row and the owner's workspace, so removing someone or a lapsed plan applies at once.
 */
import { isAdminEmail } from "@/lib/billing/admin";
import { HttpError } from "@/lib/create/platform/http";
import { workspaceById, type Workspace } from "@/lib/create/platform/workspace";
import { actionForMethod, roleCan, ROLE_LABEL, type TeamRole } from "@/lib/team/policy";
import { effectivePlanOf } from "@/lib/team/plan";
import { teamSelector } from "@/lib/team/resolve";
import { teamsOf } from "@/lib/team/store";
import { hasBusinessAccess } from "./tiers";

/** A Business workspace as a teammate sees it: the owner's data, the teammate's identity, their role. */
export type BusinessMember = { teamId: string; teamName: string; role: TeamRole; ownerEmail: string };

/**
 * The owner's Business workspace for a signed-in teammate, or null when they are on no Business team. The team picked in the
 * Keplar team switcher (its cookie) wins; otherwise the first Business team they belong to. Throws 403 when their role can't
 * do what the request needs (a viewer sending a POST).
 */
export async function businessTeamWorkspace(req: Request, personal: Workspace): Promise<(Workspace & { member: BusinessMember }) | null> {
  if (!personal.userId || !personal.verified || personal.anonymous) return null;
  const mine = await teamsOf(personal.userId);
  if (!mine.length) return null;
  const sel = teamSelector(req.headers.get("cookie"));
  mine.sort((a, b) => Number(b.team.id === sel) - Number(a.team.id === sel));
  for (const { team, role } of mine) {
    if ((await effectivePlanOf(team)) !== "business") continue;
    const owner = await workspaceById(team.ownerWorkspaceId);
    if (!owner || !hasBusinessAccess(owner.plan, owner.admin || isAdminEmail(team.ownerEmail))) continue;
    const need = actionForMethod(req.method);
    if (!roleCan(role, need)) {
      throw new HttpError(403, `Your role on ${team.name} (${ROLE_LABEL[role].toLowerCase()}) can only view. Ask an admin to change your role.`, "team_forbidden", { role, needs: need });
    }
    return {
      ...owner,
      plan: "business",
      // The owner's admin exemption never extends to the people they invite.
      admin: false,
      userId: personal.userId,
      email: personal.email,
      verified: personal.verified,
      member: { teamId: team.id, teamName: team.name, role, ownerEmail: team.ownerEmail },
    };
  }
  return null;
}

/** The teammate context on a Business workspace, or null when the signed-in person is the owner themself. */
export function memberOf(ws: Workspace): BusinessMember | null {
  return (ws as Workspace & { member?: BusinessMember }).member ?? null;
}

/**
 * Owner-only Business surfaces (src/lib/team/policy.ts TEAM_SCOPE: "Billing and the owner's account" are not shared): payments
 * setup, bank data and bank links, connector sign-ins, and agent auto-send/caps. `roles` widens it (approvals: owner or admin).
 * The owner acting in their own workspace has no `member` and always passes.
 */
export function requireBusinessRole(ws: Workspace, what: string, roles: readonly TeamRole[] = ["owner"]): void {
  const m = memberOf(ws);
  if (!m || roles.includes(m.role)) return;
  const who = roles.length === 1 ? "the workspace owner" : `the ${roles.map((r) => ROLE_LABEL[r].toLowerCase()).join(" or ")}`;
  throw new HttpError(403, `Only ${who} can ${what}. Your role on ${m.teamName} is ${ROLE_LABEL[m.role].toLowerCase()}.`, "team_forbidden", { role: m.role, needs: roles[0] });
}

/** Who to record in the Business audit log: "owner", or the teammate (`member:<role>:<email>#<userId>`). */
export function auditActor(ws: Workspace): string {
  const m = memberOf(ws);
  return m ? `member:${m.role}:${ws.email ?? ""}#${ws.userId ?? ""}` : "owner";
}
