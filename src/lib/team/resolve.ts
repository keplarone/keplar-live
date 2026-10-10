/**
 * Per-request team access. Called by currentWorkspace() on routes that opted in to team context. The decision is read from the
 * membership row every time (no cache, no signed claim), so removing a member, or the owner's plan lapsing, is effective on the next request.
 */
import { getWorkspace } from "@/lib/accounts/workspaces";
import { HttpError } from "@/lib/create/platform/http";
import { memberIdFor } from "./ids";
import { actionForMethod, roleCan, ROLE_LABEL, TEAM_POLICY, type TeamAction, type TeamRole } from "./policy";
import { effectivePlanOf } from "./plan";
import { memberRows, teams, isTeamId, type TeamRow } from "./rows";
import type { PlanId } from "@/lib/create/platform/plans";

export const TEAM_COOKIE = "keplar_team";

export function teamSelector(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === TEAM_COOKIE) {
      const v = decodeURIComponent(part.slice(i + 1).trim());
      return isTeamId(v) ? v : null;
    }
  }
  return null;
}

export function teamCookie(teamId: string | null, secure: boolean): string {
  const base = `${TEAM_COOKIE}=${teamId ?? ""}; Path=/; SameSite=Lax${secure ? "; Secure" : ""}`;
  return teamId ? `${base}; Max-Age=${60 * 60 * 24 * 90}` : `${base}; Max-Age=0`;
}

export type TeamAccess = { team: TeamRow; role: TeamRole; plan: PlanId; poolUnits: number; ownerPeriodRow: NonNullable<Awaited<ReturnType<typeof getWorkspace>>> };

const REVOKED = () => new HttpError(403, "You don't have access to that team workspace. Switch back to your personal workspace.", "team_access_revoked");

/**
 * @param need what the request needs: an action, or "method" to derive it from the HTTP method.
 * A team that doesn't exist and a team you aren't in give the same answer (no enumeration).
 */
export async function resolveTeamAccess(user: { id: string; verified: boolean }, teamId: string, method: string, need: TeamAction | "method" = "method", opts: { allowPaused?: boolean } = {}): Promise<TeamAccess> {
  const team = isTeamId(teamId) ? await teams().get(teamId, teamId) : null;
  if (!team || !user.verified) throw REVOKED();
  const member = await memberRows().get(team.id, memberIdFor(user.id));
  if (!member || member.userId !== user.id) throw REVOKED();
  const plan = await effectivePlanOf(team);
  if (!opts.allowPaused && !TEAM_POLICY[plan].available) throw new HttpError(403, "This team workspace is paused because the owner's plan no longer includes teams. The owner can still export or delete it.", "team_inactive");
  const action = need === "method" ? actionForMethod(method) : need;
  if (!roleCan(member.role, action)) {
    const verb = action === "read" ? "see this" : action === "write" ? "change things" : action === "delete" ? "delete things" : action === "publish" ? "publish" : "manage the team";
    throw new HttpError(403, `Your role in this team (${ROLE_LABEL[member.role].toLowerCase()}) can't ${verb}.`, "team_forbidden", { role: member.role, needs: action });
  }
  const owner = await getWorkspace(team.ownerWorkspaceId);
  if (!owner) throw REVOKED();
  const pool = typeof team.poolUnits === "number" && team.poolUnits >= 0 ? team.poolUnits : TEAM_POLICY[plan].poolUnits;
  return { team, role: member.role, plan, poolUnits: pool, ownerPeriodRow: owner };
}
