/**
 * Team workspaces (BETA).
 *   GET  -> what the signed-in person can do: their plan's team policy, the team they own, the teams they belong to, the active one.
 *   POST { name? } -> create the team you will own (Business plan, verified email, one per owner).
 * Detail, members, invites, export and delete live under /api/team/<id>/.
 */
import { body, errorResponse, json } from "@/lib/create/platform/http";
import { teamAvailable, TEAM_POLICY, TEAM_SCOPE, poolStatement, ROLE_BLURB } from "@/lib/team/policy";
import { teamCookie, teamSelector } from "@/lib/team/resolve";
import { createTeam, ownedTeam, teamsOf } from "@/lib/team/store";
import { accountOf } from "@/lib/team/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const acc = await accountOf(req);
    const mine = await teamsOf(acc.userId);
    const sel = teamSelector(req.headers.get("cookie"));
    const active = sel && mine.some((m) => m.team.id === sel) ? sel : null;
    const res = json({
      beta: true,
      plan: acc.ws.plan,
      eligible: teamAvailable(acc.ws.plan),
      policy: TEAM_POLICY.business,
      statement: poolStatement(),
      scope: TEAM_SCOPE,
      roles: ROLE_BLURB,
      owned: (await ownedTeam(acc.userId))?.id ?? null,
      teams: mine.map((m) => ({ id: m.team.id, name: m.team.name, role: m.role })),
      active,
    });
    // A stale selection (removed from the team, or the team was deleted) is cleared here so the app stops asking for it.
    if (sel && !active) res.headers.append("set-cookie", teamCookie(null, new URL(req.url).protocol === "https:"));
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const acc = await accountOf(req);
    const b = await body<{ name?: unknown }>(req);
    const team = await createTeam({ userId: acc.userId, email: acc.email, name: acc.name, ownerWorkspaceId: acc.ws.id, verified: acc.verified, plan: acc.ws.plan, nameWanted: b.name });
    return json({ team: { id: team.id, name: team.name, role: "owner" } }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
