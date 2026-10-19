/**
 * Subscription economics from Keplar's own billing records (accounts_workspaces, written by the Whop and Apple webhooks).
 *
 * A daily snapshot (`growth_sub_daily`, one row per UTC day) keeps, per paying account, its plan and what it is billed per month.
 * Accounts are stored under a keyed hash, never their id or email, so the snapshots can't be joined back to a person without the
 * server secret. From two snapshots come churn, gross and net revenue retention, upgrades and downgrades: these are computed from
 * recorded billing state, not accounting data (no refunds, taxes or fees), and the Command Center labels them that way.
 */
import { createHmac } from "node:crypto";
import { collection } from "@/lib/create/platform/store";
import { authSecret } from "@/lib/accounts/secret";
import type { WorkspaceRow } from "@/lib/accounts/workspaces";
import { businessTierForWhopPlanId, priceFor } from "@/lib/business/tiers";
import { BILLED_USD } from "../dashboard";

export type SubSnapshot = {
  id: string;
  workspaceId: string;
  date: string;
  /** hashed account -> plan and billed USD per month */
  customers: Record<string, { plan: string; mrrUsd: number }>;
  byPlan: Record<string, { customers: number; mrrUsd: number }>;
  mrrUsd: number;
  cancelScheduled: number;
};

const SYSTEM = "system";
export const snapshots = () => collection<SubSnapshot>("growth_sub_daily");

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Billed USD a month for an account that is paying right now, or 0. */
export function billedMonthly(w: Pick<WorkspaceRow, "plan" | "billing">, now: number): number {
  const live = w.billing?.status === "active" && (!w.billing.periodEnd || Date.parse(w.billing.periodEnd) > now);
  if (!live) return 0;
  if (w.plan === "lite" || w.plan === "plus" || w.plan === "pro") return BILLED_USD[w.plan] ?? 0;
  if (w.plan === "business") {
    const bt = businessTierForWhopPlanId(w.billing.lookupKey);
    return bt ? Math.round(priceFor(bt.tier)) : 0;
  }
  return 0;
}

/** Pure: today's snapshot from the workspace rows. `hash` maps an account id to its stored key. */
export function buildSnapshot(rows: Pick<WorkspaceRow, "id" | "plan" | "billing">[], now: Date, hash: (id: string) => string): SubSnapshot {
  const customers: SubSnapshot["customers"] = {};
  const byPlan: SubSnapshot["byPlan"] = {};
  let cancelScheduled = 0;
  for (const w of rows) {
    const usd = billedMonthly(w, now.getTime());
    if (!usd) continue;
    customers[hash(w.id)] = { plan: w.plan, mrrUsd: usd };
    const p = (byPlan[w.plan] ??= { customers: 0, mrrUsd: 0 });
    p.customers++;
    p.mrrUsd = round2(p.mrrUsd + usd);
    if (w.billing.cancelAtPeriodEnd) cancelScheduled++;
  }
  const date = now.toISOString().slice(0, 10);
  return { id: date, workspaceId: SYSTEM, date, customers, byPlan, mrrUsd: round2(Object.values(customers).reduce((t, c) => t + c.mrrUsd, 0)), cancelScheduled };
}

export type Retention = {
  from: string;
  to: string;
  startCustomers: number;
  churnedCustomers: number;
  newCustomers: number;
  /** churned / start customers */
  customerChurnRate: number | null;
  startMrrUsd: number;
  churnedMrrUsd: number;
  contractionMrrUsd: number;
  expansionMrrUsd: number;
  newMrrUsd: number;
  /** (start - churned - contraction) / start */
  grossRevenueRetention: number | null;
  /** (start - churned - contraction + expansion) / start */
  netRevenueRetention: number | null;
  upgrades: number;
  downgrades: number;
};

/** Pure: churn and revenue retention between two snapshots. Customers new in `to` count only as new MRR, never in retention. */
export function retentionBetween(a: Pick<SubSnapshot, "date" | "customers">, b: Pick<SubSnapshot, "date" | "customers">): Retention {
  let churned = 0, churnedMrr = 0, contraction = 0, expansion = 0, upgrades = 0, downgrades = 0, start = 0;
  for (const [k, c] of Object.entries(a.customers)) {
    start += c.mrrUsd;
    const now = b.customers[k];
    if (!now) { churned++; churnedMrr += c.mrrUsd; continue; }
    if (now.mrrUsd > c.mrrUsd) { expansion += now.mrrUsd - c.mrrUsd; upgrades++; }
    else if (now.mrrUsd < c.mrrUsd) { contraction += c.mrrUsd - now.mrrUsd; downgrades++; }
  }
  const fresh = Object.entries(b.customers).filter(([k]) => !a.customers[k]);
  const startCustomers = Object.keys(a.customers).length;
  const ratio = (n: number) => (start > 0 ? Math.round((n / start) * 10_000) / 10_000 : null);
  return {
    from: a.date,
    to: b.date,
    startCustomers,
    churnedCustomers: churned,
    newCustomers: fresh.length,
    customerChurnRate: startCustomers ? Math.round((churned / startCustomers) * 10_000) / 10_000 : null,
    startMrrUsd: round2(start),
    churnedMrrUsd: round2(churnedMrr),
    contractionMrrUsd: round2(contraction),
    expansionMrrUsd: round2(expansion),
    newMrrUsd: round2(fresh.reduce((t, [, c]) => t + c.mrrUsd, 0)),
    grossRevenueRetention: ratio(start - churnedMrr - contraction),
    netRevenueRetention: ratio(start - churnedMrr - contraction + expansion),
    upgrades,
    downgrades,
  };
}

const key = () => createHmac("sha256", authSecret()).update("keplar:growth-sub-snapshot:v1").digest();
export const hashAccount = (id: string) => createHmac("sha256", key()).update(id).digest("base64url").slice(0, 22);

/** The job: write (or overwrite) today's snapshot. */
export async function snapshotToday(now: Date, rows: Pick<WorkspaceRow, "id" | "plan" | "billing">[]): Promise<SubSnapshot> {
  const snap = buildSnapshot(rows, now, hashAccount);
  if (await snapshots().get(SYSTEM, snap.id)) await snapshots().update(SYSTEM, snap.id, snap);
  else await snapshots().insert(snap);
  return snap;
}

/** The snapshot on or before `date` (nearest earlier day we have). */
export async function snapshotOnOrBefore(date: string): Promise<SubSnapshot | null> {
  const all = await snapshots().list(SYSTEM, (s) => s.date <= date);
  return all.sort((x, y) => y.date.localeCompare(x.date))[0] ?? null;
}

/** MRR by day for the last `days` days we have snapshots for (gaps stay gaps). */
export async function mrrSeries(days = 90): Promise<{ date: string; mrrUsd: number; customers: number }[]> {
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const all = await snapshots().list(SYSTEM, (s) => s.date >= since);
  return all.sort((a, b) => a.date.localeCompare(b.date)).map((s) => ({ date: s.date, mrrUsd: s.mrrUsd, customers: Object.keys(s.customers).length }));
}
