/**
 * Growth dashboard numbers (admin only). Real data where it exists, `null` where it does not (the page then says "No data yet").
 * Nothing is estimated silently; estimates are labelled. Sources:
 *   keplar_users (Neon)          sign-ups, onboarding
 *   seo_events (first-party)     qualified visits, landing -> sign-up -> first question -> answer (consenting visitors only)
 *   growth_events (first-party)  asks, time to first result, abandonment, activation, repeat use (consenting visitors only)
 *   accounts_workspaces          paying customers, plan mix, MRR at the price Whop bills
 *   whop_payments, billing_events cash collected, refunds, disputes, cancellations, failed payments
 *   compute_ledger               provider cost of paid usage (Free costs $0 by design: free models only)
 *   answer_shares, feedback      sharing and feedback
 */
import { collection } from "@/lib/create/platform/store";
import { neonConfigured, neonQuery } from "@/lib/create/platform/neon";
import type { WorkspaceRow } from "@/lib/accounts/workspaces";
import { growthRows, summarizeAsks, type AskSummary } from "./events";
import { feedbackCounts } from "./feedback";
import { shareStats } from "./share";

const DAY = 864e5;

/** What Whop actually bills per month (verified against the Whop API on 2026-10-03; the site displays $20 / $45 / $99). */
export const BILLED_USD: Record<string, number> = { lite: 19.99, plus: 44.99, pro: 99.99 };
/** Whop card processing, https://docs.whop.com/fees (checked 2026-10-03): 2.7% + $0.30 per successful domestic card payment. */
export const FEE_PCT = 0.027;
export const FEE_FIXED = 0.3;
export const feeFor = (usd: number) => usd * FEE_PCT + FEE_FIXED;

type SeoRow = { event: string; landing: string; src: string; vid: string; at: string; utmSource?: string };
type LedgerRow = { workspaceId: string; usd: number; at: string };
type PaymentRow = { plan: string; at: string };
type BillingEvent = { type: string; at: string; result: string };

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    console.error("[growth] metric failed:", e instanceof Error ? e.name : "error");
    return fallback;
  }
}

export type FunnelStep = { label: string; browsers: number | null };
export type GrowthDashboard = {
  generatedAt: string;
  windowDays: number;
  /** Visits and funnel from consenting visitors (a floor, not a total). */
  funnel: { steps: FunnelStep[]; bySource: Record<string, number>; topLandings: { landing: string; browsers: number }[] };
  users: { total: number; new30: number; new7: number; onboardingCompleted: number } | null;
  asks: AskSummary | null;
  money: {
    activePaid: Record<string, number>;
    payingCustomers: number;
    mrrBilledUsd: number;
    payments30: number;
    cashCollected30Usd: number;
    estimatedFees30Usd: number;
    refunds30: number;
    disputes30: number;
    cancellations30: number;
    failedPayments30: number;
    cancelScheduled: number;
    providerSpend30Usd: number | null;
    contribution30Usd: number | null;
    /** Marketing spend recorded in the product: none (the plan is $0 budget), so CAC is not defined. */
    marketingSpendRecordedUsd: number;
    cacUsd: number | null;
  };
  shares: { created: number; live: number; views: number } | null;
  feedback: Record<string, number> | null;
};

export async function growthDashboard(days = 30, now = Date.now()): Promise<GrowthDashboard> {
  const since = new Date(now - days * DAY).toISOString();
  const [seo, growth, wsRows, pays, events, ledger, users, shares, fb] = await Promise.all([
    safe(() => collection<SeoRow & { id: string; workspaceId: string }>("seo_events").listSystemRange({ field: "at", gte: since }, 50_000), [] as (SeoRow & { id: string; workspaceId: string })[]),
    safe(() => growthRows(days, now), []),
    safe(() => collection<WorkspaceRow>("accounts_workspaces").listSystem(), [] as WorkspaceRow[]),
    safe(() => collection<PaymentRow & { id: string; workspaceId: string }>("whop_payments").listSystemRange({ field: "at", gte: since }, 5000), []),
    safe(() => collection<BillingEvent & { id: string; workspaceId: string }>("billing_events").listSystemRange({ field: "at", gte: since }, 5000), []),
    safe(() => collection<LedgerRow & { id: string }>("compute_ledger").listSystemRange({ field: "at", gte: since }, 50_000), null as (LedgerRow & { id: string })[] | null),
    neonConfigured()
      ? safe(async () => {
          const r = await neonQuery("SELECT count(*)::int AS total, count(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS n30, count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS n7, count(*) FILTER (WHERE onboarding_completed_at IS NOT NULL)::int AS onb FROM keplar_users");
          return { total: Number(r[0]?.total ?? 0), new30: Number(r[0]?.n30 ?? 0), new7: Number(r[0]?.n7 ?? 0), onboardingCompleted: Number(r[0]?.onb ?? 0) };
        }, null)
      : Promise.resolve(null),
    safe(() => shareStats(days, now), null),
    safe(() => feedbackCounts(days, now), null),
  ]);

  const distinct = (event: string) => new Set(seo.filter((r) => r.event === event).map((r) => r.vid)).size;
  const views = new Map<string, Set<string>>();
  const bySource: Record<string, Set<string>> = {};
  for (const r of seo) {
    if (r.event !== "landing_view") continue;
    (views.get(r.landing) ?? views.set(r.landing, new Set()).get(r.landing)!).add(r.vid);
    (bySource[r.src] ??= new Set()).add(r.vid);
  }
  const asks = growth.length ? summarizeAsks(growth, now) : null;
  const funnel = {
    steps: [
      { label: "Visited a public page", browsers: seo.length ? distinct("landing_view") : null },
      { label: "Clicked a main button", browsers: seo.length ? distinct("cta_click") : null },
      { label: "Finished sign-up", browsers: seo.length ? distinct("signup_complete") : null },
      { label: "Sent a first question", browsers: seo.length ? distinct("first_prompt") : null },
      { label: "Saw an answer", browsers: seo.length ? distinct("synthesis_success") : null },
      { label: "Activated (answer, then looked closer, copied, shared or asked again)", browsers: asks ? asks.activatedBrowsers : null },
    ],
    bySource: Object.fromEntries(Object.entries(bySource).map(([k, v]) => [k, v.size])),
    topLandings: [...views.entries()].map(([landing, v]) => ({ landing, browsers: v.size })).sort((a, b) => b.browsers - a.browsers).slice(0, 8),
  };

  // Money: active paid workspaces and what Whop bills for them.
  const activePaid: Record<string, number> = { lite: 0, plus: 0, pro: 0 };
  let cancelScheduled = 0;
  for (const w of wsRows) {
    if (w.plan in activePaid && w.billing.status === "active" && (!w.billing.periodEnd || Date.parse(w.billing.periodEnd) > now)) {
      activePaid[w.plan]++;
      if (w.billing.cancelAtPeriodEnd) cancelScheduled++;
    }
  }
  const payingCustomers = Object.values(activePaid).reduce((a, b) => a + b, 0);
  const mrr = Object.entries(activePaid).reduce((t, [p, n]) => t + n * (BILLED_USD[p] ?? 0), 0);
  const cash = pays.reduce((t, p) => t + (BILLED_USD[p.plan] ?? 0), 0);
  const fees = pays.reduce((t, p) => t + feeFor(BILLED_USD[p.plan] ?? 0), 0);
  const count = (type: string) => events.filter((e) => e.type === type).length;
  const spend = ledger ? ledger.reduce((t, r) => t + (r.usd || 0), 0) : null;
  const money = {
    activePaid,
    payingCustomers,
    mrrBilledUsd: Math.round(mrr * 100) / 100,
    payments30: pays.length,
    cashCollected30Usd: Math.round(cash * 100) / 100,
    estimatedFees30Usd: Math.round(fees * 100) / 100,
    refunds30: count("refund.created"),
    disputes30: count("dispute.created"),
    cancellations30: count("membership.deactivated"),
    failedPayments30: count("payment.failed"),
    cancelScheduled,
    providerSpend30Usd: spend === null ? null : Math.round(spend * 100) / 100,
    contribution30Usd: spend === null ? null : Math.round((cash - fees - spend) * 100) / 100,
    marketingSpendRecordedUsd: 0,
    cacUsd: null,
  };
  return { generatedAt: new Date(now).toISOString(), windowDays: days, funnel, users, asks, money, shares, feedback: fb };
}
