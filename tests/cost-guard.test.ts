import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, type DecideInput } from "@/lib/cost/guard";
import { applyEnv, DEFAULT_COST_CONFIG, featureMultiplier, mergeConfig, quotaFor, sanitizeConfigPatch, type CostConfig } from "@/lib/cost/config";
import { crossedAlerts, overageAllows, overagePrice, periodOf } from "@/lib/cost/overage";
import { featuresToThrottle } from "@/lib/cost/watch";
import { summarizeProfitability, type LedgerRow } from "@/lib/cost/report";
import { revenueByUser, revenuePerCredit } from "@/lib/cost/revenue";
import { applyRunwayAlert, computeBalance, detectTopup, fetchOpenRouterBalance, pushSample, runwayOf, trailingSpend24h } from "@/lib/ops/openrouter-balance";
import { globalCapStatusFrom } from "@/lib/cost/global-cap";
import { estimateTable } from "@/lib/cost/estimates";
import { freeQuestionLimitFrom } from "@/lib/cost/hooks";
import type { CostEvent } from "@/lib/cost/meter";

const cfg = (patch: unknown = {}): CostConfig => mergeConfig(DEFAULT_COST_CONFIG, patch);
const base = (o: Partial<DecideInput> = {}): DecideInput => ({ cfg: cfg(), feature: "ask", plan: "plus", admin: false, provider: "openrouter", endpoint: "chat", paid: true, usage: { calls: 0, usd: 0, requests: 0 }, newRequest: true, throttle: null, balanceExhausted: false, ...o });
const FB = DEFAULT_COST_CONFIG.degrade.freeFallbackModels[0];

/* ── decide(): kill switches, Free models, throttles, balance, quotas ── */

test("defaults: owner-pending pricing flags are OFF; safety flags are on", () => {
  const f = DEFAULT_COST_CONFIG.flags;
  assert.equal(f.freeDailyLimits, false);
  assert.equal(f.overage, false);
  assert.equal(f.enforceQuotas && f.freeModelsOnly && f.autoThrottle && f.degradeOnLowBalance, true);
  assert.equal(DEFAULT_COST_CONFIG.lowBalance.percent, 1);
  assert.equal(DEFAULT_COST_CONFIG.revenue.planMonthlyUsd.plus, 45);
  assert.equal(DEFAULT_COST_CONFIG.revenue.planMonthlyUsd.pro, 99);
});

test("decide: kill switch beats everything, including admins and free models", () => {
  const c = cfg({ killSwitches: { video: true } });
  for (const o of [{ admin: true }, { paid: false }, { plan: "free" as const }]) {
    const d = decide(base({ cfg: c, feature: "video", endpoint: "video", ...o }));
    assert.equal(d.action === "block" && d.code, "feature_disabled");
  }
  assert.equal(decide(base({ cfg: c, feature: "ask" })).action, "allow", "other features are untouched");
  assert.equal(decide(base({ cfg: c, feature: "video", endpoint: "meta" })).action, "allow", "metadata calls are never blocked");
});

test("decide: Free plan is free-models-only (unless the flag is off or admin)", () => {
  assert.equal((decide(base({ plan: "free" })) as { code?: string }).code, "free_models_only");
  assert.equal(decide(base({ plan: "free", paid: false })).action, "allow");
  assert.equal(decide(base({ plan: "free", admin: true })).action, "allow");
  assert.equal(decide(base({ plan: "free", cfg: cfg({ flags: { freeModelsOnly: false } }) })).action, "allow");
});

test("decide: throttles rewrite paid chat to a free model, block other paid work, and expire", () => {
  const until = new Date(Date.now() + 3600_000).toISOString();
  const t = { action: "free_models" as const, until, reason: "margin", at: until, by: "watch" };
  assert.deepEqual(decide(base({ throttle: t })), { action: "rewrite", model: FB, reason: "throttle" });
  assert.equal((decide(base({ throttle: t, endpoint: "image", feature: "images" })) as { code?: string }).code, "feature_throttled");
  assert.equal((decide(base({ throttle: { ...t, action: "block" } })) as { code?: string }).code, "feature_throttled");
  assert.equal(decide(base({ throttle: t, paid: false })).action, "allow");
  assert.equal(decide(base({ throttle: { ...t, until: new Date(Date.now() - 1000).toISOString() } })).action, "allow", "expired");
});

test("decide: exhausted OpenRouter balance degrades instead of erroring", () => {
  assert.deepEqual(decide(base({ balanceExhausted: true })), { action: "rewrite", model: FB, reason: "low_balance" });
  assert.equal((decide(base({ balanceExhausted: true, endpoint: "video", feature: "video" })) as { code?: string }).code, "low_balance");
  assert.equal(decide(base({ balanceExhausted: true, provider: "anthropic" })).action, "allow", "other providers have their own balance");
  assert.equal(decide(base({ balanceExhausted: true, cfg: cfg({ flags: { degradeOnLowBalance: false } }) })).action, "allow");
});

test("decide: per-plan per-feature quotas by calls and by USD; overage room passes the USD cap only with the flag on", () => {
  const c = cfg();
  assert.equal(quotaFor(c, "plus", "images")?.dailyUsd, 2);
  assert.equal(quotaFor(c, "plus", "slides")?.dailyUsd, 4, "falls back to *");
  assert.equal((decide(base({ feature: "images", endpoint: "image", usage: { calls: 1, usd: 2, requests: 1 } })) as { code?: string }).code, "quota_usd");
  assert.equal(decide(base({ feature: "images", endpoint: "image", usage: { calls: 1, usd: 1.99, requests: 1 } })).action, "allow");
  assert.equal((decide(base({ plan: "free", paid: false, feature: "deep-research", usage: { calls: 60, usd: 0, requests: 3 } })) as { code?: string }).code, "quota_calls");
  assert.equal((decide(base({ plan: "free", paid: false, feature: "video", usage: { calls: 0, usd: 0, requests: 0 } })) as { code?: string }).code, "quota_calls", "Free video is 0/day");
  const over = { feature: "images" as const, endpoint: "image" as const, usage: { calls: 1, usd: 5, requests: 1 }, overageRoom: true };
  assert.equal((decide(base(over)) as { code?: string }).code, "quota_usd", "flag off: still capped");
  assert.equal(decide(base({ ...over, cfg: cfg({ flags: { overage: true } }) })).action, "allow");
  assert.equal(decide(base({ ...over, admin: true })).action, "allow", "admins have no quota");
});

test("decide: Free daily heavy limits count requests, not calls, and only with the flag on", () => {
  const on = cfg({ flags: { freeDailyLimits: true } });
  const fr = { plan: "free" as const, paid: false, feature: "debate" as const };
  assert.equal(decide(base({ ...fr, usage: { calls: 30, usd: 0, requests: 2 }, cfg: on })).action, "allow");
  assert.equal((decide(base({ ...fr, usage: { calls: 30, usd: 0, requests: 3 }, cfg: on })) as { code?: string }).code, "free_daily");
  assert.equal(decide(base({ ...fr, usage: { calls: 30, usd: 0, requests: 3 }, cfg: on, newRequest: false })).action, "allow", "later calls of an allowed run finish");
  assert.equal(decide(base({ ...fr, usage: { calls: 30, usd: 0, requests: 9 } })).action, "allow", "flag off");
  assert.equal(decide(base({ ...fr, plan: "plus", usage: { calls: 0, usd: 0, requests: 9 }, cfg: on })).action, "allow", "paid plans unaffected");
});

test("Free daily questions: live limit untouched with the flag off; 25 signed-in / 5 anonymous (configurable) with it on", () => {
  assert.equal(freeQuestionLimitFrom(cfg(), false, 50), 50);
  assert.equal(freeQuestionLimitFrom(cfg(), true, 50), 50);
  const on = cfg({ flags: { freeDailyLimits: true } });
  assert.equal(freeQuestionLimitFrom(on, false, 50), 25);
  assert.equal(freeQuestionLimitFrom(on, true, 50), 5);
  const tuned = mergeConfig(on, sanitizeConfigPatch({ freeDaily: { questions: 30, anonQuestions: 3 } }).patch);
  assert.deepEqual([freeQuestionLimitFrom(tuned, false, 50), freeQuestionLimitFrom(tuned, true, 50)], [30, 3]);
});

/* ── config ─────────────────────────────────────────────────────────── */

test("config: sanitize keeps only known keys and sane ranges; env flags and kill switches apply", () => {
  const { patch, rejected } = sanitizeConfigPatch({ flags: { overage: true, bogus: true, enforceQuotas: "yes" }, killSwitches: { video: true, nope: true }, pricing: { marginMultiplier: 100 }, lowBalance: { percent: 2, basis: "total" }, quotas: { plus: { images: { dailyUsd: 3 } }, gold: {} } });
  assert.deepEqual(patch.flags, { overage: true });
  assert.deepEqual(patch.killSwitches, { video: true });
  assert.deepEqual(patch.lowBalance, { percent: 2, basis: "total" });
  assert.ok(rejected.includes("flags.enforceQuotas") && rejected.includes("killSwitches.nope") && rejected.includes("pricing.marginMultiplier") && rejected.includes("quotas.gold"));
  const c = mergeConfig(DEFAULT_COST_CONFIG, patch);
  assert.equal(c.quotas.plus.images?.dailyUsd, 3);
  assert.equal(c.quotas.plus["*"]?.dailyUsd, 4, "merge keeps the rest");
  const e = applyEnv(DEFAULT_COST_CONFIG, { KEPLAR_FLAG_OVERAGE: "1", KEPLAR_FLAG_ENFORCE_QUOTAS: "0", KEPLAR_FEATURE_OFF: "video, deep-research,junk", KEPLAR_COST_CONFIG: '{"pricing":{"marginMultiplier":1.25}}' });
  assert.equal(e.flags.overage, true);
  assert.equal(e.flags.enforceQuotas, false);
  assert.equal(e.killSwitches.video && e.killSwitches["deep-research"], true);
  assert.equal(featureMultiplier(e, "ask"), 1.25);
  assert.equal(applyEnv(DEFAULT_COST_CONFIG, { KEPLAR_COST_CONFIG: "{not json" }).pricing.marginMultiplier, 1);
});

/* ── overage ────────────────────────────────────────────────────────── */

test("overage: price = cost × multiplier (never below cost); opt-in, plan, feature and cap gates; 50/80/100% alerts once", () => {
  const off = cfg();
  const on = cfg({ flags: { overage: true } });
  assert.equal(DEFAULT_COST_CONFIG.overage.multiplier, 4, "≥70% margin on overage (business plan §8)");
  assert.equal(overagePrice(on, 2), 8);
  assert.equal(overagePrice(on, 1.82, 1000), 7.5, "1,000 credits = $7.50 (the Plus rate)");
  assert.equal(overagePrice(on, 3, 1000), 12, "never below cost × 4 when credits undercount cost");
  for (const p of DEFAULT_COST_CONFIG.overage.priceList) assert.ok(p.usd >= p.providerCostUsd * 3.8 - 1e-9 && 1 - p.providerCostUsd / p.usd >= 0.7, p.unit);
  assert.ok(1 - 1 / DEFAULT_COST_CONFIG.overage.multiplier >= 0.7);
  assert.equal(overagePrice(cfg({ overage: { multiplier: 0.5 } }), 2), 2, "multiplier floors at 1");
  const ok = { cfg: on, plan: "plus", feature: "video" as const, settings: { optedIn: true, capUsd: 20 }, usedUsd: 0, estimateCostUsd: 1 };
  assert.equal(overageAllows(ok), true);
  assert.equal(overageAllows({ ...ok, cfg: off }), false, "flag off");
  assert.equal(overageAllows({ ...ok, plan: "free" }), false);
  assert.equal(overageAllows({ ...ok, feature: "ask" }), false, "not an overage feature");
  assert.equal(overageAllows({ ...ok, settings: { optedIn: false, capUsd: 20 } }), false);
  assert.equal(overageAllows({ ...ok, usedUsd: 16 }), true, "16 + 4 = 20 fits the cap exactly");
  assert.equal(overageAllows({ ...ok, usedUsd: 16.5 }), false, "would pass the user's cap (16.5 + 4 > 20)");
  assert.equal(overageAllows({ ...ok, settings: { optedIn: true, capUsd: 10_000 }, usedUsd: 499 }), false, "admin max cap wins");
  assert.deepEqual(crossedAlerts(on, 20, 0, 9.9, []), []);
  assert.deepEqual(crossedAlerts(on, 20, 9, 10, []), [50]);
  assert.deepEqual(crossedAlerts(on, 20, 10, 20, [50]), [80, 100]);
  assert.deepEqual(crossedAlerts(on, 20, 20, 21, [50, 80, 100]), []);
  assert.equal(periodOf(undefined, Date.parse("2026-10-31T23:59:59Z")), "2026-10");
});

/* ── margin, anomalies, auto-throttle ───────────────────────────────── */

const ev = (o: Partial<CostEvent>): CostEvent => ({ id: Math.random().toString(36), workspaceId: "system", at: new Date().toISOString(), day: new Date().toISOString().slice(0, 10), feature: "ask", userId: "u1", plan: "plus", provider: "openrouter", endpoint: "chat", model: "m", tokensIn: 1, tokensOut: 1, usd: 1, costSource: "provider", latencyMs: 100, status: 200, ok: true, ...o }) as CostEvent;

test("margin: revenue per credit, per-feature margin, negative-margin features flagged and picked for throttling", () => {
  const c = cfg({ margin: { minCostUsd: 5 } });
  assert.ok(Math.abs(revenuePerCredit(c, "plus") - 45 / 6000) < 1e-9);
  assert.equal(revenuePerCredit(c, "free"), 0);
  const now = Date.now();
  const periodEnd = new Date(now + 10 * 86400_000).toISOString();
  const revenue = revenueByUser([{ id: "u1", plan: "plus", billing: { status: "active", periodEnd } as never, ownerEmail: "a@x.com" }, { id: "u2", plan: "free", billing: null as never, ownerEmail: "b@x.com" }], c);
  assert.equal(revenue.get("u1")?.monthlyUsd, 45);
  assert.equal(revenue.get("u2")?.monthlyUsd, 0);
  // Slides: $1 cost, 1000 credits charged (≈ $7.50 revenue) → healthy. Video: $12 cost, 100 credits → loss.
  const events = [ev({ feature: "slides", usd: 1 }), ...Array.from({ length: 4 }, () => ev({ feature: "video", endpoint: "video", usd: 3 })), ev({ feature: "title", usd: 0.5 })];
  const ledger: LedgerRow[] = [{ id: "l1", workspaceId: "u1", action: "slides.generate", units: 1000, usd: 2, at: new Date().toISOString(), feature: "slides" }, { id: "l2", workspaceId: "u1", action: "video.generate", units: 100, usd: 0.2, at: new Date().toISOString(), feature: "video" }];
  const r = summarizeProfitability({ events, ledger, revenue, cfg: c, now, windowDays: 30 });
  const slides = r.byFeature.find((l) => l.feature === "slides")!;
  const video = r.byFeature.find((l) => l.feature === "video")!;
  const ask = r.byFeature.find((l) => l.feature === "ask");
  assert.equal(slides.revenue, 7.5);
  assert.equal(slides.margin, 6.5);
  assert.ok(video.margin < 0);
  assert.equal(ask?.overheadUsd, 0.5, "title cost rolls into Ask");
  assert.ok(r.anomalies.some((a) => a.kind === "negative_margin_feature" && a.feature === "video"));
  assert.ok(!r.anomalies.some((a) => a.kind === "negative_margin_feature" && a.feature === "slides"));
  assert.equal(r.totals.usd, 13.5);
  assert.deepEqual(featuresToThrottle(r.anomalies, {}, c), ["video"]);
  assert.deepEqual(featuresToThrottle(r.anomalies, { video: {} }, c), [], "already throttled");
  assert.deepEqual(featuresToThrottle(r.anomalies, {}, cfg({ flags: { autoThrottle: false } })), [], "auto-throttle off: alert only");
  // A loss under the minimum cost is not acted on (noise).
  const small = summarizeProfitability({ events: [ev({ feature: "video", usd: 1 })], ledger: [], revenue, cfg: c, now, windowDays: 30 });
  assert.ok(!small.anomalies.some((a) => a.kind === "negative_margin_feature"));
});

test("anomalies: today's spike vs the trailing average, one heavy account, Free paid cost", () => {
  const c = cfg();
  const now = Date.now();
  const day = (d: number) => new Date(now - d * 86400_000).toISOString().slice(0, 10);
  const events = [...[1, 2, 3, 4, 5, 6, 7].map((d) => ev({ feature: "images", usd: 0.5, day: day(d), at: new Date(now - d * 86400_000).toISOString(), userId: "u9" })), ev({ feature: "images", usd: 6, userId: "u1" }), ev({ feature: "ask", usd: 0.2, plan: "free", userId: "u3" })];
  const revenue = new Map([["u3", { userId: "u3", email: "c@x.com", plan: "free" as const, monthlyUsd: 0, source: "none" as const, active: false }]]);
  const r = summarizeProfitability({ events, ledger: [], revenue, cfg: c, now, windowDays: 30 });
  assert.ok(r.anomalies.some((a) => a.kind === "feature_spike" && a.feature === "images"));
  assert.ok(r.anomalies.some((a) => a.kind === "user_spike" && a.userId === "u1"));
  assert.ok(r.anomalies.some((a) => a.kind === "free_paid_cost" && a.userId === "u3"));
});

/* ── OpenRouter low-balance thresholds ──────────────────────────────── */

test("balance: ≤1% of the last top-up (configurable) is low; floor; top-up detection", () => {
  assert.equal(computeBalance(500, 499, new Date(), { basis: "last_topup", lastTopupUsd: 100, percent: 1 }).low, true, "$1 left of a $100 top-up = 1%");
  assert.equal(computeBalance(500, 498.9, new Date(), { basis: "last_topup", lastTopupUsd: 100, percent: 1 }).low, false, "1.1%");
  assert.equal(computeBalance(500, 495, new Date(), { basis: "total", percent: 1 }).low, true, "1% of $500 total");
  assert.equal(computeBalance(500, 480, new Date(), { basis: "total", percent: 5 }).low, true, "5% configured");
  assert.equal(computeBalance(500, 400, new Date(), { floorUsd: 150 }).low, true, "floor");
  assert.equal(computeBalance(0, 0).low, true, "no credit at all");
  const b = computeBalance(500, 499.5, new Date(), { basis: "last_topup", lastTopupUsd: 100 });
  assert.deepEqual([b.basis, b.basisUsd, b.percent], ["last_topup", 100, 0.5]);
  const first = detectTopup(null, { totalCredits: 300, checkedAt: "t1", source: "credits" });
  assert.deepEqual(first, { lastTopupUsd: 300, lastTopupAt: null });
  const top = detectTopup({ totalCredits: 300, lastTopupUsd: 300, lastTopupAt: null, source: "credits" }, { totalCredits: 350, checkedAt: "t2", source: "credits" });
  assert.deepEqual(top, { lastTopupUsd: 50, lastTopupAt: "t2" });
  assert.deepEqual(detectTopup({ totalCredits: 350, lastTopupUsd: 50, lastTopupAt: "t2", source: "credits" }, { totalCredits: 350, checkedAt: "t3", source: "credits" }), { lastTopupUsd: 50, lastTopupAt: "t2" });
});

test("balance: without a management key, the key's own credit limit is used when one is set", async () => {
  const f = (async (url: string) => (String(url).endsWith("/credits") ? new Response("{}", { status: 403 }) : Response.json({ data: { limit: 200, limit_remaining: 1.5 } }))) as unknown as typeof fetch;
  const r = await fetchOpenRouterBalance({ fetchImpl: f, env: { OPENROUTER_API_KEY: "sk-or-test" }, keyFallback: true, rule: { percent: 1 } });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.source, "key_limit");
    assert.equal(r.remaining, 1.5);
    assert.equal(r.low, true);
  }
  const noLimit = (async (url: string) => (String(url).endsWith("/credits") ? new Response("{}", { status: 403 }) : Response.json({ data: { limit: null, limit_remaining: null } }))) as unknown as typeof fetch;
  const r2 = await fetchOpenRouterBalance({ fetchImpl: noLimit, env: { OPENROUTER_API_KEY: "sk-or-test" }, keyFallback: true });
  assert.equal(r2.ok === false && r2.code, "management_key_required");
});

test("runway: trailing-24h spend from usage readings, warn at 7 days, critical at 2, extrapolated from ≥1 h", () => {
  const t0 = Date.parse("2026-10-06T00:00:00Z");
  const at = (h: number) => new Date(t0 + h * 3600_000).toISOString();
  assert.equal(trailingSpend24h([], { at: at(0), usage: 100 }), null, "no history");
  assert.equal(trailingSpend24h([{ at: at(0), usage: 100 }], { at: at(0.5), usage: 101 }), null, "under 1 h");
  assert.equal(trailingSpend24h([{ at: at(0), usage: 100 }], { at: at(2), usage: 110 }), 120, "$10 in 2 h → $120/day");
  assert.equal(trailingSpend24h([{ at: at(0), usage: 100 }, { at: at(1), usage: 103 }, { at: at(20), usage: 150 }], { at: at(25), usage: 160 }), 57, "the newest sample ≥24 h old: 160 − 103");
  assert.equal(trailingSpend24h([{ at: at(0), usage: 100 }], { at: at(5), usage: 90 }), null, "counter went down");
  assert.equal(trailingSpend24h([{ at: at(0), usage: 100, source: "key_limit" }], { at: at(5), usage: 120, source: "credits" }), null, "different source");
  const r = { warnDays: 7, criticalDays: 2 };
  assert.deepEqual(runwayOf(700, 50, r), { runwayDays: 14, runway: "ok" });
  assert.deepEqual(runwayOf(350, 50, r), { runwayDays: 7, runway: "warn" });
  assert.deepEqual(runwayOf(100, 50, r), { runwayDays: 2, runway: "critical" });
  assert.deepEqual(runwayOf(0, 50, r), { runwayDays: 0, runway: "critical" });
  assert.deepEqual(runwayOf(100, null, r), { runwayDays: null, runway: "unknown" });
  // The 1% rule alone: $308 left of $30.8k lifetime at $2.2k/day is ~3.4 h; runway flags it as critical long before.
  assert.equal(computeBalance(30_800, 30_492, new Date(), { basis: "total", percent: 1 }).low, true);
  assert.equal(runwayOf(3_000, 2_200, r).runway, "critical");
  let h = pushSample([], { at: at(0), usage: 1 });
  h = pushSample(h, { at: at(0.1), usage: 2 });
  assert.equal(h.length, 1, "one sample per 20 min");
  h = pushSample(h, { at: at(1), usage: 3 });
  h = pushSample(h, { at: at(60), usage: 9 });
  assert.deepEqual(h.map((x) => x.usage), [9], "older than 48 h dropped");
});

test("runway alert: emails when the level worsens, once per level per day, re-arms on recovery", async () => {
  const sent: string[] = [];
  const send = async (m: { subject: string }) => (sent.push(m.subject), true);
  const env = { KEPLAR_OWNER_EMAIL: "owner@example.com" };
  const b = (runway: "ok" | "warn" | "critical" | "unknown", runwayDays: number | null) => ({ ...computeBalance(1000, 900), checkedAt: "2026-10-06T12:00:00.000Z", runway, runwayDays, spend24hUsd: 20 });
  assert.equal(await applyRunwayAlert(b("unknown", null), { send, env }), false);
  assert.equal(await applyRunwayAlert(b("ok", 30), { send, env }), false);
  assert.equal(await applyRunwayAlert(b("warn", 5), { send, env }), true);
  assert.equal(await applyRunwayAlert(b("warn", 4.9), { send, env }), false, "same level: no repeat");
  assert.equal(await applyRunwayAlert(b("critical", 1.5), { send, env }), true, "worse: alerts");
  assert.equal(await applyRunwayAlert(b("ok", 40), { send, env }), false, "recovered: re-armed");
  assert.equal(await applyRunwayAlert(b("critical", 1.5), { send, env }), false, "same level, same day: deduped");
  assert.match(sent[0], /Warning: OpenRouter credit runs out in about 5 days/);
  assert.match(sent[1], /CRITICAL/);
  assert.equal(sent.length, 2);
});

test("global daily cap: alert at 80%, suggest 1.5× the busiest day, never changes the cap", () => {
  const c = cfg();
  assert.deepEqual(globalCapStatusFrom({ capUsd: 25, todayUsd: 10, recentDaysUsd: [8, 12], cfg: c }), { capUsd: 25, todayUsd: 10, pct: 40, level: "ok", busiestDayUsd: 12, recommendedUsd: 25, needsRaise: false });
  const w = globalCapStatusFrom({ capUsd: 25, todayUsd: 20, recentDaysUsd: [18], cfg: c });
  assert.equal(w.level, "warn");
  assert.equal(w.recommendedUsd, 30, "1.5 × $20 = $30");
  assert.equal(w.needsRaise, true);
  assert.equal(globalCapStatusFrom({ capUsd: 25, todayUsd: 26, recentDaysUsd: [], cfg: c }).level, "capped");
  // At scale (financial model Base ≈ $3.6k/day variable cost) the suggestion lands near $5.4k.
  assert.equal(globalCapStatusFrom({ capUsd: 25, todayUsd: 100, recentDaysUsd: [3_600], cfg: c }).recommendedUsd, 5_400);
  assert.equal(globalCapStatusFrom({ capUsd: 25, todayUsd: 20, recentDaysUsd: [], cfg: cfg({ globalCap: { alertPct: 90 } }) }).level, "ok");
});

/* ── estimates ──────────────────────────────────────────────────────── */

test("estimates: every metered feature has a positive or explicit-zero estimate and credits cover cost × 1.1", () => {
  const rows = estimateTable();
  assert.ok(rows.length >= 10);
  for (const r of rows) {
    assert.ok(r.paidUsd >= 0, r.feature);
    assert.ok(r.credits * 0.002 >= r.paidUsd * 1.1 - 1e-6, `${r.feature} credits cover cost`);
  }
});
