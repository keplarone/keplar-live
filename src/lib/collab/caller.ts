/** Request → identity + the workspaces the caller may act in, for the collab routes. */
import { getSession } from "@/lib/accounts/auth";
import { HttpError } from "@/lib/create/platform/http";
import { currentWorkspace, type Workspace } from "@/lib/create/platform/workspace";
import { resolveAccess, type Identity, type WsView } from "./access";

export async function caller(req: Request): Promise<{ user: Identity; views: WsView[]; personal: Workspace | null }> {
  const session = await getSession(req.headers);
  if (!session) throw new HttpError(401, "Sign in to join a live session.", "unauthenticated");
  const u = session.user as { id: string; email: string; name?: string | null; emailVerified?: boolean | null };
  const user: Identity = { id: u.id, email: u.email, name: (u.name || u.email.split("@")[0] || "Someone").slice(0, 60), verified: Boolean(u.emailVerified) };
  // Collab does its own role checks, so the team view is resolved for reading only (a team viewer can still watch).
  const team = await currentWorkspace(req, { team: "read" }).catch(() => null);
  const personal = await currentWorkspace(req).catch(() => null);
  const views: WsView[] = [team?.team ? team : null, personal].filter(Boolean) as WsView[];
  return { user, views, personal };
}

export async function access(req: Request, siteId: string) {
  const c = await caller(req);
  return { ...c, access: await resolveAccess(c.user, siteId, c.views) };
}
