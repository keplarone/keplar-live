/** Team workspaces: row types and collections only (no imports from accounts or workspace, so those can import this). */
import { collection } from "@/lib/create/platform/store";
import type { TeamRole } from "./policy";

export type TeamRow = {
  id: string;
  /** A team's rows are scoped by its own id, like a workspace row. */
  workspaceId: string;
  name: string;
  ownerUserId: string;
  ownerEmail: string;
  /** The owner's personal workspace: its plan and billing period decide what the team may use. */
  ownerWorkspaceId: string;
  /** Operator override of the shared monthly pool (contracted teams). */
  poolUnits?: number | null;
  createdAt: string;
  updatedAt: string;
};

export type MemberRow = {
  id: string;
  workspaceId: string;
  teamId: string;
  userId: string;
  email: string;
  name: string | null;
  role: TeamRole;
  invitedBy: string | null;
  addedAt: string;
};

export type InviteStatus = "draft" | "sent" | "accepted" | "revoked";
export type InviteRow = {
  id: string;
  workspaceId: string;
  teamId: string;
  /** Lower-case address the invite is for. Only a verified account with this address can accept. */
  email: string;
  role: TeamRole;
  status: InviteStatus;
  /** sha256 of the current link token. The token itself is never stored; sending or copying mints a new one. */
  tokenHash: string | null;
  createdBy: string;
  createdByEmail: string;
  createdAt: string;
  sentAt: string | null;
  sentVia: "email" | "link" | null;
  expiresAt: string | null;
  acceptedAt: string | null;
};

export type AuditRow = {
  id: string;
  workspaceId: string;
  at: string;
  actorUserId: string | null;
  actorEmail: string | null;
  action: string;
  /** Email or id of who/what it was about. Never content. */
  target: string | null;
  detail: string | null;
};

export const teams = () => collection<TeamRow>("team_teams");
export const memberRows = () => collection<MemberRow>("team_members");
export const inviteRows = () => collection<InviteRow>("team_invites");
export const auditRows = () => collection<AuditRow>("team_audit");

export const TEAM_PREFIX = "tm_";
export const isTeamId = (id: string) => /^tm_[0-9a-f]{16}$/.test(id);

/**
 * A per-person index of the teams they belong to, stored in THEIR OWN workspace scope so listing "my teams" is a keyed read, not a scan.
 * It is only a hint: access is always decided by the MemberRow in the team's scope, and a stale entry is dropped when it fails that check.
 */
export type MembershipRow = { id: string; workspaceId: string; teamId: string; userId: string; role: TeamRole; addedAt: string };
export const membershipIndex = () => collection<MembershipRow>("team_memberships");
