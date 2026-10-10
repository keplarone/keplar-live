/**
 * Revenue and profit for the admin "Traffic & revenue" card. Real records only, nothing invented:
 *   - Whop plan payments   `whop_payments`   (written by the verified Whop webhook). The charged amount is stored when Whop sends
 *                          it; older rows are filled from the Whop API on admin load. A row with no amount is COUNTED but never
 *                          valued: it is listed as "amount not recorded", with the plan list price shown only as a labelled estimate.
 *   - Whop extension packs `limit_extensions` (one row per verified pack payment, with its amount when Whop sent it).
 *   - Stripe Connect       Keplar's own application fee on paid LIVE orders (`biz_orders`, default fee 0). Sellers' sales are theirs, not revenue.
 * Costs that ARE recorded: model/API spend (`compute_ledger`, charged provider USD; the team's own usage is shown apart) and Whop's
 * fees when Whop sent the after-fee amount. Everything else (hosting, database, email, domains, marketing) is not tracked unless
 * fixed-cost rows exist in `ops_fixed_costs`; without them "net profit" says "Not tracked yet" instead of showing a number.
 */
import { collection } from "@/lib/create/platform/store";
import { isAdminEmail } from "@/lib/billing/admin";
import { stripeConfigured } from "@/lib/business/stripe";
import { whopCheckoutConfigured, whopWebhookConfigured, listPaidPayments } from "@/lib/billing/whop";
import { BILLED_USD } from "@/lib/growth/dashboard";
import type { Order } from "@/lib/business/types";
import type { WorkspaceRow } from "@/lib/accounts/workspaces";
import { amountsOf } from "@/lib/billing/sync";

import { RANGES, RANGE_LABEL, type RangeId } from "./ranges";
export { RANGES, RANGE_LABEL };
export type { RangeId };

export type PaymentIn = { id: string; plan: string; at: string; amountUsd?: number; netUsd?: number; refundedAt?: string; disputedAt?: string };
export type ExtensionIn = { paymentId: string; pack: string; grantedAt: string; amountUsd?: number; netUsd?: number; status: string };
export type OrderIn = Pick<Order, "status" | "paidAt" | "applicationFeeAmount" | "currency" | "livemode" | "amount" | "refundedAmount">;
export type SpendIn = { workspaceId: string; usd: number; at: string };
export type FixedCostIn = { label: string; usdMonthly: number; from: string; to?: string | null };

export type Money = Record<RangeId, number>;
export type SourceView = {
  id: "whop_plans" | "whop_extensions" | "stripe_fees";
  label: string;
  status: "connected" | "no_data" | "not_connected";
  note: string;
  /** Recorded revenue net of refunds/disputes, per range. */
  revenueUsd: Money;
  /** Payments counted whose amount Whop did not give us (never valued in revenueUsd). */
  unrecorded: Record<RangeId, number>;
  /** Labelled estimate for those payments at the plan list price (whop_plans only; 0 elsewhere). */
  estimatedUnrecordedUsd: Money;
  payments: Record<RangeId, number>;
  refundedUsd: Money;
};

export type RevenueReport = {
  generatedAt: string;
  sources: SourceView[];
  totalUsd: Money;
  estimatedUnrecordedUsd: Money;
  unrecorded: Record<RangeId, number>;
  costs: {
    modelSpendUsd: Money | null;
    /** The team's own (admin) model usage, excluded from the figure above. */
    teamSpendUsd: Money | null;
    whopFeesUsd: Money;
    /** Payments whose fee is unknown (no after-fee amount recorded). */
    whopFeesUnknown: Record<RangeId, number>;
    fixedTracked: boolean;
    fixedUsd: Money | null;
    spendTruncated: boolean;
  };
  profit: Record<RangeId, { contributionUsd: number | null; netUsd: number | null; complete: boolean }>;
  notTracked: string[];
};

const DAY = 864e5;
const zero = (): Money => ({ today: 0, d7: 0, d30: 0, all: 0 });
const zeroN = (): Record<RangeId, number> => ({ today: 0, d7: 0, d30: 0, all: 0 });
const r2 = (n: number) => Math.round(n * 100) / 100;
const round = (m: Money): Money => ({ today: r2(m.today), d7: r2(m.d7), d30: r2(m.d30), all: r2(m.all) });

/** Which ranges an instant falls in ("all" always). Days are UTC days; 7d/30d include today. */
export function rangesOf(iso: string, now: number): RangeId[] {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return [];
  const day = (x: number) => new Date(x).toISOString().slice(0, 10);
  const d = day(t);
  const out: RangeId[] = ["all"];
  if (d >= day(now - 29 * DAY) && t <= now + DAY) out.push("d30");
  if (d >= day(now - 6 * DAY) && t <= now + DAY) out.push("d7");
  if (d === day(now)) out.push("today");
  return out;
}

export function buildReport(input: {
  now: number;
  payments: PaymentIn[];
  extensions: ExtensionIn[];
  orders: OrderIn[];
  spend: SpendIn[] | null;
  adminWorkspaceIds: Set<string>;
  fixedCosts: FixedCostIn[];
  whopConfigured: boolean;
  stripeConfigured: boolean;
  spendTruncated?: boolean;
}): RevenueReport {
  const { now } = input;
  const blank = (id: SourceView["id"], label: string): SourceView => ({ id, label, status: "no_data", note: "", revenueUsd: zero(), unrecorded: zeroN(), estimatedUnrecordedUsd: zero(), payments: zeroN(), refundedUsd: zero() });

  // Whop plans
  const plans = blank("whop_plans", "Whop plans (subscriptions)");
  const fees = zero();
  const feesUnknown = zeroN();
  for (const p of input.payments) {
    for (const r of rangesOf(p.at, now)) {
      plans.payments[r]++;
      const gone = Boolean(p.refundedAt || p.disputedAt);
      if (p.amountUsd === undefined) {
        plans.unrecorded[r]++;
        if (!gone) plans.estimatedUnrecordedUsd[r] += BILLED_USD[p.plan] ?? 0;
        continue;
      }
      if (gone) plans.refundedUsd[r] += p.amountUsd;
      else {
        plans.revenueUsd[r] += p.amountUsd;
        if (p.netUsd !== undefined) fees[r] += p.amountUsd - p.netUsd;
        else feesUnknown[r]++;
      }
    }
  }
  // Whop extension packs
  const packs = blank("whop_extensions", "Whop extension packs (one-time)");
  for (const e of input.extensions) {
    for (const r of rangesOf(e.grantedAt, now)) {
      packs.payments[r]++;
      const gone = e.status === "revoked";
      if (e.amountUsd === undefined) {
        packs.unrecorded[r]++;
        continue;
      }
      if (gone) packs.refundedUsd[r] += e.amountUsd;
      else {
        packs.revenueUsd[r] += e.amountUsd;
        if (e.netUsd !== undefined) fees[r] += e.amountUsd - e.netUsd;
        else feesUnknown[r]++;
      }
    }
  }
  // Stripe Connect: Keplar's application fee on paid live USD orders
  const stripe = blank("stripe_fees", "Stripe Connect fees (platform fee on sellers' sales)");
  for (const o of input.orders) {
    if (o.status !== "paid" && o.status !== "refunded") continue;
    if (!o.livemode || (o.currency || "usd").toLowerCase() !== "usd" || !o.paidAt) continue;
    for (const r of rangesOf(o.paidAt, now)) {
      stripe.payments[r]++;
      const fee = (o.applicationFeeAmount || 0) / 100;
      if (o.status === "refunded" || (o.refundedAmount ?? 0) >= o.amount) stripe.refundedUsd[r] += fee;
      else stripe.revenueUsd[r] += fee;
    }
  }

  const whopHas = input.payments.length > 0;
  plans.status = whopHas ? "connected" : input.whopConfigured ? "no_data" : "not_connected";
  plans.note = whopHas ? "From verified Whop webhooks." : input.whopConfigured ? "Whop is set up; no plan payment has been recorded yet." : "Not connected: Whop keys/webhook are not set.";
  packs.status = input.extensions.length > 0 ? "connected" : input.whopConfigured ? "no_data" : "not_connected";
  packs.note = input.extensions.length > 0 ? "From verified Whop pack payments." : input.whopConfigured ? "No extension pack has been sold yet (or the pack plans are not set)." : "Not connected: Whop keys/webhook are not set.";
  stripe.status = stripe.payments.all > 0 ? "connected" : input.stripeConfigured ? "no_data" : "not_connected";
  stripe.note = stripe.payments.all > 0 ? "Application fees on paid live orders (default fee is 0 until KEPLAR_APPLICATION_FEE_BPS is set). Sellers' sales are theirs, not Keplar revenue." : input.stripeConfigured ? "Stripe Connect is set up; no paid live order yet." : "Not connected: Stripe Connect is not configured.";

  const sources = [plans, packs, stripe].map((s) => ({ ...s, revenueUsd: round(s.revenueUsd), estimatedUnrecordedUsd: round(s.estimatedUnrecordedUsd), refundedUsd: round(s.refundedUsd) }));
  const sum = (f: (s: SourceView) => Money): Money => round(sources.reduce((a, s) => ({ today: a.today + f(s).today, d7: a.d7 + f(s).d7, d30: a.d30 + f(s).d30, all: a.all + f(s).all }), zero()));
  const totalUsd = sum((s) => s.revenueUsd);
  const unrecorded = zeroN();
  for (const s of sources) for (const r of RANGES) unrecorded[r] += s.unrecorded[r];

  // Costs
  let modelSpend: Money | null = null;
  let teamSpend: Money | null = null;
  if (input.spend) {
    modelSpend = zero();
    teamSpend = zero();
    for (const row of input.spend) {
      const team = input.adminWorkspaceIds.has(row.workspaceId);
      for (const r of rangesOf(row.at, now)) (team ? teamSpend : modelSpend)[r] += row.usd || 0;
    }
    modelSpend = round(modelSpend);
    teamSpend = round(teamSpend);
  }
  const fixedTracked = input.fixedCosts.length > 0;
  let fixedUsd: Money | null = null;
  if (fixedTracked) {
    fixedUsd = zero();
    const start: Record<RangeId, number> = {
      today: Date.parse(new Date(now).toISOString().slice(0, 10)),
      d7: Date.parse(new Date(now - 6 * DAY).toISOString().slice(0, 10)),
      d30: Date.parse(new Date(now - 29 * DAY).toISOString().slice(0, 10)),
      all: Math.min(...input.fixedCosts.map((c) => Date.parse(c.from)).filter(Number.isFinite), now),
    };
    for (const r of RANGES) {
      for (const c of input.fixedCosts) {
        const a = Math.max(start[r], Date.parse(c.from));
        const b = Math.min(now, c.to ? Date.parse(c.to) + DAY : now);
        if (b > a && Number.isFinite(c.usdMonthly)) fixedUsd[r] += (c.usdMonthly * (b - a)) / (30.4375 * DAY);
      }
    }
    fixedUsd = round(fixedUsd);
  }

  const profit = {} as RevenueReport["profit"];
  for (const r of RANGES) {
    const spendKnown = modelSpend !== null && !(r === "all" && input.spendTruncated);
    const contribution = spendKnown ? r2(totalUsd[r] - fees[r] - modelSpend![r]) : null;
    // Complete = nothing in this range is valued blindly: every payment had an amount and a known fee.
    const complete = spendKnown && unrecorded[r] === 0 && feesUnknown[r] === 0;
    profit[r] = { contributionUsd: contribution, netUsd: contribution !== null && fixedUsd ? r2(contribution - fixedUsd[r]) : null, complete };
  }

  const notTracked = [
    "Hosting (Vercel), database (Neon), email (Resend), domains and other fixed costs" + (fixedTracked ? " beyond the rows entered in ops_fixed_costs" : ""),
    "Marketing spend (the plan is $0)",
    "Taxes and Stripe's own card fees (Stripe charges those to sellers)",
  ];
  return { generatedAt: new Date(now).toISOString(), sources, totalUsd, estimatedUnrecordedUsd: sum((s) => s.estimatedUnrecordedUsd), unrecorded, costs: { modelSpendUsd: modelSpend, teamSpendUsd: teamSpend, whopFeesUsd: round(fees), whopFeesUnknown: feesUnknown, fixedTracked, fixedUsd, spendTruncated: Boolean(input.spendTruncated) }, profit, notTracked };
}

/** Fill in the charged amount on plan payments that were recorded before amounts were stored, from Whop's own API (latest 50 paid). */
export async function backfillPaymentAmounts(rows: (PaymentIn & { workspaceId: string })[]): Promise<number> {
  const missing = new Set(rows.filter((r) => r.amountUsd === undefined).map((r) => r.id));
  if (!missing.size || !whopCheckoutConfigured()) return 0;
  const remote = await listPaidPayments().catch(() => []);
  let n = 0;
  const col = collection<PaymentIn & { workspaceId: string }>("whop_payments");
  for (const p of remote) {
    if (!missing.has(p.id)) continue;
    const a = amountsOf(p as unknown as Record<string, unknown>);
    if (a.amountUsd === null) continue;
    const row = rows.find((r) => r.id === p.id)!;
    const patch = { amountUsd: a.amountUsd, ...(a.netUsd !== null ? { netUsd: a.netUsd } : {}) };
    if (await col.update(row.workspaceId, p.id, patch).catch(() => null)) {
      Object.assign(row, patch);
      n++;
    }
  }
  return n;
}

export async function revenueReport(now = Date.now()): Promise<RevenueReport> {
  const safe = async <T>(f: () => Promise<T>, d: T): Promise<T> => f().catch((e) => { console.error("[admin] revenue source failed:", e instanceof Error ? e.name : "error"); return d; });
  const payments = await safe(() => collection<PaymentIn & { workspaceId: string }>("whop_payments").listSystem(), [] as (PaymentIn & { workspaceId: string })[]);
  await safe(() => backfillPaymentAmounts(payments), 0);
  const first = payments.reduce((a, p) => (p.at < a ? p.at : a), new Date(now).toISOString());
  const since = new Date(Math.min(Date.parse(first), now - 30 * DAY)).toISOString();
  const [extensions, orders, spend, workspaces, fixed] = await Promise.all([
    safe(() => collection<ExtensionIn & { id: string; workspaceId: string }>("limit_extensions").listSystem((r) => r.pack !== "referral" /* referral rewards are free credit, not a sale */), [] as ExtensionIn[]),
    safe(() => collection<OrderIn & { id: string; workspaceId: string }>("biz_orders").listSystem((o) => o.status === "paid" || o.status === "refunded"), [] as OrderIn[]),
    safe(() => collection<SpendIn & { id: string }>("compute_ledger").listSystemRange({ field: "at", gte: since }, 100_000), null as (SpendIn & { id: string })[] | null),
    safe(() => collection<WorkspaceRow>("accounts_workspaces").listSystem(), [] as WorkspaceRow[]),
    safe(() => collection<FixedCostIn & { id: string; workspaceId: string }>("ops_fixed_costs").listSystem(), [] as FixedCostIn[]),
  ]);
  return buildReport({
    now,
    payments,
    extensions,
    orders,
    spend,
    adminWorkspaceIds: new Set(workspaces.filter((w) => isAdminEmail(w.ownerEmail)).map((w) => w.id)),
    fixedCosts: fixed.filter((c) => Number.isFinite(c.usdMonthly) && c.usdMonthly >= 0 && Number.isFinite(Date.parse(c.from))),
    whopConfigured: whopCheckoutConfigured() || whopWebhookConfigured(),
    stripeConfigured: stripeConfigured(),
    spendTruncated: Boolean(spend && spend.length >= 100_000),
  });
}
