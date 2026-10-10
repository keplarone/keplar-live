/** Shared guards for /api/team/**. Team management never runs on the team cookie: the team comes from the URL and the role from the membership row. */
import { getSession } from "@/lib/accounts/auth";
import { ensureWorkspaceForUser } from "@/lib/accounts/workspaces";
import { HttpError } from "@/lib/create/platform/http";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { assertSameOrigin, SAFE_METHODS } from "@/lib/security/origin";
import { currentWorkspace, type Workspace } from "@/lib/create/platform/workspace";
import { resolveTeamAccess, type TeamAccess } from "./resolve";
import type { TeamAction } from "./policy";
import type { Actor } from "./store";

export type Account = { ws: Workspace; userId: string; email: string; name: string | null; verified: boolean; actor: Actor };

/** Signed in (any plan, any workspace): the caller's PERSONAL workspace and identity. Same-origin and rate limits for writes. */
export async function accountOf(req: Request): Promise<Account> {
  if (!SAFE_METHODS.has(req.method.toUpperCase())) assertSameOrigin(req);
  const session = await getSession(req.headers);
  if (!session) throw new HttpError(401, "Sign in to continue.", "unauthenticated");
  const row = await ensureWorkspaceForUser({ id: session.user.id, email: session.user.email, name: session.user.name });
  await limitRequest(req, "team", { perIp: 600, perAccount: 120, accountId: row.id });
  const ws = await currentWorkspace(req); // personal, whatever the team cookie says
  return { ws, userId: session.user.id, email: session.user.email, name: session.user.name ?? null, verified: Boolean(session.user.emailVerified), actor: { userId: session.user.id, email: session.user.email } };
}

/** The caller as a member of `teamId` with at least `need`. Not a member and no such team look the same. */
export async function teamAs(req: Request, teamId: string, need: TeamAction): Promise<Account & { access: TeamAccess }> {
  const acc = await accountOf(req);
  const access = await resolveTeamAccess({ id: acc.userId, verified: acc.verified }, teamId, req.method, need, { allowPaused: true }); // management stays reachable when the plan paused the team: the owner must still be able to export and delete
  return { ...acc, access };
}
