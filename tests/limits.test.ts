import "./setup";
// These tests spend whole allowances in one go to exercise windows and caps; the usage cooldown has its own tests.
process.env.KEPLAR_COOLDOWN_QUICK_FRACTION = "1000";
process.env.KEPLAR_COOLDOWN_PLUS_HOURLY_USD = "1000000";
process.env.KEPLAR_COOLDOWN_PRO_HOURLY_USD = "1000000";
process.env.KEPLAR_COOLDOWN_BUSINESS_HOURLY_USD = "1000000";
import { test } from "node:test";
import assert from "node:assert/strict";
import { clampHistory, limitsFor, meteredUsd, METER_MARGIN, overRequestCap, PLAN_LIMITS, sizeProblem } from "@/lib/orchestration/limits";
import { PLAN_ALLOWANCES } from "@/lib/orchestration/plans";
import { toUnits, USD_PER_UNIT } from "@/lib/orchestration/compute";
import { HeuristicClassifier } from "@/lib/orchestration/classifier";
import { CostAwareRouter } from "@/lib/orchestration/router";
import { liveRoster } from "@/lib/orchestration/live-catalog";
import { spentUsd } from "@/lib/orchestration/pricing";
import { enterUsage, readUsageCookie, UsageLimitError, usageCookieHeader } from "@/lib/create/platform/usage";
import { chargeUnits } from "@/lib/create/platform/compute";
import { ENTITLEMENTS } from "@/lib/create/platform/plans";
import type { Workspace } from "@/lib/create/platform/workspace";
import type { ModelSpec } from "@/lib/orchestration/types";

const ws = (over: Partial<Workspace> = {}): Workspace => ({
  id: `ws_${Math.random().toString(36).slice(2)}`, name: "T", plan: "plus", verified: true, entitlements: ENTITLEMENTS.plus, anonymous: false, admin: false,
  userId: "u", email: "u@example.com", period: { start: new Date(Date.now() - 864e5).toISOString(), end: new Date(Date.now() + 864e5 * 20).toISOString() }, ...over,
});
const req = (ip = `10.1.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, cookie = "") =>
  new Request("https://keplar.one/api/keplar", { method: "POST", headers: { "x-forwarded-for": ip, ...(cookie ? { cookie } : {}) } });

test("cost model: a plan's credits never cost more than the share of the price set aside for model spend", () => {
  assert.equal(USD_PER_UNIT, 0.002);
  assert.equal(PLAN_ALLOWANCES.plus.monthlyUnits! * USD_PER_UNIT, 12);
  assert.equal(PLAN_ALLOWANCES.pro.monthlyUnits! * USD_PER_UNIT, 27);
  assert.ok(PLAN_ALLOWANCES.plus.monthlyUnits! * USD_PER_UNIT <= 45 * 0.3, "Plus: model cost is at most 30% of the price");
  assert.ok(PLAN_ALLOWANCES.pro.monthlyUnits! * USD_PER_UNIT <= 99 * 0.3, "Pro: model cost is at most 30% of the price");
  // A day's cap times 30 may exceed the month's budget only slightly; the credit balance is the real stop.
  assert.ok(PLAN_LIMITS.plus.dailyUsd! * 30 <= 12 * 8);
  assert.ok(PLAN_LIMITS.pro.dailyUsd! * 30 <= 27 * 8);
  assert.ok(PLAN_LIMITS.plus.maxRequestUsd < 12 && PLAN_LIMITS.pro.maxRequestUsd < 27);
  assert.equal(PLAN_LIMITS.free.maxRequestUsd, 0, "Free never spends");
});

test("metering carries a 10% safety margin and rounds up", () => {
  assert.equal(METER_MARGIN, 1.1);
  assert.ok(Math.abs(meteredUsd(1) - 1.1) < 1e-9);
  assert.equal(toUnits(0.1 * METER_MARGIN), Math.ceil((0.1 * 1.1) / 0.002) + 1);
  assert.ok(toUnits(0.1 * METER_MARGIN) > toUnits(0.1));
  assert.equal(toUnits(0), 1, "at least the base unit");
});

test("spentUsd: billed cost wins; a quiet provider falls back to the token price; free models cost 0", () => {
  const m = liveRoster[0] as ModelSpec;
  assert.equal(spentUsd(m, { actualCostUsd: 0.5 }), 0.5);
  const est = spentUsd(m, { usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 } });
  assert.ok(est > 0, "estimated from tokens when no billed cost is reported");
  assert.equal(spentUsd(m, {}), 0);
  const free = { ...m, pricing: [{ from: null, inputPer1M: 0, outputPer1M: 0 }] } as ModelSpec;
  assert.equal(spentUsd(free, { usage: { inputTokens: 5_000_000, outputTokens: 5_000_000 } }), 0);
});

test("size caps per plan: prompt, attachments, bytes, images; Free gets the smallest", () => {
  const f = limitsFor("free");
  assert.ok(f.maxPromptChars < limitsFor("plus").maxPromptChars && limitsFor("plus").maxPromptChars <= limitsFor("pro").maxPromptChars);
  assert.match(sizeProblem({ prompt: "x".repeat(f.maxPromptChars + 1) }, f, "free") ?? "", /too long/);
  assert.match(sizeProblem({ prompt: "hi", attachments: Array.from({ length: f.maxAttachments + 1 }, () => ({ name: "a", size: 1, type: "text/plain" })) }, f, "free") ?? "", /attachments/);
  assert.match(sizeProblem({ prompt: "hi", attachments: [{ name: "a", size: f.maxAttachmentBytes + 1, type: "application/pdf" }] }, f, "free") ?? "", /MB/);
  assert.equal(sizeProblem({ prompt: "hi", attachments: [{ name: "a", size: 1000, type: "text/plain" }] }, f, "free"), null);
  assert.equal(sizeProblem({ prompt: "x".repeat(f.maxPromptChars + 1) }, limitsFor("plus"), "plus"), null);
});

test("history is trimmed to the plan budget, keeping the most recent turns", () => {
  const h = Array.from({ length: 10 }, (_, i) => ({ role: "user" as const, text: `${i}`.repeat(1000) }));
  const out = clampHistory(h, 2500);
  assert.ok(out.reduce((a, x) => a + x.text.length, 0) <= 2500);
  assert.ok(out.at(-1)!.text.startsWith("9"));
});

test("per-request cap: a question whose estimate (with margin) is over the cap is refused; Free has no cap", () => {
  const p = limitsFor("plus");
  assert.equal(overRequestCap(0.5, p, false), false);
  assert.equal(overRequestCap(0.9, p, false), true);
  assert.equal(overRequestCap(3.0, p, true), false);
  assert.equal(overRequestCap(3.5, p, true), true);
  assert.equal(overRequestCap(100, limitsFor("free"), false), false);
});

test("router: a short moderate question on a paid plan uses two models, not three; thorough, media and Deep Research keep the full panel", () => {
  const router = new CostAwareRouter(liveRoster);
  const cls = new HeuristicClassifier();
  const light = { prompt: "Write a friendly short note thanking my neighbour for watering my plants while I was away on holiday last week, and mention that I brought back a small gift.", plan: "plus" as const };
  const c = cls.classify(light);
  assert.equal(c.complexity, "moderate");
  const lp = router.route(c, light);
  assert.equal(lp.panel.length, 2);
  assert.ok(lp.verifier, "still reviewed");
  const thorough = router.route(c, { ...light, routing: { strategy: "thorough" } });
  assert.ok(thorough.panel.length >= 4);
  const simple = router.route(cls.classify({ prompt: "What is the capital of France?", plan: "plus" }), { prompt: "What is the capital of France?", plan: "plus" });
  assert.equal(simple.panel.length, 1, "simple questions: one cheap model");
  assert.ok(simple.estimate.usd < lp.estimate.usd);
});

test("usage guard: Free burst limit, per-user daily cap and concurrency", async () => {
  const w = ws({ plan: "free", entitlements: ENTITLEMENTS.free, anonymous: true, userId: null, id: "anonymous" });
  const ip = "198.51.100.7";
  const gates = [];
  for (let i = 0; i < limitsFor("free").concurrent; i++) gates.push(await enterUsage(req(ip), w, { countsDaily: true }));
  await assert.rejects(() => enterUsage(req(ip), w, { countsDaily: true }), (e: unknown) => e instanceof UsageLimitError && e.code === "concurrent");
  gates.forEach((g) => g.release());
  // Burst: more than burstPerMin within a minute is refused.
  const ip2 = "198.51.100.8";
  let blocked: unknown = null;
  for (let i = 0; i < limitsFor("free").burstPerMin + 2; i++) {
    try { (await enterUsage(req(ip2), w, { countsDaily: true })).release(); } catch (e) { blocked = e; }
  }
  assert.ok(blocked instanceof UsageLimitError && blocked.code === "burst");
});

test("usage guard: a signed-out Free visitor gets the full burstPerMin questions a minute (each question counts once)", async () => {
  const w = ws({ plan: "free", entitlements: ENTITLEMENTS.free, anonymous: true, userId: null, id: "anonymous" });
  const ip = "198.51.100.9";
  const n = limitsFor("free").burstPerMin;
  for (let i = 0; i < n; i++) (await enterUsage(req(ip), w, { countsDaily: true })).release();
  await assert.rejects(() => enterUsage(req(ip), w, { countsDaily: true }), (e: unknown) => e instanceof UsageLimitError && e.code === "burst");
});

test("usage guard: the signed daily cookie caps paid plans and ignores tampering; Free is counted exactly elsewhere (usage/daily.ts)", async () => {
  const w = ws({ plan: "plus", entitlements: ENTITLEMENTS.plus });
  const full = usageCookieHeader(limitsFor("plus").dailyRequests, false).split(";")[0];
  await assert.rejects(() => enterUsage(req("203.0.113.5", full), w, { countsDaily: true }), (e: unknown) => e instanceof UsageLimitError && e.code === "daily");
  const forged = full.replace(/\.\d+\./, ".0.");
  assert.equal(readUsageCookie(forged), 0);
  const g = await enterUsage(req("203.0.113.6", forged), w, { countsDaily: true });
  assert.ok(g.setCookie?.startsWith("keplar_use="));
  g.release();
  // Free: this guard no longer counts questions per day (the exact per-day meter does, in the route), so a full cookie is not a block here.
  const free = ws({ plan: "free", entitlements: ENTITLEMENTS.free, anonymous: true, userId: null, id: "anonymous" });
  (await enterUsage(req("203.0.113.7", full), free, { countsDaily: true })).release();
});

test("usage guard: Plus daily spend cap stops a user who already spent today's budget, not other users", async () => {
  const heavy = ws();
  await chargeUnits(heavy, "answer", Math.ceil(PLAN_LIMITS.plus.dailyUsd! / 0.002) + 10, PLAN_LIMITS.plus.dailyUsd! + 0.02);
  await assert.rejects(() => enterUsage(req(), heavy, { countsDaily: true }), (e: unknown) => e instanceof UsageLimitError && e.code === "daily_spend");
  const other = ws();
  (await enterUsage(req(), other, { countsDaily: true })).release();
  const admin = ws({ admin: true, plan: "business" });
  (await enterUsage(req(), admin, { countsDaily: true })).release();
});

test("engine: a question over the plan's per-request cost cap is refused before any model is called", async () => {
  const { orchestrate } = await import("@/lib/orchestration/orchestrator");
  const boom = () => { throw new Error("no model may be called"); };
  const deps = { classifier: new HeuristicClassifier(), router: new CostAwareRouter(liveRoster), pace: async () => {}, providers: [], comparator: boom, verifier: boom, synthesizer: boom, retriever: null } as unknown as Parameters<typeof orchestrate>[1];
  const events = [];
  for await (const e of orchestrate({ prompt: "Should we expand into Japan next year? Weigh the market, regulatory risk and competitors in detail.", plan: "plus", limits: { maxRequestUsd: 0.000001, maxDeepResearchUsd: 0.000001 }, computeRemaining: 1e9 }, deps)) events.push(e);
  assert.equal(events.at(-1)?.type, "error");
  assert.ok(!events.some((e) => e.type === "answer" || e.type === "model"));
});
