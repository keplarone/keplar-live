/**
 * OWNER-PENDING: opt-in pay-as-you-go overage above plan caps (Plus/Pro). Behind `flags.overage` (default OFF everywhere;
 * KEPLAR_FLAG_OVERAGE=1 or the /admin/profitability switch turns it on once the owner approves numbers).
 *
 *  - A subscriber opts in and sets a monthly spend cap (default `overage.defaultCapUsd`, max `overage.maxCapUsd`).
 *  - When their plan credits (or a rolling window, or a per-feature daily USD cap) would stop a heavy feature
 *    (`overage.features`: Create builds, voice, image/video, Deep Research, API), the charge continues as overage instead of a
 *    hard wall, while the month's overage stays under their cap.
 *  - The cap and the alerts reset each UTC calendar month.
 *  - Overage price = credits over × `overage.creditPack` rate ($7.50 per 1,000, the Plus rate), never below provider cost ×
 *    `overage.multiplier` (4.0). Without a credit count (a daily USD cap), cost × multiplier. Alerts at `overage.alertPcts`
 *    (50/80/100%) of the cap, once each per period, by email.
 *  - Billing: usage is reported to Stripe Billing Meters (meter event `overage.stripe.meterEventName`, value in cents,
 *    idempotent `identifier`) once the person has a linked Stripe customer. No Stripe object is created by this code; see
 *    docs/cost-monitoring.md "Overage: Stripe objects to create" for the exact list.
 */
import { collection } from "@/lib/create/platform/store";
import { sendEmail } from "@/lib/accounts/outbox";
import { stripe } from "@/lib/billing/stripe";
import { costConfig, costConfigSync, type CostConfig } from "./config";
import type { FeatureId } from "./features";

export type OverageSettings = { id: string; workspaceId: string; optedIn: boolean; capUsd: number; stripeCustomerId: string | null; updatedAt: string };
export type OverageUsage = { id: string; workspaceId: string; period: string; usd: number; costUsd: number; reportedCents: number; alerted: number[]; updatedAt: string };

const settingsRows = () => collection<OverageSettings>("overage_settings");
const usageRows = () => collection<OverageUsage>("overage_usage");
type Ws = { id: string; plan: string; admin?: boolean; anonymous?: boolean; email?: string | null; period?: { start: string } };

export const OVERAGE_PLANS = new Set(["plus", "pro"]);
/** Overage periods are UTC calendar months (the cap resets on the 1st), so every path agrees without the billing period. */
export const periodOf = (_ws?: Ws, now = Date.now()) => new Date(now).toISOString().slice(0, 7);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Overage price: credits at the pack rate, never below provider cost × multiplier (multiplier floors at 1, so never below cost). */
export function overagePrice(cfg: CostConfig, costUsd: number, credits = 0): number {
  const floor = Math.max(0, costUsd) * Math.max(1, cfg.overage.multiplier);
  const pack = cfg.overage.creditPack;
  const byCredits = credits > 0 && pack.credits > 0 ? (credits * pack.usd) / pack.credits : 0;
  return Math.max(floor, byCredits);
}

/** Pure: may overage cover `estimateUsd` more (provider cost) for this person now? */
export function overageAllows(i: { cfg: CostConfig; plan: string; admin?: boolean; feature: FeatureId | null; settings: Pick<OverageSettings, "optedIn" | "capUsd"> | null; usedUsd: number; estimateCostUsd: number; estimateCredits?: number }): boolean {
  const { cfg } = i;
  if (!cfg.flags.overage || i.admin || !OVERAGE_PLANS.has(i.plan) || !i.settings?.optedIn) return false;
  if (!i.feature || !cfg.overage.features.includes(i.feature)) return false;
  const cap = Math.min(i.settings.capUsd, cfg.overage.maxCapUsd);
  return i.usedUsd + overagePrice(cfg, i.estimateCostUsd, i.estimateCredits) <= cap + 1e-9;
}

/** Pure: which alert thresholds a move from `before` to `after` (USD) crosses that were not sent yet. */
export function crossedAlerts(cfg: CostConfig, capUsd: number, before: number, after: number, sent: number[]): number[] {
  if (!(capUsd > 0)) return [];
  void before;
  return cfg.overage.alertPcts.filter((p) => !sent.includes(p) && (after / capUsd) * 100 >= p - 1e-9);
}

export async function overageSettings(ws: Ws): Promise<OverageSettings | null> {
  return settingsRows().get(ws.id, "settings").catch(() => null);
}

export async function overageUsed(ws: Ws): Promise<OverageUsage | null> {
  return usageRows().get(ws.id, periodOf(ws)).catch(() => null);
}

export async function overageStatus(ws: Ws) {
  const cfg = await costConfig();
  const enabled = cfg.flags.overage && !ws.anonymous;
  if (!enabled) return { enabled: false as const };
  const [s, u] = await Promise.all([overageSettings(ws), overageUsed(ws)]);
  const cap = Math.min(s?.capUsd ?? cfg.overage.defaultCapUsd, cfg.overage.maxCapUsd);
  const used = u?.usd ?? 0;
  return {
    enabled: true as const, eligible: OVERAGE_PLANS.has(ws.plan), optedIn: Boolean(s?.optedIn), capUsd: cap, usedUsd: r2(used), pct: cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0,
    multiplier: cfg.overage.multiplier, creditPack: cfg.overage.creditPack, priceList: cfg.overage.priceList, features: cfg.overage.features, alertPcts: cfg.overage.alertPcts, maxCapUsd: cfg.overage.maxCapUsd, billingLinked: Boolean(s?.stripeCustomerId), period: periodOf(ws),
  };
}

export async function setOverage(ws: Ws, input: { optedIn?: unknown; capUsd?: unknown }): Promise<OverageSettings> {
  const cfg = await costConfig();
  if (!cfg.flags.overage) throw Object.assign(new Error("Pay-as-you-go overage isn't available yet."), { status: 404 });
  if (!OVERAGE_PLANS.has(ws.plan)) throw Object.assign(new Error("Pay-as-you-go overage is available on Plus and Pro."), { status: 402 });
  const cur = await overageSettings(ws);
  const cap = input.capUsd === undefined ? cur?.capUsd ?? cfg.overage.defaultCapUsd : Number(input.capUsd);
  if (!Number.isFinite(cap) || cap < 1 || cap > cfg.overage.maxCapUsd) throw Object.assign(new Error(`Set a monthly cap between $1 and $${cfg.overage.maxCapUsd}.`), { status: 400 });
  const row: OverageSettings = { id: "settings", workspaceId: ws.id, optedIn: input.optedIn === undefined ? Boolean(cur?.optedIn) : input.optedIn === true, capUsd: Math.round(cap * 100) / 100, stripeCustomerId: cur?.stripeCustomerId ?? null, updatedAt: new Date().toISOString() };
  if (!(await settingsRows().update(ws.id, "settings", row))) await settingsRows().insertIfAbsent(row);
  return row;
}

/** Route check: would overage cover this estimate (credits → provider USD at `usdPerCredit`)? Off = false, no I/O. */
export async function overageCovers(ws: Ws, units: number, feature: FeatureId | null): Promise<boolean> {
  const cfg = costConfigSync();
  if (!cfg.flags.overage || !OVERAGE_PLANS.has(ws.plan) || ws.admin) return false;
  const [s, u] = await Promise.all([overageSettings(ws), overageUsed(ws)]);
  return overageAllows({ cfg, plan: ws.plan, admin: ws.admin, feature, settings: s, usedUsd: u?.usd ?? 0, estimateCostUsd: Math.max(0, units) * cfg.pricing.usdPerCredit, estimateCredits: Math.max(0, units) });
}

/**
 * After a charge: the part of `units` above the plan allowance (`overUnits`) is overage. Records the overage price, sends
 * threshold alerts. Off or nothing over = no I/O.
 */
export async function recordOverage(ws: Ws, i: { overUnits: number; units: number; costUsd: number; feature: FeatureId | null }): Promise<number> {
  const cfg = costConfigSync();
  if (!cfg.flags.overage || !(i.overUnits > 0) || !OVERAGE_PLANS.has(ws.plan) || ws.admin) return 0;
  const s = await overageSettings(ws);
  if (!s?.optedIn) return 0;
  const share = i.units > 0 ? Math.min(1, i.overUnits / i.units) : 1;
  const cost = i.costUsd > 0 ? i.costUsd * share : i.overUnits * cfg.pricing.usdPerCredit;
  const price = overagePrice(cfg, cost, i.overUnits);
  const period = periodOf(ws);
  const before = (await overageUsed(ws))?.usd ?? 0;
  const next = await usageRows().increment(ws.id, period, { usd: price, costUsd: cost }, { id: period, workspaceId: ws.id, period, usd: 0, costUsd: 0, reportedCents: 0, alerted: [], updatedAt: new Date().toISOString() });
  const cap = Math.min(s.capUsd, cfg.overage.maxCapUsd);
  const cross = crossedAlerts(cfg, cap, before, next.usd, next.alerted ?? []);
  if (cross.length) {
    await usageRows().update(ws.id, period, { alerted: [...(next.alerted ?? []), ...cross] }).catch(() => null);
    if (ws.email) {
      const top = Math.max(...cross);
      await sendEmail({
        to: ws.email,
        subject: top >= 100 ? "Keplar: you've reached your pay-as-you-go cap" : `Keplar: ${top}% of your pay-as-you-go cap used`,
        text: `You've used $${next.usd.toFixed(2)} of your $${cap.toFixed(2)} monthly pay-as-you-go cap (${top}%).\n\n${top >= 100 ? "Heavy features now stop at your plan's limits until your next billing date, or raise the cap in Account → Usage." : "Change or turn off the cap any time in Account → Usage."}\n\nhttps://keplar.one/account/usage`,
        kind: "overage-alert",
      }).catch(() => false);
    }
  }
  return price;
}

/**
 * Reports unreported overage to Stripe Billing Meters (cron, flag on). Needs STRIPE_SECRET_KEY, the meter + metered price
 * created in Stripe (docs), and a linked customer per person. Returns what was sent; nothing is sent while anything is missing.
 */
export async function reportOverageToStripe(): Promise<{ sent: number; skipped: string | null }> {
  const cfg = await costConfig();
  if (!cfg.flags.overage) return { sent: 0, skipped: "flag_off" };
  const s = stripe();
  if (!s) return { sent: 0, skipped: "STRIPE_SECRET_KEY not set" };
  if (!process.env.KEPLAR_STRIPE_OVERAGE_METER?.trim()) return { sent: 0, skipped: "KEPLAR_STRIPE_OVERAGE_METER not set (create the meter first)" };
  const eventName = process.env.KEPLAR_STRIPE_OVERAGE_METER.trim() || cfg.overage.stripe.meterEventName;
  const rows = await usageRows().listSystem((r) => Math.round(r.usd * 100) > (r.reportedCents ?? 0)).catch(() => [] as OverageUsage[]);
  let sent = 0;
  for (const r of rows.slice(0, 200)) {
    const st = await settingsRows().get(r.workspaceId, "settings").catch(() => null);
    if (!st?.stripeCustomerId) continue;
    const total = Math.round(r.usd * 100);
    const delta = total - (r.reportedCents ?? 0);
    if (delta <= 0) continue;
    await s.billing.meterEvents.create({ event_name: eventName, payload: { stripe_customer_id: st.stripeCustomerId, value: String(delta) }, identifier: `ovg_${r.workspaceId}_${r.period}_${total}` });
    await usageRows().update(r.workspaceId, r.id, { reportedCents: total, updatedAt: new Date().toISOString() });
    sent++;
  }
  return { sent, skipped: null };
}
