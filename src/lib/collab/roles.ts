/**
 * Who may do what in a live session. Pure and client-safe. Team roles map straight across (Teams' "member" is the Editor);
 * people invited by link get the role written on their invite (editor or viewer, never more).
 */
import type { TeamRole } from "@/lib/team/policy";

export type CollabRole = "owner" | "admin" | "editor" | "viewer";
export type CollabAction = "view" | "edit" | "save" | "split" | "run" | "invite" | "deploy";

const RANK: Record<CollabRole, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 };
const NEEDS: Record<CollabAction, CollabRole> = { view: "viewer", edit: "editor", save: "editor", split: "editor", run: "editor", invite: "admin", deploy: "admin" };

export const collabCan = (role: CollabRole, action: CollabAction) => RANK[role] >= RANK[NEEDS[action]];
export const fromTeamRole = (r: TeamRole): CollabRole => (r === "member" ? "editor" : r);
export const INVITABLE: readonly CollabRole[] = ["editor", "viewer"];
export const isInvitable = (v: unknown): v is "editor" | "viewer" => v === "editor" || v === "viewer";
export const ROLE_NAME: Record<CollabRole, string> = { owner: "Owner", admin: "Admin", editor: "Editor", viewer: "Viewer" };

/**
 * Presence colors: picked for legibility on the graphite base (#0b0b0d) AND as a selection tint, spread around the wheel and
 * deliberately skipping the purple-blue band. Stable per user id, so you are the same color in every session.
 */
export const PRESENCE_COLORS = ["#f2a541", "#3ccf91", "#ff6b5b", "#4fc3d9", "#e7d34f", "#ff8fb1", "#9bd85b", "#f07a2b", "#5ed6c0", "#d9a66b"] as const;
export function colorFor(id: string): string {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return PRESENCE_COLORS[(h >>> 0) % PRESENCE_COLORS.length];
}
export const initialsOf = (name: string) => (name.trim().split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?");
