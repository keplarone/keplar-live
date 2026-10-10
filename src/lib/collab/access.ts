/**
 * Access to a live session. Three ways in, checked on every request (nothing cached):
 *   1. the creation is in your workspace (owner), or in a team you belong to (team role, mapped by collabCan);
 *   2. you redeemed an invite link for it (a grant with the invite's role: editor or viewer);
 *   3. otherwise 404, exactly as if the creation did not exist.
 * Invite tokens are 32 random bytes; only their sha256 is stored. They expire, can be capped in uses and revoked; revoking an
 * invite also removes the grants made through it.
 */
import { createHash, randomBytes } from "node:crypto";
import { HttpError } from "@/lib/create/platform/http";
import { id as newId, now } from "@/lib/create/platform/ids";
import { collection } from "@/lib/create/platform/store";
import { isDeleted, sites } from "@/lib/site-builder/store";
import type { Site } from "@/lib/site-builder/types";
import { colorFor, collabCan, fromTeamRole, type CollabAction, type CollabRole } from "./roles";
import type { TeamRole } from "@/lib/team/policy";

export type Invite = { id: string; workspaceId: string; siteId: string; role: "editor" | "viewer"; tokenHash: string; createdBy: string; createdByName: string; createdAt: string; expiresAt: string; maxUses: number; uses: number; revoked: boolean };
export type Grant = { id: string; workspaceId: string; siteId: string; userId: string; email: string; name: string; role: "editor" | "viewer"; inviteId: string; grantedAt: string };
export const invites = () => collection<Invite>("collab_invites");
export const grants = () => collection<Grant>("collab_grants");

export type Identity = { id: string; email: string; name: string; verified: boolean };
/** The caller's own workspace view (personal or active team), as currentWorkspace returns it. */
export type WsView = { id: string; team?: { role: TeamRole } } | null;

export type Access = { site: Site; role: CollabRole; user: Identity & { color: string }; via: "owner" | "team" | "invite" };

const sha = (t: string) => createHash("sha256").update(t).digest("hex");

/** Resolves the caller's role on a creation. `views` are the workspaces the caller may act in (active team first, then personal). */
export async function resolveAccess(user: Identity, siteId: string, views: WsView[]): Promise<Access> {
  if (!/^[a-z]{2,5}_[A-Za-z0-9_-]{4,64}$/.test(siteId)) throw new HttpError(404, "Not found.", "not_found");
  for (const v of views) {
    if (!v) continue;
    const s = await sites().get(v.id, siteId);
    if (s && !isDeleted(s)) return { site: s, role: v.team ? fromTeamRole(v.team.role) : "owner", user: { ...user, color: colorFor(user.id) }, via: v.team ? "team" : "owner" };
  }
  const s = await sites().findSystemBy("id", siteId);
  if (s && !isDeleted(s)) {
    const g = await grants().get(s.workspaceId, `${siteId}:${user.id}`);
    if (g) return { site: s, role: g.role, user: { ...user, color: colorFor(user.id) }, via: "invite" };
  }
  throw new HttpError(404, "Not found.", "not_found");
}

export function assertCan(a: Pick<Access, "role">, action: CollabAction) {
  if (!collabCan(a.role, action)) {
    const what: Record<CollabAction, string> = { view: "view this session", edit: "edit in this session", save: "save versions", split: "split off a branch", run: "run commands", invite: "invite people", deploy: "deploy" };
    throw new HttpError(403, `Your role (${a.role}) can't ${what[action]}.`, "forbidden");
  }
}

export async function createInvite(a: Access, input: { role: "editor" | "viewer"; days?: number; maxUses?: number }) {
  assertCan(a, "invite");
  const open = await invites().list(a.site.workspaceId, (i) => i.siteId === a.site.id && !i.revoked && i.expiresAt > now());
  if (open.length >= 20) throw new HttpError(429, "This creation already has 20 open invite links. Revoke one first.", "limit");
  const token = randomBytes(32).toString("base64url");
  const days = Math.min(30, Math.max(1, Math.round(input.days ?? 7)));
  const inv: Invite = { id: newId("inv"), workspaceId: a.site.workspaceId, siteId: a.site.id, role: input.role, tokenHash: sha(token), createdBy: a.user.id, createdByName: a.user.name, createdAt: now(), expiresAt: new Date(Date.now() + days * 86_400_000).toISOString(), maxUses: Math.min(50, Math.max(1, Math.round(input.maxUses ?? 10))), uses: 0, revoked: false };
  await invites().insert(inv);
  return { invite: publicInvite(inv), token };
}

export const publicInvite = (i: Invite) => ({ id: i.id, role: i.role, createdByName: i.createdByName, createdAt: i.createdAt, expiresAt: i.expiresAt, maxUses: i.maxUses, uses: i.uses, revoked: i.revoked });

export async function listInvites(a: Access) {
  assertCan(a, "invite");
  const inv = await invites().list(a.site.workspaceId, (i) => i.siteId === a.site.id);
  const gr = await grants().list(a.site.workspaceId, (g) => g.siteId === a.site.id);
  return {
    invites: inv.filter((i) => !i.revoked && i.expiresAt > now()).sort((x, y) => y.createdAt.localeCompare(x.createdAt)).map(publicInvite),
    people: gr.map((g) => ({ userId: g.userId, name: g.name, email: g.email, role: g.role, grantedAt: g.grantedAt, color: colorFor(g.userId) })),
  };
}

export async function revokeInvite(a: Access, inviteId: string) {
  assertCan(a, "invite");
  const inv = await invites().get(a.site.workspaceId, inviteId);
  if (!inv || inv.siteId !== a.site.id) throw new HttpError(404, "Invite not found.", "not_found");
  await invites().update(a.site.workspaceId, inviteId, { revoked: true });
  for (const g of await grants().list(a.site.workspaceId, (x) => x.inviteId === inviteId)) await grants().remove(a.site.workspaceId, g.id);
}

export async function removePerson(a: Access, userId: string) {
  assertCan(a, "invite");
  await grants().remove(a.site.workspaceId, `${a.site.id}:${userId}`);
}

/** Redeems an invite token for the signed-in user. Idempotent for someone who already has access. */
export async function redeemInvite(user: Identity, siteId: string, token: string, views: WsView[]): Promise<Access> {
  try {
    return await resolveAccess(user, siteId, views); // already in (owner, team or earlier invite)
  } catch {
    /* fall through to the invite */
  }
  if (!user.verified) throw new HttpError(403, "Verify your email address to join a live session.", "unverified");
  const s = await sites().findSystemBy("id", siteId);
  if (!s || isDeleted(s) || typeof token !== "string" || token.length < 20) throw new HttpError(404, "This invite link isn't valid.", "not_found");
  const h = sha(token);
  const inv = (await invites().list(s.workspaceId, (i) => i.siteId === siteId && i.tokenHash === h))[0];
  if (!inv || inv.revoked) throw new HttpError(404, "This invite link isn't valid any more.", "not_found");
  if (inv.expiresAt <= now()) throw new HttpError(410, "This invite link has expired. Ask for a new one.", "expired");
  if (inv.uses >= inv.maxUses) throw new HttpError(410, "This invite link has been used up. Ask for a new one.", "used_up");
  await grants().insertIfAbsent({ id: `${siteId}:${user.id}`, workspaceId: s.workspaceId, siteId, userId: user.id, email: user.email, name: user.name, role: inv.role, inviteId: inv.id, grantedAt: now() });
  await invites().increment(s.workspaceId, inv.id, { uses: 1 }, inv);
  return resolveAccess(user, siteId, views);
}
