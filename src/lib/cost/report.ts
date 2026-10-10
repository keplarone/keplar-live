/**
 * Profitability report for /admin/profitability. `summarizeProfitability` is pure (unit-tested); `profitabilityReport`
 * loads cost events, the credit ledger, workspaces/revenue, throttles and the OpenRouter balance.
 *
 * Feature revenue = credits charged on that feature × the payer's revenue per credit (plan price / monthly credits).
 * Credits a subscriber never spends are "unallocated" revenue (shown, not credited to any feature). Overhead features
 * (config `overheadOf`, e.g. chat titles) carry no revenue of their own; their cost is added to the parent feature's margin.
 */
import { collection } from "@/lib/create/platform/store";
import { maskEmail } from "@/lib/ops/audit";
import { lastOpenRouterBalance, type OpenRouterBalance } from "@/lib/ops/openrouter-balance";
import { globalCapStatus, type GlobalCapStatus } from "./global-cap";
import { costConfig, type CostConfig } from "./config";
import { FEATURES, featureForLedgerAction, isFeature, type FeatureId } from "./features";
import { activeThrottles, guardState, type Throttle } from "./guard";
import { COST_EVENTS, type CostEvent } from "./meter";
import { loadRevenue, revenuePerCredit, type UserRevenue } from "./revenue";

const DAY = 864e5;
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
const r2 = (n: number) => Math.round(n * 100) / 100;

export type LedgerRow = { id: string; workspaceId: string; action: string; units: number; usd: number; at: string; feature?: string };

export type Anomaly = { level: "bad" | "warn"; kind: "negative_margin_feature" | "negative_margin_user" | "feature_spike" | "user_spike" | "free_paid_cost" | "untagged" | "estimated" | "blocked"; message: string; feature?: FeatureId; userId?: string };

export type FeatureLine = { feature: FeatureId; calls: number; blocked: number; degraded: number; usd: number; users: number; credits: number; billedUsd: number; revenue: number; overheadUsd: number; margin: number; marginPct: number | null; estimatedShare: number };

const pct = (num: number, den: number) => (den > 0 ? r2((num / den) * 100) : null);

function percentile(sorted: number[], p: number) {
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : null;
}

export function summarizeProfitability(input: { events: CostEvent[]; ledger: LedgerRow[]; revenue: Map<string, UserRevenue>; cfg: CostConfig; now: number; windowDays: number }) {
  const { events, ledger, revenue, cfg, now, windowDays } = input;
  const since = now - windowDays * DAY;
  const ev = events.filter((e) => Date.parse(e.at) >= since);
  const led = ledger.filter((l) => Date.parse(l.at) >= since);
  const prorate = Math.min(1, windowDays / 30);

  const sent = ev.filter((e) => !e.blocked);
  const cost = sent.reduce((t, e) => t + e.usd, 0);
  const estimatedUsd = sent.filter((e) => e.costSource !== "provider" && e.costSource !== "free").reduce((t, e) => t + e.usd, 0);
  let revenueTotal = 0;
  for (const u of revenue.values()) revenueTotal += u.monthlyUsd * prorate;

  // Per feature.
  const f = new Map<FeatureId, FeatureLine & { userSet: Set<string> }>();
  const line = (k: FeatureId) => {
    let l = f.get(k);
    if (!l) f.set(k, (l = { feature: k, calls: 0, blocked: 0, degraded: 0, usd: 0, users: 0, credits: 0, billedUsd: 0, revenue: 0, overheadUsd: 0, margin: 0, marginPct: null, estimatedShare: 0, userSet: new Set() }));
    return l;
  };
  const estByFeature = new Map<FeatureId, number>();
  for (const e of ev) {
    const l = line(e.feature);
    if (e.blocked) { l.blocked++; continue; }
    l.calls++;
    l.usd += e.usd;
    if (e.degraded) l.degraded++;
    if (e.userId) l.userSet.add(e.userId);
    if (e.costSource !== "provider" && e.costSource !== "free") estByFeature.set(e.feature, (estByFeature.get(e.feature) ?? 0) + e.usd);
  }
  const planOf = (ws: string) => revenue.get(ws)?.plan ?? null;
  for (const r of led) {
    const k = isFeature(r.feature) ? r.feature : featureForLedgerAction(r.action);
    const l = line(k);
    l.credits += r.units || 0;
    l.billedUsd += r.usd || 0;
    l.revenue += (r.units || 0) * revenuePerCredit(cfg, planOf(r.workspaceId));
  }
  for (const [child, parent] of Object.entries(cfg.overheadOf) as [FeatureId, FeatureId][]) {
    const c = f.get(child);
    if (c && c.usd > 0) line(parent).overheadUsd += c.usd;
  }
  const overheadChildren = new Set(Object.keys(cfg.overheadOf));
  const byFeature: FeatureLine[] = [...f.values()]
    .map(({ userSet, ...l }) => {
      const isOverhead = overheadChildren.has(l.feature);
      const margin = isOverhead ? 0 : l.revenue - l.usd - l.overheadUsd;
      return { ...l, users: userSet.size, usd: r4(l.usd), billedUsd: r4(l.billedUsd), revenue: r2(l.revenue), overheadUsd: r4(l.overheadUsd), margin: r2(margin), marginPct: isOverhead ? null : pct(margin, l.revenue), estimatedShare: l.usd > 0 ? r2(((estByFeature.get(l.feature) ?? 0) / l.usd) * 100) : 0 };
    })
    .sort((a, b) => b.usd - a.usd || b.calls - a.calls);
  const allocated = byFeature.reduce((t, l) => t + l.revenue, 0);

  // Per day.
  const days = new Map<string, { usd: number; calls: number }>();
  for (const e of sent) {
    const d = days.get(e.day) ?? { usd: 0, calls: 0 };
    d.usd += e.usd;
    d.calls++;
    days.set(e.day, d);
  }
  const byDay = Array.from({ length: windowDays }, (_, i) => new Date(now - (windowDays - 1 - i) * DAY).toISOString().slice(0, 10)).map((day) => ({ day, usd: r4(days.get(day)?.usd ?? 0), calls: days.get(day)?.calls ?? 0 }));

  // Per model.
  const models = new Map<string, { model: string; provider: string; calls: number; errors: number; usd: number; tokensIn: number; tokensOut: number; lat: number[] }>();
  for (const e of sent) {
    const k = `${e.provider}|${e.model ?? "unknown"}`;
    const m = models.get(k) ?? { model: e.model ?? "unknown", provider: e.provider, calls: 0, errors: 0, usd: 0, tokensIn: 0, tokensOut: 0, lat: [] };
    m.calls++;
    if (!e.ok) m.errors++;
    m.usd += e.usd;
    m.tokensIn += e.tokensIn;
    m.tokensOut += e.tokensOut;
    if (e.ok) m.lat.push(e.latencyMs);
    models.set(k, m);
  }
  const byModel = [...models.values()].map(({ lat, ...m }) => {
    const s = lat.sort((a, b) => a - b);
    return { ...m, usd: r4(m.usd), p50Ms: percentile(s, 50), p95Ms: percentile(s, 95) };
  }).sort((a, b) => b.usd - a.usd || b.calls - a.calls).slice(0, 30);

  // Per plan + per user.
  const users = new Map<string, { userId: string; usd: number; calls: number; features: Map<FeatureId, number>; plan: string | null }>();
  for (const e of sent) {
    if (!e.userId) continue;
    const u = users.get(e.userId) ?? { userId: e.userId, usd: 0, calls: 0, features: new Map(), plan: e.plan };
    u.usd += e.usd;
    u.calls++;
    u.features.set(e.feature, (u.features.get(e.feature) ?? 0) + e.usd);
    if (e.plan) u.plan = e.plan;
    users.set(e.userId, u);
  }
  const byUser = [...users.values()].map((u) => {
    const rev = revenue.get(u.userId);
    const revenueW = (rev?.monthlyUsd ?? 0) * prorate;
    const top = [...u.features.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return { userId: u.userId, email: maskEmail(rev?.email), plan: rev?.plan ?? u.plan ?? "unknown", usd: r4(u.usd), calls: u.calls, revenue: r2(revenueW), margin: r2(revenueW - u.usd), revenueSource: rev?.source ?? "none", topFeature: top };
  }).sort((a, b) => b.usd - a.usd);

  const plans = new Map<string, { plan: string; users: Set<string>; calls: number; usd: number }>();
  for (const e of sent) {
    const k = e.plan ?? "unattributed";
    const p = plans.get(k) ?? { plan: k, users: new Set(), calls: 0, usd: 0 };
    p.calls++;
    p.usd += e.usd;
    if (e.userId) p.users.add(e.userId);
    plans.set(k, p);
  }
  const revByPlan = new Map<string, { revenue: number; payers: number }>();
  for (const u of revenue.values()) {
    if (!(u.monthlyUsd > 0)) continue;
    const r = revByPlan.get(u.plan) ?? { revenue: 0, payers: 0 };
    r.revenue += u.monthlyUsd * prorate;
    r.payers++;
    revByPlan.set(u.plan, r);
  }
  for (const k of revByPlan.keys()) if (!plans.has(k)) plans.set(k, { plan: k, users: new Set(), calls: 0, usd: 0 });
  const byPlan = [...plans.values()].map((p) => {
    const rv = revByPlan.get(p.plan);
    return { plan: p.plan, activeUsers: p.users.size, payers: rv?.payers ?? 0, calls: p.calls, usd: r4(p.usd), revenue: r2(rv?.revenue ?? 0), margin: r2((rv?.revenue ?? 0) - p.usd) };
  }).sort((a, b) => b.usd - a.usd);

  const anomalies = detectAnomalies({ events: sent, byFeature, byUser, cfg, now, blocked: ev.length - sent.length, estimatedUsd, cost });

  return {
    windowDays,
    totals: {
      calls: sent.length, blocked: ev.length - sent.length, degraded: sent.filter((e) => e.degraded).length, usd: r4(cost), estimatedUsd: r4(estimatedUsd),
      revenue: r2(revenueTotal), allocatedRevenue: r2(allocated), unallocatedRevenue: r2(Math.max(0, revenueTotal - allocated)), margin: r2(revenueTotal - cost), marginPct: pct(revenueTotal - cost, revenueTotal),
      payers: [...revenue.values()].filter((u) => u.monthlyUsd > 0).length,
    },
    byFeature, byDay, byModel, byPlan, byUser: byUser.slice(0, 25), anomalies,
  };
}

export function detectAnomalies(i: { events: CostEvent[]; byFeature: FeatureLine[]; byUser: { userId: string; email: string; plan: string; usd: number; margin: number; revenue: number }[]; cfg: CostConfig; now: number; blocked: number; estimatedUsd: number; cost: number }): Anomaly[] {
  const { cfg, now } = i;
  const out: Anomaly[] = [];
  for (const l of i.byFeature) {
    // Below the target margin (default 0%: a loss). A feature with cost but no credits charged has $0 revenue, so it counts too; overhead rolls into its parent.
    const target = (l.revenue * (cfg.margin.targetMarginPct || 0)) / 100;
    if (!(l.feature in cfg.overheadOf) && l.margin < target && l.usd + l.overheadUsd >= cfg.margin.minCostUsd) out.push({ level: "bad", kind: "negative_margin_feature", feature: l.feature, message: l.margin < 0 ? `${l.feature}: cost $${(l.usd + l.overheadUsd).toFixed(2)} exceeds its allocated revenue $${l.revenue.toFixed(2)} over the window.` : `${l.feature}: margin $${l.margin.toFixed(2)} is under the ${cfg.margin.targetMarginPct}% target.` });
  }
  for (const u of i.byUser) {
    if (u.revenue > 0 && u.margin < 0) out.push({ level: "warn", kind: "negative_margin_user", userId: u.userId, message: `${u.email} (${u.plan}) cost $${u.usd.toFixed(2)} against $${u.revenue.toFixed(2)} revenue.` });
    if (u.plan === "free" && u.usd > 0.01) out.push({ level: "bad", kind: "free_paid_cost", userId: u.userId, message: `${u.email} on Free incurred $${u.usd.toFixed(2)} of paid model cost.` });
  }
  // Today vs trailing 7-day daily average, per feature.
  const today = new Date(now).toISOString().slice(0, 10);
  const perFeatureDay = new Map<string, number>();
  const userToday = new Map<string, number>();
  for (const e of i.events) {
    perFeatureDay.set(`${e.feature}|${e.day}`, (perFeatureDay.get(`${e.feature}|${e.day}`) ?? 0) + e.usd);
    if (e.day === today && e.userId) userToday.set(e.userId, (userToday.get(e.userId) ?? 0) + e.usd);
  }
  for (const feat of FEATURES) {
    const t = perFeatureDay.get(`${feat}|${today}`) ?? 0;
    if (t < cfg.anomaly.minUsd) continue;
    let sum = 0;
    for (let d = 1; d <= 7; d++) sum += perFeatureDay.get(`${feat}|${new Date(now - d * DAY).toISOString().slice(0, 10)}`) ?? 0;
    const avg = sum / 7;
    if (t > Math.max(avg * cfg.anomaly.factor, cfg.anomaly.minUsd)) out.push({ level: "warn", kind: "feature_spike", feature: feat, message: `${feat}: $${t.toFixed(2)} today vs $${avg.toFixed(2)}/day trailing average (×${avg > 0 ? (t / avg).toFixed(1) : "∞"}).` });
  }
  for (const [userId, usd] of userToday) if (usd >= cfg.anomaly.userDailyUsd) out.push({ level: "warn", kind: "user_spike", userId, message: `One account spent $${usd.toFixed(2)} today (limit for a flag $${cfg.anomaly.userDailyUsd}).` });
  const untagged = i.events.filter((e) => e.feature === "untagged").reduce((t, e) => t + e.usd, 0);
  if (i.cost > 1 && untagged / i.cost > 0.2) out.push({ level: "warn", kind: "untagged", message: `${((untagged / i.cost) * 100).toFixed(0)}% of cost has no feature tag. Add tagCostFeature() on that path.` });
  if (i.cost > 1 && i.estimatedUsd / i.cost > 0.5) out.push({ level: "warn", kind: "estimated", message: `${((i.estimatedUsd / i.cost) * 100).toFixed(0)}% of cost is price-table estimated (provider did not report cost).` });
  return out;
}

export type ProfitabilityReport = ReturnType<typeof summarizeProfitability> & {
  generatedAt: string;
  config: CostConfig;
  throttles: Partial<Record<FeatureId, Throttle>>;
  balance: OpenRouterBalance | null;
  balanceExhausted: boolean;
  globalCap: GlobalCapStatus | null;
  stripe: { configured: boolean; error: string | null; matched: number };
  truncated: boolean;
};

export async function recentCostEvents(days: number, limit = 100_000): Promise<CostEvent[]> {
  return collection<CostEvent>(COST_EVENTS).listSystemRange({ field: "at", gte: new Date(Date.now() - days * DAY).toISOString() }, limit);
}

export async function profitabilityReport(windowDays = 30): Promise<ProfitabilityReport> {
  const now = Date.now();
  const cfg = await costConfig();
  const LIMIT = 100_000;
  const [events, ledger, rev, throttles, balance, st, globalCap] = await Promise.all([
    recentCostEvents(windowDays, LIMIT).catch(() => [] as CostEvent[]),
    collection<LedgerRow>("compute_ledger").listSystemRange({ field: "at", gte: new Date(now - windowDays * DAY).toISOString() }, LIMIT).catch(() => [] as LedgerRow[]),
    loadRevenue(cfg),
    activeThrottles().catch(() => ({})),
    lastOpenRouterBalance(),
    guardState().catch(() => null),
    globalCapStatus(cfg, now).catch(() => null),
  ]);
  const s = summarizeProfitability({ events, ledger, revenue: rev.users, cfg, now, windowDays });
  return { ...s, generatedAt: new Date(now).toISOString(), config: cfg, throttles, balance, balanceExhausted: Boolean(st?.exhausted), globalCap, stripe: rev.stripe, truncated: events.length >= LIMIT };
}
