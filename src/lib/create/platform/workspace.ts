/**
 * Request → workspace (tenant) context.
 * 1. Signed-in user (Better Auth session) → their workspace. The plan comes
 *    from the stored row (Postgres when DATABASE_URL is set) or from the signed
 *    plan cookie set after a verified Whop checkout (see src/lib/billing).
 * 2. No session → an anonymous Free context, only for routes that opt in
 *    (`allowAnonymous`): Keplar answers on free open models. It owns no data.
 * 3. Otherwise 401.
 * `ADMIN_EMAILS` (default team@keplar.one) get unlimited access.
 */
import { securityEvent } from "@/lib/security/events";
import { getSession } from "@/lib/accounts/auth";
import { currentPeriod, emptyBilling, ensureWorkspaceForUser, getWorkspace, planLapsed, type WorkspaceRow } from "@/lib/accounts/workspaces";
import { planFromCookie } from "@/lib/billing/plan-cookie";
import { isAdminEmail } from "@/lib/billing/admin";
import { HttpError } from "./http";
import { ENTITLEMENTS, type Entitlements, type PlanId } from "./plans";
import { resolveTeamAccess, teamSelector, type TeamAccess } from "@/lib/team/resolve";
import { TEAM_POLICY, type TeamAction, type TeamRole } from "@/lib/team/policy";
import { isTeamId, teams } from "@/lib/team/rows";
import { bindCostIdentity } from "@/lib/cost/context";
import { businessTierOf, tierEntitlements } from "@/lib/business/tiers";

export type Workspace = {
  id: string;
  name: string;
  plan: PlanId;
  /** Email-verified owner (required for publishing and billing). */
  verified: boolean;
  entitlements: Entitlements;
  /** No account: Free, answers only, owns no data. */
  anonymous: boolean;
  /** Unlimited access. A daily spend counter is recorded and does not stop requests. */
  admin: boolean;
  userId: string | null;
  email: string | null;
  period: { start: string; end: string };
  /** Set when the request works inside a team workspace (id above is then the TEAM's id): the caller's role there. */
  team?: { id: string; role: TeamRole; ownerUserId: string };
  /** Set when the request was authenticated by an API key or embed widget rather than a browser session. Such requests are stateless: no memory, no chats. */
  via?: "api" | "embed";
};

export const authRequired = () => process.env.KEPLAR_AUTH_REQUIRED === "1";

const RANK: Record<PlanId, number> = { free: 0, lite: 1, plus: 2, pro: 3, business: 4 };

function toWorkspace(row: WorkspaceRow, planIn: PlanId, extra: { verified: boolean; userId: string | null; email: string | null; anonymous?: boolean }): Workspace {
  const plan: PlanId = planIn === row.plan && planLapsed(row) ? "free" : planIn; // stale paid row (no renewal, no cancel webhook) → Free after the grace period
  const admin = Boolean(extra.email) && extra.verified && isAdminEmail(extra.email);
  const p = currentPeriod({ ...row, plan });
  const effective: PlanId = admin ? "business" : plan;
  // Business: the tier bought (from the Whop plan id on the row) sets the allowances.
  const entitlements: Entitlements = admin ? { ...ENTITLEMENTS.business, label: "Admin", monthlyUnits: Infinity } : effective === "business" ? tierEntitlements(ENTITLEMENTS.business, businessTierOf(row.billing.lookupKey)) : ENTITLEMENTS[effective];
  return {
    id: row.id,
    name: row.name,
    plan: effective,
    entitlements,
    anonymous: Boolean(extra.anonymous),
    admin,
    period: { start: p.start.toISOString(), end: p.end.toISOString() },
    verified: extra.verified,
    userId: extra.userId,
    email: extra.email,
  };
}

const anonymousRow = (): WorkspaceRow => {
  const t = new Date().toISOString();
  return { id: "anonymous", workspaceId: "anonymous", name: "Guest", ownerUserId: null, ownerEmail: null, plan: "free", billing: emptyBilling(), createdAt: "2026-01-01T00:00:00.000Z", updatedAt: t };
};

/** A request carrying a workspace already authenticated by other means (an API key). Keyed by the Request object, so no header or cookie can forge it. */
const injected = new WeakMap<Request, Workspace>();
export const injectWorkspace = (req: Request, ws: Workspace) => void injected.set(req, ws);

function teamWorkspace(a: TeamAccess, user: { id: string; email: string }): Workspace {
  const base = ENTITLEMENTS[a.plan];
  const p = currentPeriod({ createdAt: a.ownerPeriodRow.createdAt, billing: a.ownerPeriodRow.billing, plan: a.plan });
  return {
    id: a.team.id,
    name: a.team.name,
    plan: a.plan,
    // One shared pool for the whole team, not the owner's own allowance and not multiplied by members (src/lib/team/policy.ts).
    entitlements: { ...base, label: `${base.label} team`, monthlyUnits: a.poolUnits },
    anonymous: false,
    admin: false,
    period: { start: p.start.toISOString(), end: p.end.toISOString() },
    verified: true,
    userId: user.id,
    email: user.email,
    team: { id: a.team.id, role: a.role, ownerUserId: a.team.ownerUserId },
  };
}

/**
 * `team`: the route understands team context. With the team cookie set (keplar_team) the request then runs INSIDE that team's
 * workspace if the caller is a member whose role allows what the HTTP method needs (read / write / delete); `true` derives the need
 * from the method, or name the action (e.g. "publish"). Routes that don't pass `team` always run in the caller's personal workspace,
 * whatever the cookie says, so billing, account and every route not yet made team-aware can never reach a team's data.
 */
export async function currentWorkspace(req?: Request, opts: { allowAnonymous?: boolean; team?: boolean | TeamAction } = {}): Promise<Workspace> {
  const ws = await resolveWorkspace(req, opts);
  bindCostIdentity(req, ws); // cost meter attribution: user, plan and route feature for this request (src/lib/cost/context.ts)
  return ws;
}

async function resolveWorkspace(req: Request | undefined, opts: { allowAnonymous?: boolean; team?: boolean | TeamAction }): Promise<Workspace> {
  if (req) {
    const pre = injected.get(req);
    if (pre) return pre;
    const session = await getSession(req.headers);
    if (session && opts.team) {
      const sel = teamSelector(req.headers.get("cookie"));
      if (sel) {
        const access = await resolveTeamAccess({ id: session.user.id, verified: Boolean(session.user.emailVerified) }, sel, req.method, opts.team === true ? "method" : opts.team);
        return teamWorkspace(access, { id: session.user.id, email: session.user.email });
      }
    }
    if (session) {
      const row = await ensureWorkspaceForUser({ id: session.user.id, email: session.user.email, name: session.user.name });
      // The signed cookie only carries a plan when the stored row has no later verdict: a webhook-recorded cancel, refund or
      // dispute (status canceled/unpaid) revokes it at once, instead of waiting for the cookie to expire.
      const revoked = row.billing.status === "canceled" || row.billing.status === "unpaid";
      const fromCookie = revoked ? null : planFromCookie(req.headers.get("cookie"), session.user.email);
      const plan = fromCookie && RANK[fromCookie.plan] > RANK[row.plan] ? fromCookie.plan : row.plan;
      const withPeriod = fromCookie && plan === fromCookie.plan && plan !== row.plan ? { ...row, billing: { ...row.billing, periodStart: fromCookie.periodStart, periodEnd: fromCookie.periodEnd } } : row;
      return toWorkspace(withPeriod, plan, { verified: Boolean(session.user.emailVerified), userId: session.user.id, email: session.user.email });
    }
  }
  if (opts.allowAnonymous && !authRequired()) return toWorkspace(anonymousRow(), "free", { verified: false, userId: null, email: null, anonymous: true });
  throw new HttpError(401, "Sign in to continue.", "unauthenticated");
}

/** Signed-in, verified user only (billing, account). */
export async function requireAccount(req: Request): Promise<Workspace> {
  const session = await getSession(req.headers);
  if (!session) {
    securityEvent({ kind: "authz.denied", code: "unauthenticated", req, status: 401 });
    throw new HttpError(401, "Sign in to continue.", "unauthenticated");
  }
  if (!session.user.emailVerified) {
    securityEvent({ kind: "authz.denied", code: "unverified", req, status: 403, accountId: session.user.id });
    throw new HttpError(403, "Verify your email address first.", "unverified");
  }
  return currentWorkspace(req);
}

/** Background jobs: load a workspace by id (no request). Plan comes from the stored row. */
export async function workspaceById(wsId: string, planOverride?: PlanId): Promise<Workspace | null> {
  const row = await getWorkspace(wsId); // a team id yields the team's read-only row (owner's plan)
  if (!row) return null;
  const ws = toWorkspace(row, planOverride ?? row.plan, { verified: true, userId: row.ownerUserId, email: row.ownerEmail });
  if (!isTeamId(wsId)) return ws;
  // A background job for a team's site or chat: the same shared pool as the request path, and never the owner's admin exemption.
  const team = await teams().get(wsId, wsId);
  const pool = typeof team?.poolUnits === "number" && team.poolUnits >= 0 ? team.poolUnits : TEAM_POLICY[ws.plan].poolUnits;
  return { ...ws, admin: false, entitlements: { ...ENTITLEMENTS[ws.plan], label: `${ENTITLEMENTS[ws.plan].label} team`, monthlyUnits: pool } };
}
