/**
 * Real numbers for /admin. Every figure comes from a table the product already writes
 * (users, workspaces, Whop webhook payments, the Usage ledger, model_calls, inquiries, audit).
 * Anything that cannot be measured says so (`null` / "not set up"); nothing is estimated silently.
 */
import { collection, storeDurable } from "@/lib/create/platform/store";
import { neonConfigured, neonQuery } from "@/lib/create/platform/neon";
import { caps, spendToday, adminSpendToday } from "@/lib/create/platform/spend";
import { breakerLevel } from "@/lib/create/platform/breaker";
import { PAID_PLANS } from "@/lib/billing/plans";
import { BILLED_USD } from "@/lib/growth/dashboard";
import { businessTierForWhopPlanId, priceFor } from "@/lib/business/tiers";
import { whopCheckoutConfigured, whopWebhookConfigured } from "@/lib/billing/whop";
import { type ModelCallRow } from "./telemetry";
import { maskEmail, recentAudit, type AuditRow } from "./audit";
import { opsControlsFresh, type OpsControls } from "./controls";
import type { WorkspaceRow } from "@/lib/accounts/workspaces";

const DAY = 864e5;
const iso = (t: number) => new Date(t).toISOString();

type LedgerRow = { id: string; workspaceId: string; action: string; units: number; usd: number; at: string };
/** A Whop payment as the webhook stores it (src/lib/billing/sync.ts): amountUsd when Whop sent one, refundedAt once refunded. */
type PaymentRow = { id: string; workspaceId: string; email: string; plan: "lite" | "plus" | "pro"; at: string; amountUsd?: number; refundedAt?: string };
type EventRow = { id: string; workspaceId: string; type: string; at: string; result: string };

export const percentile = (sorted: number[], p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : null);
const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

export type Overview = ReturnType<typeof summarize>;

/** Pure aggregation (unit-tested). */
export function summarize(input: { now: number; workspaces: WorkspaceRow[]; ledger: LedgerRow[]; calls: ModelCallRow[]; payments: Omit<PaymentRow, "workspaceId">[]; events: Omit<EventRow, "workspaceId">[] }) {
  const { now, workspaces, ledger, calls, payments, events } = input;
  const planOf = new Map(workspaces.map((w) => [w.id, w]));

  // Plan mix + MRR: active, unexpired paid subscriptions recorded from Whop webhooks / verified checkout returns, at the price
  // Whop bills (BILLED_USD), the same figure /admin/growth uses, so the two pages agree.
  const mix: Record<string, number> = { free: 0, lite: 0, plus: 0, pro: 0, business: 0 };
  let mrr = 0;
  const activePaid: Record<string, number> = { lite: 0, plus: 0, pro: 0 };
  for (const w of workspaces) {
    mix[w.plan] = (mix[w.plan] ?? 0) + 1;
    if ((w.plan === "lite" || w.plan === "plus" || w.plan === "pro") && w.billing.status === "active" && (!w.billing.periodEnd || Date.parse(w.billing.periodEnd) > now)) {
      activePaid[w.plan]++;
      mrr += BILLED_USD[w.plan] ?? PAID_PLANS[w.plan].usdMonthly;
    } else if (w.plan === "business" && w.billing.status === "active" && (!w.billing.periodEnd || Date.parse(w.billing.periodEnd) > now)) {
      // Keplar Business: the tier's monthly price.
      const bt = businessTierForWhopPlanId(w.billing.lookupKey);
      if (bt) mrr += Math.round(priceFor(bt.tier));
    }
  }
  // Refunded payments are not revenue. Amounts: list price for every kept payment, and what Whop recorded where it sent one.
  const all30 = payments.filter((p) => Date.parse(p.at) >= now - 30 * DAY);
  const pay30 = all30.filter((p) => !p.refundedAt);
  const revenue30 = pay30.reduce((t, p) => t + (PAID_PLANS[p.plan]?.usdMonthly ?? 0), 0);
  const withAmount = pay30.filter((p) => typeof p.amountUsd === "number");
  const recorded30 = withAmount.length ? round(withAmount.reduce((t, p) => t + (p.amountUsd ?? 0), 0), 2) : null;

  // Spend (Usage ledger = charged provider USD).
  const l30 = ledger.filter((r) => Date.parse(r.at) >= now - 30 * DAY);
  const spend30 = l30.reduce((t, r) => t + (r.usd || 0), 0);
  const group = <K extends string>(rows: LedgerRow[], key: (r: LedgerRow) => K) => {
    const m = new Map<K, { usd: number; units: number; n: number }>();
    for (const r of rows) {
      const k = key(r);
      const c = m.get(k) ?? { usd: 0, units: 0, n: 0 };
      c.usd += r.usd || 0;
      c.units += r.units || 0;
      c.n++;
      m.set(k, c);
    }
    return [...m.entries()].map(([k, v]) => ({ key: k, usd: round(v.usd), units: v.units, n: v.n })).sort((a, b) => b.usd - a.usd);
  };
  const byFeature = group(l30, (r) => r.action || "unknown").slice(0, 15);
  const byPlan = group(l30, (r) => planOf.get(r.workspaceId)?.plan ?? "unknown");
  const byUser = group(l30, (r) => r.workspaceId)
    .slice(0, 10)
    .map((u) => ({ user: maskEmail(planOf.get(u.key)?.ownerEmail), plan: planOf.get(u.key)?.plan ?? "unknown", usd: u.usd, units: u.units, n: u.n }));
  const daily: Record<string, number> = {};
  for (const r of l30) daily[r.at.slice(0, 10)] = (daily[r.at.slice(0, 10)] ?? 0) + (r.usd || 0);
  const spendByDay = Array.from({ length: 14 }, (_, i) => iso(now - (13 - i) * DAY).slice(0, 10)).map((d) => ({ day: d, usd: round(daily[d] ?? 0) }));

  // Model calls (last 24 h).
  const c24 = calls.filter((c) => Date.parse(c.at) >= now - DAY);
  const by = (key: (c: ModelCallRow) => string) => {
    const m = new Map<string, ModelCallRow[]>();
    for (const c of c24) m.set(key(c), [...(m.get(key(c)) ?? []), c]);
    return [...m.entries()]
      .map(([k, rows]) => {
        const lat = rows.filter((r) => r.ok).map((r) => r.latencyMs).sort((a, b) => a - b);
        return { key: k, calls: rows.length, errors: rows.filter((r) => !r.ok).length, usd: round(rows.reduce((t, r) => t + r.usd, 0)), p50: percentile(lat, 50), p95: percentile(lat, 95) };
      })
      .sort((a, b) => b.usd - a.usd || b.calls - a.calls);
  };
  const lat = c24.filter((c) => c.ok).map((c) => c.latencyMs).sort((a, b) => a - b);
  const perMin: Record<string, number> = {};
  for (const c of calls) if (Date.parse(c.at) >= now - 60 * 60_000) perMin[c.at.slice(0, 16)] = (perMin[c.at.slice(0, 16)] ?? 0) + 1;
  const last60 = Array.from({ length: 60 }, (_, i) => perMin[iso(now - (59 - i) * 60_000).slice(0, 16)] ?? 0);
  const reasons: Record<string, number> = {};
  for (const c of c24) if (!c.ok) reasons[c.reason] = (reasons[c.reason] ?? 0) + 1;

  const ev7 = events.filter((e) => Date.parse(e.at) >= now - 7 * DAY);
  const evByType: Record<string, number> = {};
  for (const e of ev7) evByType[e.type] = (evByType[e.type] ?? 0) + 1;

  mrr = round(mrr, 2);
  return {
    plans: { workspaces: workspaces.length, mix, activePaid },
    revenue: { mrrUsd: mrr, paymentsLast30d: pay30.length, paymentsRevenueLast30dUsd: revenue30, refundedLast30d: all30.length - pay30.length, recordedAmountLast30dUsd: recorded30, recordedAmountPayments: withAmount.length, billingEventsLast7d: evByType },
    spend: { last30dUsd: round(spend30), byFeature, byPlan, topUsers: byUser, byDay: spendByDay },
    margin: { estimateUsd: round(mrr - spend30, 2), note: "MRR minus provider spend over 30 days. Excludes payment fees, hosting, database and email costs." },
    models: { calls24h: c24.length, errors24h: c24.filter((c) => !c.ok).length, errorRate24h: c24.length ? round(c24.filter((c) => !c.ok).length / c24.length, 4) : null, p50Ms: percentile(lat, 50), p95Ms: percentile(lat, 95), errorReasons: reasons, byModel: by((c) => c.model).slice(0, 20), byProvider: by((c) => c.provider), requestsPerMinute: last60 },
  };
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    console.error("[admin] metric failed:", e instanceof Error ? e.name : "error");
    return fallback;
  }
}

const KEY_NAMES: [string, string][] = [
  ["OPENROUTER_API_KEY", "Model access (OpenRouter)"],
  ["KEPLAR_LIVE_MODELS", "Live models switch (=1)"],
  ["DATABASE_URL", "Database (Neon)"],
  ["BETTER_AUTH_SECRET", "Sign-in secret"],
  ["WHOP_WEBHOOK_SECRET", "Billing webhooks (Whop)"],
  ["WHOP_API_KEY", "Hosted checkout (Whop API)"],
  ["RESEND_API_KEY", "Email (Resend)"],
  ["UPSTASH_REDIS_REST_URL", "Shared rate limits (Upstash)"],
  ["INNGEST_SIGNING_KEY", "Agent scheduler (Inngest)"],
  ["KEPLAR_ALERT_WEBHOOK_URL", "Alert webhook"],
];
const configured = (name: string) => Boolean(process.env[name]?.trim()) || (name === "DATABASE_URL" && neonConfigured());

export async function adminOverview() {
  const now = Date.now();
  const since30 = iso(now - 30 * DAY);
  const [workspaces, ledger, calls, payments, events, controls, audit, today, adminToday, level] = await Promise.all([
    safe(() => collection<WorkspaceRow>("accounts_workspaces").listSystem(), [] as WorkspaceRow[]),
    safe(() => collection<LedgerRow>("compute_ledger").listSystemRange({ field: "at", gte: since30 }), [] as LedgerRow[]),
    safe(() => collection<ModelCallRow>("model_calls").listSystemRange({ field: "at", gte: iso(now - DAY) }), [] as ModelCallRow[]),
    safe(() => collection<PaymentRow>("whop_payments").listSystem(), [] as PaymentRow[]),
    safe(() => collection<EventRow>("billing_events").listSystemRange({ field: "at", gte: iso(now - 7 * DAY) }, 5000), [] as EventRow[]),
    safe(() => opsControlsFresh(), null as OpsControls | null),
    safe(() => recentAudit(100), [] as AuditRow[]),
    safe(() => spendToday(), null),
    safe(() => adminSpendToday(), null as number | null),
    safe(() => breakerLevel(), "normal" as const),
  ]);
  const base = summarize({ now, workspaces, ledger, calls, payments, events });

  const users = neonConfigured()
    ? await safe(async () => {
        const r = await neonQuery("SELECT count(*)::int AS total, count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS new7, count(*) FILTER (WHERE last_login > now() - interval '24 hours')::int AS active24 FROM keplar_users");
        return { total: Number(r[0]?.total ?? 0), new7d: Number(r[0]?.new7 ?? 0), active24h: Number(r[0]?.active24 ?? 0) };
      }, null)
    : null;
  const inquiries = neonConfigured()
    ? await safe(async () => {
        const c = await neonQuery("SELECT count(*)::int AS total, count(*) FILTER (WHERE received_at > now() - interval '7 days')::int AS last7, count(*) FILTER (WHERE email_status = 'failed')::int AS failed FROM inquiries");
        const recent = await neonQuery("SELECT id, received_at, name, email, company, email_status FROM inquiries ORDER BY received_at DESC LIMIT 8");
        return { total: Number(c[0]?.total ?? 0), last7d: Number(c[0]?.last7 ?? 0), emailFailed: Number(c[0]?.failed ?? 0), recent: recent.map((r) => ({ id: String(r.id), at: String(r.received_at), name: String(r.name).slice(0, 40), email: maskEmail(String(r.email)), company: String(r.company).slice(0, 40), emailStatus: String(r.email_status) })) };
      }, null)
    : null;

  return {
    generatedAt: new Date(now).toISOString(),
    ...base,
    users,
    inquiries,
    guard: { spendToday: today ? { totalUsd: round(today.totalUsd, 2), freeUsd: round(today.freeUsd, 2) } : null, caps: caps(), adminSpendTodayUsd: adminToday, breakerLevel: level },
    controls,
    audit: audit.map((a) => ({ ...a, actor: a.actor.includes("@") ? maskEmail(a.actor) : a.actor })),
    system: { storeDurable: storeDurable(), checkout: whopCheckoutConfigured(), webhook: whopWebhookConfigured(), keys: KEY_NAMES.map(([name, label]) => ({ name, label, set: configured(name) })) },
  };
}
