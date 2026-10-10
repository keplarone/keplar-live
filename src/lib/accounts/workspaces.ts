/**
 * Workspaces are the tenants. Every signed-in user gets one (ensureWorkspaceForUser);
 * plan + billing state live here and are synced from Whop webhooks (see
 * src/lib/billing). Usage resets on the billing date. With DATABASE_URL set
 * the rows are durable; without it they are per-instance, so the plan is also
 * carried in a signed cookie (src/lib/billing/plan-cookie.ts).
 */
import { createHash } from "node:crypto";
import { collection } from "@/lib/create/platform/store";
import { now } from "@/lib/create/platform/ids";
import type { PlanId } from "@/lib/create/platform/plans";
import { isAdminEmail } from "@/lib/billing/admin";
import { isTeamId, teams } from "@/lib/team/rows";

export type Billing = {
  /** Whop user id (user_...) once known. */
  customerId: string | null;
  /** Whop membership id (mem_...) of the active subscription. */
  subscriptionId: string | null;
  status: "none" | "active" | "trialing" | "past_due" | "canceled" | "unpaid" | "incomplete";
  /** Whop plan id (plan_...) that granted the current plan. */
  lookupKey: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  paymentFailedAt: string | null;
  mode: "live" | null;
  /** Whop-hosted page where the customer manages or cancels the membership. */
  manageUrl?: string | null;
};

export type WorkspaceRow = {
  id: string;
  workspaceId: string;
  name: string;
  ownerUserId: string | null;
  ownerEmail: string | null;
  plan: PlanId;
  billing: Billing;
  createdAt: string;
  updatedAt: string;
};

export const workspaces = () => collection<WorkspaceRow>("accounts_workspaces");

export const emptyBilling = (): Billing => ({ customerId: null, subscriptionId: null, status: "none", lookupKey: null, periodStart: null, periodEnd: null, cancelAtPeriodEnd: false, paymentFailedAt: null, mode: null, manageUrl: null });

export async function getWorkspace(wsId: string) {
  if (isTeamId(wsId)) return teamWorkspaceRow(wsId);
  return workspaces().get(wsId, wsId); // a workspace row's workspaceId is its own id
}

/**
 * A team (src/lib/team) is a tenant of its own, so jobs and site serving that load "the workspace of this site" by id find it here:
 * a read-only row carrying the team's name and the OWNER's plan and billing period. It is never stored, and updateWorkspace() cannot
 * change it (there is no stored row to update).
 */
async function teamWorkspaceRow(teamId: string): Promise<WorkspaceRow | null> {
  const team = await teams().get(teamId, teamId);
  if (!team) return null;
  const owner = await workspaces().get(team.ownerWorkspaceId, team.ownerWorkspaceId);
  if (!owner) return null;
  const plan: PlanId = isAdminEmail(team.ownerEmail) ? "business" : planLapsed(owner) ? "free" : owner.plan;
  return { ...owner, id: team.id, workspaceId: team.id, name: team.name, ownerUserId: team.ownerUserId, ownerEmail: team.ownerEmail, plan, createdAt: team.createdAt, updatedAt: team.updatedAt };
}

export async function workspaceForUser(userId: string) {
  return workspaces().findSystemBy("ownerUserId", userId);
}

export async function workspaceForEmail(email: string) {
  return workspaces().findSystemBy("ownerEmail", email.trim(), { ci: true });
}

/** Stable per user, so a re-created row (ephemeral store) keeps the same id. */
export const workspaceIdForUser = (userId: string) => `ws_${createHash("sha256").update(userId).digest("hex").slice(0, 16)}`;

export async function ensureWorkspaceForUser(user: { id: string; email: string; name?: string | null }) {
  const existing = await workspaceForUser(user.id);
  if (existing) return existing;
  const wid = workspaceIdForUser(user.id);
  const row: WorkspaceRow = {
    id: wid,
    workspaceId: wid,
    name: user.name ? `${user.name}'s workspace` : `${user.email.split("@")[0]}'s workspace`,
    ownerUserId: user.id,
    ownerEmail: user.email,
    plan: "free",
    billing: emptyBilling(),
    createdAt: now(),
    updatedAt: now(),
  };
  // Atomic: if two first requests race (or a webhook already granted a plan), the stored row wins and is never overwritten.
  return (await workspaces().insertIfAbsent(row)).row;
}

export async function updateWorkspace(wsId: string, patch: Omit<Partial<WorkspaceRow>, "billing"> & { billing?: Partial<Billing> }) {
  const cur = await getWorkspace(wsId);
  if (!cur) return null;
  const next: Partial<WorkspaceRow> = { ...patch, billing: { ...cur.billing, ...(patch.billing ?? {}) }, updatedAt: now() };
  return workspaces().update(cur.workspaceId, cur.id, next);
}

/**
 * Current Usage period. Paid plans: the subscription's current period
 * (from Whop). Free: monthly windows anchored on the signup day.
 */
/**
 * A paid plan whose paid period ended more than the grace period ago (default 3 days) without a renewal payment or a
 * cancel webhook is treated as Free: a lost or late "membership.deactivated" must not leave paid access forever.
 * Rows without a recorded period end are left alone (legacy rows, never expired by guesswork).
 */
export function planLapsed(row: Pick<WorkspaceRow, "plan" | "billing">, at = Date.now(), graceDays = Number(process.env.KEPLAR_PLAN_GRACE_DAYS) >= 0 && process.env.KEPLAR_PLAN_GRACE_DAYS ? Number(process.env.KEPLAR_PLAN_GRACE_DAYS) : 3): boolean {
  if (row.plan === "free" || !row.billing.periodEnd) return false;
  const end = Date.parse(row.billing.periodEnd);
  return Number.isFinite(end) && end + graceDays * 864e5 < at;
}

export function currentPeriod(row: Pick<WorkspaceRow, "createdAt" | "billing" | "plan">, at = new Date()): { start: Date; end: Date } {
  const b = row.billing;
  if (row.plan !== "free" && b.periodStart && b.periodEnd && new Date(b.periodEnd) > at) {
    return { start: new Date(b.periodStart), end: new Date(b.periodEnd) };
  }
  const anchor = new Date(row.createdAt);
  const day = anchor.getUTCDate();
  const mk = (y: number, m: number) => {
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, m, Math.min(day, last), anchor.getUTCHours(), anchor.getUTCMinutes()));
  };
  let start = mk(at.getUTCFullYear(), at.getUTCMonth());
  if (start > at) start = mk(at.getUTCFullYear(), at.getUTCMonth() - 1);
  const end = mk(start.getUTCFullYear(), start.getUTCMonth() + 1);
  return { start, end };
}
