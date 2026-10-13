/**
 * Team workspaces (BETA): create, members, invites, audit, leave/remove, export and delete.
 *
 * Data model: a team is its own tenant. Its shared projects, chats and sites are stored under the team id (`tm_...`) exactly like
 * a personal workspace's, so the existing per-tenant scoping, export and deletion apply unchanged. The team has no plan of its own: the
 * owner's plan decides whether it is usable (src/lib/team/policy.ts). Access is decided per request from a membership row, never
 * from anything cached, so removing a member takes effect on their very next request.
 *
 * Invites are drafts. Creating one sends nothing. The email goes out only when the owner or an admin presses Send, through the same
 * mail path as every other Keplar email (Resend). The link carries a one-time token that is stored only as a hash; sending or copying
 * the link mints a new one and the old link stops working.
 */
import { randomBytes } from "node:crypto";
import { sendEmail, emailConfigured } from "@/lib/accounts/outbox";
import { validEmail } from "@/lib/accounts/password-policy";
import { HttpError } from "@/lib/create/platform/http";
import { now } from "@/lib/create/platform/ids";
import { rateLimit, RateLimitError } from "@/lib/create/platform/ratelimit";
import { storeDurable } from "@/lib/create/platform/store";
import { brand } from "@/lib/site";
import { workspaceIdForUser } from "@/lib/accounts/workspaces";
import { auditRows, inviteRows, isTeamId, memberRows, membershipIndex, teams, type AuditRow, type InviteRow, type MemberRow, type TeamRow } from "./rows";
import { INVITE_TTL_DAYS, isAssignable, mayAssign, mayManage, ROLE_LABEL, TEAM_NAME_MAX, TEAM_POLICY, teamAvailable, type TeamRole } from "./policy";
import { effectivePlanOf } from "./plan";
import { businessSeats } from "@/lib/business/seats";

import { hashToken, memberIdFor, newTeamId } from "./ids";
export { hashToken, memberIdFor, newTeamId };
const hex = (n: number) => randomBytes(n).toString("hex");
const norm = (e: string) => e.trim().toLowerCase();
export const cleanTeamName = (v: unknown): string => (typeof v === "string" ? v.replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, TEAM_NAME_MAX) : "");

export type Actor = { userId: string; email: string };

// ---- audit
const AUDIT_KEEP = 500;
export async function audit(teamId: string, actor: Actor | null, action: string, target: string | null = null, detail: string | null = null): Promise<void> {
  try {
    await auditRows().insert({ id: `aud_${hex(8)}`, workspaceId: teamId, at: now(), actorUserId: actor?.userId ?? null, actorEmail: actor?.email ?? null, action: action.slice(0, 60), target: target ? target.slice(0, 200) : null, detail: detail ? detail.slice(0, 300) : null });
    const all = await auditRows().list(teamId);
    if (all.length > AUDIT_KEEP) for (const r of all.sort((a, b) => a.at.localeCompare(b.at)).slice(0, all.length - AUDIT_KEEP)) await auditRows().remove(teamId, r.id);
  } catch {
    /* the audit log never blocks the action it records */
  }
}
export async function listAudit(teamId: string, limit = 100): Promise<AuditRow[]> {
  return (await auditRows().list(teamId)).sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

// ---- lookups
export const getTeam = (id: string) => (isTeamId(id) ? teams().get(id, id) : Promise.resolve(null));
export const getMember = (teamId: string, userId: string) => memberRows().get(teamId, memberIdFor(userId));
export const listMembers = async (teamId: string) => (await memberRows().list(teamId)).sort((a, b) => a.addedAt.localeCompare(b.addedAt));
/** The team this user owns, if any (one per owner). */
export const ownedTeam = (userId: string) => teams().findSystemBy("ownerUserId", userId);
// The person's own index of their teams (a keyed read in their workspace scope). Only a hint; every entry is checked against the team's member row.
const indexPut = (m: Pick<MemberRow, "teamId" | "userId" | "role" | "addedAt">) =>
  membershipIndex().insertIfAbsent({ id: m.teamId, workspaceId: workspaceIdForUser(m.userId), teamId: m.teamId, userId: m.userId, role: m.role, addedAt: m.addedAt }).then(async (r) => { if (!r.inserted && r.row.role !== m.role) await membershipIndex().update(r.row.workspaceId, r.row.id, { role: m.role }); }).catch(() => undefined);
const indexDrop = (userId: string, teamId: string) => membershipIndex().remove(workspaceIdForUser(userId), teamId).catch(() => false);

/** Every team the user belongs to (the switcher). Stale index entries (removed, team deleted) are filtered out and cleaned. */
export async function teamsOf(userId: string): Promise<{ team: TeamRow; role: TeamRole }[]> {
  const out: { team: TeamRow; role: TeamRole }[] = [];
  for (const ix of await membershipIndex().list(workspaceIdForUser(userId)).catch(() => [])) {
    const [t, m] = await Promise.all([getTeam(ix.teamId), getMember(ix.teamId, userId)]);
    if (t && m) out.push({ team: t, role: m.role });
    else await indexDrop(userId, ix.teamId);
  }
  return out.sort((a, b) => a.team.name.localeCompare(b.team.name));
}

// ---- create / rename
export async function createTeam(input: { userId: string; email: string; name?: string | null; ownerWorkspaceId: string; verified: boolean; plan: Parameters<typeof teamAvailable>[0]; nameWanted: unknown }): Promise<TeamRow> {
  if (!input.verified) throw new HttpError(403, "Verify your email address first.", "unverified");
  if (!storeDurable()) throw new HttpError(503, "Team workspaces need Keplar's production database, which isn't connected here.", "not_configured");
  if (!teamAvailable(input.plan)) throw new HttpError(402, "Team workspaces start on the Business plan.", "team_plan");
  if (await ownedTeam(input.userId)) throw new HttpError(409, "You already own a team workspace.", "team_exists");
  const name = cleanTeamName(input.nameWanted) || `${(input.name || input.email.split("@")[0]).slice(0, 40)}'s team`;
  const id = newTeamId();
  const t = now();
  const row: TeamRow = { id, workspaceId: id, name, ownerUserId: input.userId, ownerEmail: input.email, ownerWorkspaceId: input.ownerWorkspaceId, poolUnits: null, createdAt: t, updatedAt: t };
  await teams().insert(row);
  await memberRows().insert({ id: memberIdFor(input.userId), workspaceId: id, teamId: id, userId: input.userId, email: norm(input.email), name: input.name ?? null, role: "owner", invitedBy: null, addedAt: t });
  await indexPut({ teamId: id, userId: input.userId, role: "owner", addedAt: t });
  await audit(id, { userId: input.userId, email: input.email }, "team.created", name);
  return row;
}

export async function renameTeam(team: TeamRow, actor: Actor, nameWanted: unknown): Promise<TeamRow> {
  const name = cleanTeamName(nameWanted);
  if (!name) throw new HttpError(400, "Give the team a name.");
  const next = (await teams().update(team.id, team.id, { name, updatedAt: now() })) ?? team;
  await audit(team.id, actor, "team.renamed", name);
  return next;
}

// ---- capacity
export async function capacity(team: TeamRow) {
  const plan = await effectivePlanOf(team);
  // On Keplar Business the seats are the tier the owner bought (Starter 1, Growth 5, Scale 15), not the flat team policy.
  const seats = plan === "business" ? await businessSeats(team.ownerWorkspaceId, team.ownerEmail) : null;
  const p = seats ? { ...TEAM_POLICY[plan], maxMembers: seats } : TEAM_POLICY[plan];
  const members = await listMembers(team.id);
  const open = (await inviteRows().list(team.id)).filter(isOpen);
  return { plan, policy: p, members: members.length, openInvites: open.length, seatsLeft: Math.max(0, p.maxMembers - members.length) };
}
const isOpen = (i: InviteRow) => (i.status === "draft" || i.status === "sent") && !expired(i);
const expired = (i: InviteRow) => Boolean(i.expiresAt) && Date.parse(i.expiresAt as string) < Date.now();

// ---- invites (drafts)
export async function listInvites(teamId: string): Promise<InviteRow[]> {
  return (await inviteRows().list(teamId)).filter((i) => i.status !== "accepted" && i.status !== "revoked").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function draftInvite(team: TeamRow, actorRole: TeamRole, actor: Actor, emailIn: unknown, roleIn: unknown): Promise<InviteRow> {
  if (!validEmail(emailIn)) throw new HttpError(400, "Enter a valid email address.", "bad_email");
  const email = norm(emailIn);
  if (!isAssignable(roleIn)) throw new HttpError(400, "Choose a role: admin, member or viewer.", "bad_role");
  if (!mayAssign(actorRole, roleIn)) throw new HttpError(403, roleIn === "admin" ? "Only the owner can invite an admin." : "Your role can't invite people.", "forbidden_role");
  const cap = await capacity(team);
  if (!cap.policy.available) throw new HttpError(402, "Team workspaces start on the Business plan.", "team_plan");
  const members = await listMembers(team.id);
  if (members.some((m) => m.email === email)) throw new HttpError(409, "That person is already on the team.", "already_member");
  const existing = (await inviteRows().list(team.id)).find((i) => i.email === email && isOpen(i));
  if (existing) {
    // Re-drafting the same address changes the role of the open invite instead of piling up duplicates.
    const next = (await inviteRows().update(team.id, existing.id, { role: roleIn })) ?? existing;
    await audit(team.id, actor, "invite.updated", email, `role ${roleIn}`);
    return next;
  }
  if (cap.openInvites >= cap.policy.openInvites) throw new HttpError(409, `This team has ${cap.policy.openInvites} open invites. Revoke one to add another.`, "limit");
  if (cap.seatsLeft - cap.openInvites <= 0) throw new HttpError(409, `This team is at its limit of ${cap.policy.maxMembers} members (open invites count).`, "limit");
  const t = now();
  const row: InviteRow = { id: `inv_${hex(8)}`, workspaceId: team.id, teamId: team.id, email, role: roleIn, status: "draft", tokenHash: null, createdBy: actor.userId, createdByEmail: actor.email, createdAt: t, sentAt: null, sentVia: null, expiresAt: null, acceptedAt: null };
  await inviteRows().insert(row);
  await audit(team.id, actor, "invite.drafted", email, `role ${roleIn}; nothing sent`);
  return row;
}

export function joinLink(token: string, origin = new URL(process.env.BETTER_AUTH_URL || "https://keplar.one").origin): string {
  // The token rides in the fragment: it is never sent to a server in a request line, a log or a Referer header.
  return `${origin}/team/join#${token}`;
}

export function inviteEmail(i: { teamName: string; inviterEmail: string; role: TeamRole; link: string; days?: number }) {
  return {
    subject: `${i.inviterEmail} invited you to ${i.teamName} on ${brand.name}`,
    text: [
      `${i.inviterEmail} invited you to join the team "${i.teamName}" on ${brand.name} as ${ROLE_LABEL[i.role].toLowerCase()}.`,
      "",
      "Open this link while signed in with this email address to accept:",
      i.link,
      "",
      `The link works for ${i.days ?? INVITE_TTL_DAYS} days and only for this address. Joining gives you access to the team's shared projects, chats and sites, never to your personal ones. You can leave the team at any time.`,
      "",
      `If you weren't expecting this, ignore this email; nothing happens until you accept. ${brand.name} · https://keplar.one`,
    ].join("\n"),
  };
}

/** Mint a fresh token for an open invite (the previous link stops working) and mark it sent. Email goes out only here, on the actor's explicit action. */
export async function sendInvite(team: TeamRow, actor: Actor, inviteId: string, via: "email" | "link", origin?: string): Promise<{ invite: InviteRow; link: string | null; emailed: boolean; emailAvailable: boolean }> {
  const inv = await inviteRows().get(team.id, inviteId);
  if (!inv || !isOpen(inv)) throw new HttpError(404, "That invite is not open any more.", "not_found");
  const cap = await capacity(team);
  if (!cap.policy.available) throw new HttpError(402, "Team workspaces start on the Business plan.", "team_plan");
  if (via === "email") {
    if (!emailConfigured()) {
      return { invite: inv, link: null, emailed: false, emailAvailable: false };
    }
    try {
      await rateLimit(`team:${team.id}:invite-mail`, cap.policy.invitesPerDay, 86_400, { shared: true });
      await rateLimit(`team:${team.id}:invite-to:${inv.email}`, 3, 86_400, { shared: true });
    } catch (e) {
      if (e instanceof RateLimitError) throw new HttpError(429, "This team has sent its invite emails for today. Copy the link instead, or try tomorrow.", "rate_limited");
      throw e;
    }
  }
  const token = randomBytes(32).toString("base64url");
  const link = joinLink(token, origin);
  const t = now();
  const patch: Partial<InviteRow> = { tokenHash: hashToken(token), status: "sent", sentAt: t, sentVia: via, expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 864e5).toISOString() };
  let emailed = false;
  if (via === "email") {
    const mail = inviteEmail({ teamName: team.name, inviterEmail: actor.email, role: inv.role, link });
    emailed = await sendEmail({ to: inv.email, kind: "team-invite", ...mail }).catch(() => false);
    if (!emailed) throw new HttpError(502, "The invite email could not be sent. Nothing was sent; copy the link instead.", "email_failed");
  }
  const next = (await inviteRows().update(team.id, inv.id, patch)) ?? inv;
  await audit(team.id, actor, via === "email" ? "invite.emailed" : "invite.link_created", inv.email, `role ${inv.role}`);
  return { invite: next, link: via === "link" ? link : null, emailed, emailAvailable: true };
}

export async function revokeInvite(team: TeamRow, actor: Actor, inviteId: string): Promise<boolean> {
  const inv = await inviteRows().get(team.id, inviteId);
  if (!inv || inv.status === "accepted" || inv.status === "revoked") return false;
  await inviteRows().update(team.id, inv.id, { status: "revoked", tokenHash: null });
  await audit(team.id, actor, "invite.revoked", inv.email);
  return true;
}

/** What the join page may show before the person accepts (token → team name, role). Nothing about members. */
export async function previewInvite(token: string): Promise<{ teamName: string; role: TeamRole; email: string } | null> {
  const inv = await findOpenByToken(token);
  if (!inv) return null;
  const team = await getTeam(inv.teamId);
  return team ? { teamName: team.name, role: inv.role, email: inv.email } : null;
}
async function findOpenByToken(token: string): Promise<InviteRow | null> {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return null;
  const inv = await inviteRows().findSystemBy("tokenHash", hashToken(token));
  return inv && inv.status === "sent" && !expired(inv) ? inv : null;
}

export async function acceptInvite(token: string, user: { userId: string; email: string; name?: string | null; verified: boolean }): Promise<{ team: TeamRow; role: TeamRole }> {
  const inv = await findOpenByToken(token);
  if (!inv) throw new HttpError(404, "This invite link is not valid any more. Ask for a new one.", "invite_invalid");
  if (!user.verified) throw new HttpError(403, "Verify your email address first.", "unverified");
  // The invite is for one address. A different signed-in account is refused without saying whose invite it is.
  if (norm(user.email) !== inv.email) throw new HttpError(403, "This invite was sent to a different email address. Sign in with that address to accept it.", "wrong_account");
  const team = await getTeam(inv.teamId);
  if (!team) throw new HttpError(404, "This team no longer exists.", "invite_invalid");
  const cap = await capacity(team);
  if (!cap.policy.available) throw new HttpError(402, "This team's plan no longer includes team workspaces.", "team_plan");
  const already = await getMember(team.id, user.userId);
  if (!already) {
    if (cap.members >= cap.policy.maxMembers) throw new HttpError(409, "This team is full.", "team_full");
    const addedAt = now();
    await memberRows().insert({ id: memberIdFor(user.userId), workspaceId: team.id, teamId: team.id, userId: user.userId, email: norm(user.email), name: user.name ?? null, role: inv.role, invitedBy: inv.createdBy, addedAt });
    await indexPut({ teamId: team.id, userId: user.userId, role: inv.role, addedAt });
  }
  await inviteRows().update(team.id, inv.id, { status: "accepted", tokenHash: null, acceptedAt: now() });
  await audit(team.id, { userId: user.userId, email: user.email }, "invite.accepted", user.email, `role ${already ? already.role : inv.role}`);
  return { team, role: already ? already.role : inv.role };
}

// ---- members
export async function changeRole(team: TeamRow, actorRole: TeamRole, actor: Actor, targetUserId: string, roleIn: unknown): Promise<MemberRow> {
  if (!isAssignable(roleIn)) throw new HttpError(400, "Choose a role: admin, member or viewer.", "bad_role");
  const target = await getMember(team.id, targetUserId);
  if (!target) throw new HttpError(404, "That person is not on the team.", "not_found");
  if (target.userId === actor.userId) throw new HttpError(403, "You can't change your own role.", "forbidden_role");
  if (!mayManage(actorRole, target.role) || !mayAssign(actorRole, roleIn)) throw new HttpError(403, "Your role can't make that change.", "forbidden_role");
  if (target.role === roleIn) return target;
  const next = (await memberRows().update(team.id, target.id, { role: roleIn })) ?? target;
  await indexPut({ teamId: team.id, userId: target.userId, role: roleIn, addedAt: target.addedAt });
  await audit(team.id, actor, "member.role_changed", target.email, `${target.role} -> ${roleIn}`);
  return next;
}

/** Remove someone (an admin/owner acting) or leave (the person themselves). Takes effect on their next request: access is read from this row each time. */
export async function removeMember(team: TeamRow, actorRole: TeamRole, actor: Actor, targetUserId: string): Promise<MemberRow> {
  const target = await getMember(team.id, targetUserId);
  if (!target) throw new HttpError(404, "That person is not on the team.", "not_found");
  const self = target.userId === actor.userId;
  if (target.role === "owner") throw new HttpError(403, "The owner can't be removed. Delete the team instead.", "forbidden_role");
  if (!self && !mayManage(actorRole, target.role)) throw new HttpError(403, "Your role can't remove that person.", "forbidden_role");
  await memberRows().remove(team.id, target.id);
  await indexDrop(target.userId, team.id);
  await audit(team.id, actor, self ? "member.left" : "member.removed", target.email, `was ${target.role}`);
  return target;
}

/** A closed account leaves every team it belonged to (the owner must delete or have deleted the team first; see the account delete route). */
export async function removeUserFromTeams(userId: string): Promise<number> {
  let n = 0;
  for (const m of await memberRows().listSystem((x) => x.userId === userId && x.role !== "owner")) {
    if (await memberRows().remove(m.teamId, m.id)) {
      n++;
      await indexDrop(userId, m.teamId);
      await audit(m.teamId, null, "member.left", m.email, "account closed");
    }
  }
  return n;
}

// ---- export / delete (owner)
export async function deleteTeam(team: TeamRow, actor: Actor): Promise<{ deleted: number }> {
  const { sites, isDeleted } = await import("@/lib/site-builder/store");
  const { softDeleteSite, purgeSite } = await import("@/lib/site-builder/deletion");
  const { deleteWorkspaceData } = await import("@/lib/privacy/account-data");
  for (const s of await sites().list(team.id).catch(() => [])) {
    try {
      if (!isDeleted(s)) await softDeleteSite({ id: team.id }, s);
      const fresh = await sites().get(team.id, s.id);
      if (fresh) await purgeSite(fresh); // detaches custom domains and holds the address; a taken-down site is removed with the rest below
    } catch {
      /* the raw row delete below still removes it */
    }
  }
  for (const m of await listMembers(team.id)) await indexDrop(m.userId, team.id);
  const res = await deleteWorkspaceData(team.id);
  void actor; // the audit log goes with the team; the operator-level record holds only the id
  const { writeAudit } = await import("@/lib/ops/audit");
  await writeAudit("user", "team.delete", `team ${team.id}`).catch(() => undefined);
  return { deleted: res.deleted };
}

export async function teamPoolUnits(team: TeamRow, plan: Parameters<typeof teamAvailable>[0]): Promise<number> {
  return typeof team.poolUnits === "number" && team.poolUnits >= 0 ? team.poolUnits : TEAM_POLICY[plan].poolUnits;
}

