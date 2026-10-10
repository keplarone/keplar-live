/**
 * Team workspaces (BETA): roles, what each role may do, and the per-plan policy. Pure and client-safe (no server imports).
 *
 * Roles
 *   viewer  reads shared projects, chats and sites. Cannot change anything or ask in the team (an ask spends the team's shared pool).
 *   member (Editor in UI)  viewer + creates and edits shared projects, chats and sites, and asks in the team.
 *   admin   member + deletes shared items, publishes sites, invites and removes members and viewers, reads the audit log.
 *   owner   admin + promotes and removes admins, renames or deletes the team, exports the team's data. Exactly one per team.
 *
 * Plan policy (TODO(founder approval): proposed numbers, like src/lib/orchestration/plans.ts). Teams start on Business.
 * Business has no fixed monthly allowance in the metering code (a custom contract), so a team gets ONE shared pool that every
 * member's asks draw from; it is not multiplied by the number of members, and it is separate from the owner's personal use.
 * An admin can set a different pool for a contracted team (`poolUnits` on the team row).
 */
import type { PlanId } from "@/lib/create/platform/plans";

export type TeamRole = "owner" | "admin" | "member" | "viewer";
export const TEAM_ROLES: readonly TeamRole[] = ["owner", "admin", "member", "viewer"] as const;
export const ASSIGNABLE_ROLES: readonly TeamRole[] = ["admin", "member", "viewer"] as const;
export const ROLE_LABEL: Record<TeamRole, string> = { owner: "Owner", admin: "Admin", member: "Editor", viewer: "Viewer" };
export const ROLE_BLURB: Record<TeamRole, string> = {
  owner: "Everything, including promoting admins, exporting and deleting the team.",
  admin: "Creates, edits, deletes and publishes; invites and removes members and viewers; reads the audit log.",
  member: "Editor: creates and edits shared projects, chats and sites, and asks in the team. Cannot delete or publish.",
  viewer: "Reads shared projects, chats and sites. Cannot change anything or ask.",
};

export type TeamAction = "read" | "write" | "delete" | "publish" | "manage" | "owner";
const RANK: Record<TeamRole, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };
const NEEDS: Record<TeamAction, TeamRole> = { read: "viewer", write: "member", delete: "admin", publish: "admin", manage: "admin", owner: "owner" };

export const isRole = (v: unknown): v is TeamRole => typeof v === "string" && (TEAM_ROLES as readonly string[]).includes(v);
export const isAssignable = (v: unknown): v is TeamRole => typeof v === "string" && (ASSIGNABLE_ROLES as readonly string[]).includes(v);
export const roleCan = (role: TeamRole, action: TeamAction): boolean => RANK[role] >= RANK[NEEDS[action]];

/** What an HTTP method needs on a team-aware route: reading is read, DELETE is delete, everything else writes. Routes may ask for more (publish). */
export function actionForMethod(method: string): TeamAction {
  const m = method.toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return "read";
  if (m === "DELETE") return "delete";
  return "write";
}

/** Who may give someone this role (invite or change)? Admins hand out member and viewer only; only the owner makes admins. Nobody makes a second owner. */
export function mayAssign(actor: TeamRole, next: TeamRole): boolean {
  if (next === "owner") return false;
  if (actor === "owner") return true;
  if (actor === "admin") return next === "member" || next === "viewer";
  return false;
}
/** Who may change or remove someone currently holding `target`? Owners cannot be removed (delete the team instead). */
export function mayManage(actor: TeamRole, target: TeamRole): boolean {
  if (target === "owner") return false;
  if (actor === "owner") return true;
  if (actor === "admin") return target === "member" || target === "viewer";
  return false;
}

export type TeamPlanPolicy = {
  available: boolean;
  /** Members including the owner. */
  maxMembers: number;
  /** Shared monthly pool in Keplar credits, drawn by every member's asks in the team. */
  poolUnits: number;
  /** Invite emails one team may send per day (a guard against the invite form being used to mail strangers). */
  invitesPerDay: number;
  /** Open (draft or sent, not yet accepted) invites at once. */
  openInvites: number;
};

export const TEAM_POLICY: Record<PlanId, TeamPlanPolicy> = {
  free: { available: false, maxMembers: 1, poolUnits: 0, invitesPerDay: 0, openInvites: 0 },
  lite: { available: false, maxMembers: 1, poolUnits: 0, invitesPerDay: 0, openInvites: 0 },
  plus: { available: false, maxMembers: 1, poolUnits: 0, invitesPerDay: 0, openInvites: 0 },
  pro: { available: false, maxMembers: 1, poolUnits: 0, invitesPerDay: 0, openInvites: 0 },
  // TODO(founder approval): 10 seats and a 13,500-credit pool (the size of one Pro allowance) are proposals.
  business: { available: true, maxMembers: 10, poolUnits: 13_500, invitesPerDay: 20, openInvites: 20 },
};
export const teamAvailable = (plan: PlanId) => TEAM_POLICY[plan].available;

export const INVITE_TTL_DAYS = 7;
export const TEAM_NAME_MAX = 60;

/** The sentence the product shows next to the pool, so the limit is stated exactly as enforced. */
export function poolStatement(p: TeamPlanPolicy = TEAM_POLICY.business): string {
  return `One shared pool of ${p.poolUnits.toLocaleString("en-US")} credits a month for the whole team (not per member), up to ${p.maxMembers} members including the owner. Every member's asks in the team draw from it, and there are no per-member caps yet. It is separate from the owner's personal use. A contract can set a different pool.`;
}

/** Plain-language list of what is and is not shared. */
export const TEAM_SCOPE = {
  shared: ["Projects (notes, files, instructions)", "Chats saved in the team", "Sites you build in the team, with their versions"],
  notShared: ["Anyone's personal chats, memory, projects or sites", "Billing and the owner's account", "Site visitor data (leads, orders, analytics): owner's personal workspace only for now"],
};
