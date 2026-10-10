/**
 * Revenue per user for margin math.
 *  - Default: the plan's monthly list price (config `revenue.planMonthlyUsd`) for each workspace with an active, unexpired paid
 *    subscription (Whop webhooks keep `billing` current).
 *  - With STRIPE_SECRET_KEY: active Stripe subscriptions whose price lookup key is in `revenue.stripeLookupKeys`
 *    (keplar_plus_monthly, keplar_pro_monthly) override the list price with the real recurring amount (after quantity), keyed
 *    by customer email. Cached for an hour; any Stripe error falls back to list prices.
 * Revenue per credit (plan price / monthly credits) turns credits charged on a feature into that feature's revenue.
 */
import { collection } from "@/lib/create/platform/store";
import { stripe } from "@/lib/billing/stripe";
import { PLAN_ALLOWANCES } from "@/lib/orchestration/plans";
import type { WorkspaceRow } from "@/lib/accounts/workspaces";
import { asPlanKey, type CostConfig, type PlanKey } from "./config";

export type UserRevenue = { userId: string; email: string | null; plan: PlanKey; monthlyUsd: number; source: "stripe" | "plan_price" | "none"; active: boolean };

export function isActivePaid(w: Pick<WorkspaceRow, "plan" | "billing">, now = Date.now()): boolean {
  if (w.plan === "free") return false;
  const st = w.billing?.status;
  if (st !== "active" && st !== "trialing" && st !== "past_due") return false;
  return !w.billing?.periodEnd || Date.parse(w.billing.periodEnd) > now;
}

/** Pure: revenue per workspace from rows + optional Stripe amounts by lowercased email. */
export function revenueByUser(workspaces: Pick<WorkspaceRow, "id" | "plan" | "billing" | "ownerEmail">[], cfg: CostConfig, stripeByEmail: Map<string, number> = new Map(), now = Date.now()): Map<string, UserRevenue> {
  const out = new Map<string, UserRevenue>();
  for (const w of workspaces) {
    const plan = asPlanKey(w.plan) ?? "free";
    const active = isActivePaid(w, now);
    const email = w.ownerEmail ?? null;
    const s = email ? stripeByEmail.get(email.toLowerCase()) : undefined;
    if (s !== undefined && plan !== "free") out.set(w.id, { userId: w.id, email, plan, monthlyUsd: s, source: "stripe", active: true });
    else out.set(w.id, { userId: w.id, email, plan, monthlyUsd: active ? cfg.revenue.planMonthlyUsd[plan] ?? 0 : 0, source: active ? "plan_price" : "none", active });
  }
  return out;
}

/** Revenue one credit stands for on this plan (0 for Free and custom plans). */
export function revenuePerCredit(cfg: CostConfig, plan: string | null | undefined): number {
  const p = asPlanKey(plan);
  if (!p) return 0;
  const credits = PLAN_ALLOWANCES[p]?.monthlyUnits ?? null;
  const price = cfg.revenue.planMonthlyUsd[p] ?? 0;
  return credits && credits > 0 ? price / credits : 0;
}

let stripeCache: { at: number; map: Map<string, number>; error: string | null } | null = null;

/** Monthly recurring amount per customer email from active Stripe subscriptions on Keplar's plan prices. */
export async function stripeMonthlyByEmail(cfg: CostConfig): Promise<{ map: Map<string, number>; error: string | null; configured: boolean }> {
  const s = stripe();
  if (!s || !cfg.revenue.useStripe) return { map: new Map(), error: null, configured: false };
  if (stripeCache && Date.now() - stripeCache.at < 3600_000) return { map: stripeCache.map, error: stripeCache.error, configured: true };
  const map = new Map<string, number>();
  let error: string | null = null;
  try {
    const keys = Object.keys(cfg.revenue.stripeLookupKeys);
    const prices = await s.prices.list({ lookup_keys: keys, active: true, limit: 20 });
    for (const price of prices.data) {
      let n = 0;
      for await (const sub of s.subscriptions.list({ price: price.id, status: "active", limit: 100, expand: ["data.customer"] })) {
        const item = sub.items.data.find((i) => i.price.id === price.id);
        const qty = item?.quantity ?? 1;
        const unit = (price.unit_amount ?? 0) / 100;
        const months = price.recurring?.interval === "year" ? 12 * (price.recurring.interval_count || 1) : price.recurring?.interval_count || 1;
        const cust = sub.customer as { email?: string | null } | string;
        const email = typeof cust === "object" ? cust.email?.toLowerCase() : null;
        if (email) map.set(email, (map.get(email) ?? 0) + (unit * qty) / months);
        if (++n >= 2000) break;
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message.slice(0, 160) : "Stripe error";
  }
  stripeCache = { at: Date.now(), map, error };
  return { map, error, configured: true };
}

export async function loadRevenue(cfg: CostConfig): Promise<{ users: Map<string, UserRevenue>; stripe: { configured: boolean; error: string | null; matched: number }; workspaces: WorkspaceRow[] }> {
  const [workspaces, st] = await Promise.all([collection<WorkspaceRow>("accounts_workspaces").listSystem().catch(() => [] as WorkspaceRow[]), stripeMonthlyByEmail(cfg)]);
  const users = revenueByUser(workspaces, cfg, st.map);
  return { users, workspaces, stripe: { configured: st.configured, error: st.error, matched: [...users.values()].filter((u) => u.source === "stripe").length } };
}
