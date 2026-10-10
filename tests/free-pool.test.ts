import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { busyMessage, levelFor, PoolGovernor, poolConfig, resetSharedPool, TokenBucket, POOL_BUSY_MESSAGE, type PoolIo } from "@/lib/orchestration/pool-governor";
import { createRegistry } from "@/lib/orchestration/providers";
import { freeRoster } from "@/lib/orchestration/live-catalog";
import { resetDailyMemory } from "@/lib/usage/daily";
import { POST as keplarPOST } from "@/app/api/keplar/route";
import { askFree, QUESTION, stubOpenRouter } from "./helpers/free-stub";
import type { Classification, ModelSpec, Provider } from "@/lib/orchestration/types";

/** An in-memory counter table and a clock the test moves, standing in for the shared daily table. */
function fakeIo(start = Date.parse("2026-10-04T12:00:00Z")) {
  const t = { now: start };
  const table = new Map<string, number>();
  const io: PoolIo = {
    now: () => t.now,
    claim: async (key, limit, day) => {
      const k = `${key}|${day}`;
      const used = table.get(k) ?? 0;
      if (used >= limit) return null;
      table.set(k, used + 1);
      return used + 1;
    },
    used: async (key, day) => table.get(`${key}|${day}`) ?? 0,
  };
  return { t, io, table };
}

test("config: 20 RPM and a 50/day default; FREE_POOL_DAILY_LIMIT=1000 switches the day budget; a small reserve is kept for other features on the key", () => {
  assert.deepEqual(poolConfig({}), { dailyLimit: 50, reserve: 3, usable: 47, rpm: 20 });
  assert.deepEqual(poolConfig({ FREE_POOL_DAILY_LIMIT: "1000" }), { dailyLimit: 1000, reserve: 50, usable: 950, rpm: 20 });
  assert.equal(poolConfig({ FREE_POOL_DAILY_LIMIT: "1000", FREE_POOL_RESERVE: "0" }).usable, 1000);
  assert.equal(poolConfig({ FREE_POOL_DAILY_LIMIT: "junk" }).dailyLimit, 50, "an unreadable value falls back to the safe default");
  assert.equal(poolConfig({ FREE_POOL_DAILY_LIMIT: "-5" }).dailyLimit, 50);
  assert.equal(poolConfig({ FREE_POOL_DAILY_LIMIT: "1" }).usable, 1);
});

test("token bucket: 20 requests at once, the 21st waits ~3 s; it refills with time and never above capacity", () => {
  const b = new TokenBucket(20, 20, 0);
  for (let i = 0; i < 20; i++) assert.equal(b.take(0).ok, true);
  const no = b.take(0);
  assert.equal(no.ok, false);
  assert.equal(!no.ok && no.retryAfterMs, 3000);
  assert.equal(b.take(2999).ok, false);
  assert.equal(b.take(3003).ok, true);
  assert.ok(b.left(10 * 60_000) <= 20);
});

test("levels: normal below half the day, tight at half, low at 80%, exhausted at the limit; per-minute pressure counts too", () => {
  assert.equal(levelFor(0, 47, 20, 20), "normal");
  assert.equal(levelFor(23, 47, 20, 20), "normal");
  assert.equal(levelFor(24, 47, 20, 20), "tight");
  assert.equal(levelFor(38, 47, 20, 20), "low");
  assert.equal(levelFor(47, 47, 20, 20), "exhausted");
  assert.equal(levelFor(0, 47, 7, 20), "tight");
  assert.equal(levelFor(0, 47, 2, 20), "low");
  assert.equal(levelFor(0, 47, 0, 20), "exhausted");
});

test("governor: admits exactly the day budget, then refuses with the time to the 00:00 UTC reset; a new UTC day starts fresh", async () => {
  const { t, io } = fakeIo();
  const g = new PoolGovernor({ dailyLimit: 10, reserve: 0, usable: 10, rpm: 1000 }, io);
  for (let i = 0; i < 10; i++) assert.equal((await g.admit()).ok, true, `request ${i + 1}`);
  const no = await g.admit();
  assert.equal(no.ok, false);
  assert.ok(!no.ok && no.reason === "day" && no.retryAfterSec === 12 * 3600);
  assert.equal(g.level(), "exhausted");
  t.now = Date.parse("2026-10-05T00:00:05Z");
  assert.equal((await g.admit()).ok, true);
});

test("governor: 20 requests per minute across the whole app (shared counter), the 21st is refused with a retry-after under a minute", async () => {
  const { t, io } = fakeIo();
  // two instances share the table but each has its own bucket: the shared per-minute count is what holds the line
  const a = new PoolGovernor({ dailyLimit: 1000, reserve: 0, usable: 1000, rpm: 20 }, io);
  const b = new PoolGovernor({ dailyLimit: 1000, reserve: 0, usable: 1000, rpm: 20 }, io);
  let ok = 0;
  for (let i = 0; i < 10; i++) { if ((await a.admit()).ok) ok++; if ((await b.admit()).ok) ok++; }
  assert.equal(ok, 20);
  const no = await b.admit();
  assert.ok(!no.ok && no.reason === "minute" && no.retryAfterSec >= 1 && no.retryAfterSec <= 60);
  t.now += 61_000;
  assert.equal((await a.admit()).ok, true, "the next minute is open again");
});

test("governor: a refused request does not use up a day count", async () => {
  const { io, table } = fakeIo();
  const g = new PoolGovernor({ dailyLimit: 100, reserve: 0, usable: 100, rpm: 2 }, io);
  await g.admit(); await g.admit();
  const before = [...table.entries()].filter(([k]) => k.startsWith("pool:openrouter-free|")).map(([, v]) => v)[0];
  assert.equal((await g.admit()).ok, false);
  const after = [...table.entries()].filter(([k]) => k.startsWith("pool:openrouter-free|")).map(([, v]) => v)[0];
  assert.equal(after, before);
});

test("staged degradation: stand-ins stop at half the day, fallbacks shrink then stop, single-model answers when low, busy when empty", async () => {
  const { io } = fakeIo();
  const g = new PoolGovernor({ dailyLimit: 100, reserve: 0, usable: 100, rpm: 1000 }, io);
  assert.equal((await g.planFor()).mode, "full");
  assert.equal(g.hedgesAllowed(), true);
  assert.equal(g.maxFallbacks(), 2);
  for (let i = 0; i < 50; i++) await g.admit();
  assert.equal((await g.planFor()).mode, "full");
  assert.equal(g.hedgesAllowed(), false, "no stand-in requests from half the day");
  assert.equal(g.maxFallbacks(), 1);
  for (let i = 0; i < 30; i++) await g.admit();
  const low = await g.planFor();
  assert.equal(low.mode, "single");
  assert.equal(g.maxFallbacks(), 0, "no fallbacks when low: a 429 does not buy another request");
  for (let i = 0; i < 19; i++) await g.admit();
  assert.equal((await g.planFor()).mode, "single", "one request left still allows one single answer");
  await g.admit();
  const busy = await g.planFor();
  assert.equal(busy.mode, "busy");
  assert.ok(busy.retryAfterSec > 0);
  assert.match(busyMessage(busy.retryAfterSec), /resets at 00:00 UTC/);
  assert.match(busyMessage(30), /try again in 30 seconds/);
  assert.match(busyMessage(120), /about 2 minutes/);
});

test("the day budget is checked for a whole consensus answer: fewer than 3 requests left means a single-model answer", async () => {
  const { io } = fakeIo();
  const g = new PoolGovernor({ dailyLimit: 10, reserve: 0, usable: 10, rpm: 1000 }, io);
  for (let i = 0; i < 4; i++) await g.admit(); // 6 left: still comfortable
  assert.equal((await g.planFor()).mode, "full");
  for (let i = 0; i < 4; i++) await g.admit(); // 2 left
  assert.equal((await g.planFor()).mode, "single");
});

const cls: Classification = { kind: "general", complexity: "moderate", capabilities: [], estimatedInputTokens: 10, estimatedOutputTokens: 10, needsWeb: false, rationale: "t" };

function gateway(outcome: "429" | "ok") {
  const calls: string[] = [];
  const p: Provider = {
    name: "openrouter", live: true, supports: () => true,
    async generate({ model }) {
      calls.push(model.id);
      return outcome === "ok"
        ? { ok: true, modelId: model.id, stance: "unclassified", claims: [], text: "A fine answer to the question.", latencyMs: 1, usage: { inputTokens: 1, outputTokens: 1 }, actualCostUsd: 0 }
        : { ok: false, modelId: model.id, reason: "rate_limited", message: "Rate limited after retries.", latencyMs: 1 };
    },
  };
  return { p, calls };
}

test("registry: over the limit nothing is sent; a 429 when the pool is low does not buy fallback requests", async () => {
  const { io } = fakeIo();
  const roster: ModelSpec[] = freeRoster.slice(0, 5);
  const fallbacks = (m: ModelSpec) => roster.filter((x) => x.id !== m.id);

  // exhausted
  const g = new PoolGovernor({ dailyLimit: 2, reserve: 0, usable: 2, rpm: 100 }, io);
  const ok = gateway("ok");
  const reg = createRegistry([ok.p], { freeOnly: true, pool: g, fallbacks });
  assert.equal((await reg.generate({ model: roster[0], prompt: "q", classification: cls, params: {} })).ok, true);
  assert.equal((await reg.generate({ model: roster[0], prompt: "q", classification: cls, params: {} })).ok, true);
  const refused = await reg.generate({ model: roster[0], prompt: "q", classification: cls, params: {} });
  assert.equal(refused.ok, false);
  assert.equal(ok.calls.length, 2, "the third request was never sent");

  // normal: a 429 may try up to 2 substitutes (3 requests); low: it tries none (1 request)
  const busy1 = gateway("429");
  const g1 = new PoolGovernor({ dailyLimit: 1000, reserve: 0, usable: 1000, rpm: 1000 }, fakeIo().io);
  const r1 = await createRegistry([busy1.p], { freeOnly: true, pool: g1, fallbacks }).generate({ model: roster[0], prompt: "q", classification: cls, params: {} });
  assert.equal(r1.ok, false);
  assert.equal(busy1.calls.length, 3);

  const busy2 = gateway("429");
  const f2 = fakeIo();
  const g2 = new PoolGovernor({ dailyLimit: 100, reserve: 0, usable: 100, rpm: 1000 }, f2.io);
  for (let i = 0; i < 85; i++) await g2.admit();
  const r2 = await createRegistry([busy2.p], { freeOnly: true, pool: g2, fallbacks }).generate({ model: roster[0], prompt: "q", classification: cls, params: {} });
  assert.equal(r2.ok, false);
  assert.equal(busy2.calls.length, 1, "no fallback requests when the pool is low");
  assert.equal(POOL_BUSY_MESSAGE.length > 10, true);
});

test("registry without a pool (paid plans) is unchanged: fallbacks as before", async () => {
  const roster: ModelSpec[] = freeRoster.slice(0, 5);
  const busy = gateway("429");
  const r = await createRegistry([busy.p], { freeOnly: true, fallbacks: (m) => roster.filter((x) => x.id !== m.id) }).generate({ model: roster[0], prompt: "q", classification: cls, params: {} });
  assert.equal(r.ok, false);
  assert.equal(busy.calls.length, 4, "1 + 3 fallbacks");
});

function withPool<T>(vars: Record<string, string>, fn: () => Promise<T>): Promise<T> {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) { prev[k] = process.env[k]; process.env[k] = v; }
  resetSharedPool();
  resetDailyMemory();
  return fn().finally(() => {
    for (const [k, v] of Object.entries(prev)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    resetSharedPool();
    resetDailyMemory();
  });
}

test("engine: however many Free questions arrive, no more requests are sent than the pool budget (never burns the key)", async () => {
  await withPool({ FREE_POOL_DAILY_LIMIT: "7", FREE_POOL_RESERVE: "0", FREE_POOL_RPM: "1000" }, async () => {
    let sent = 0;
    for (let i = 0; i < 5; i++) { const r = await askFree({ panel: "agree" }); sent += r.stats.total; }
    assert.ok(sent <= 7, `sent ${sent} of a budget of 7`);
    assert.ok(sent >= 6, "and the budget is actually used");
  });
});

const post = (headers: Record<string, string> = {}) =>
  keplarPOST(new Request("https://keplar.one/api/keplar", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, ...headers }, body: JSON.stringify({ prompt: QUESTION }) }));

test("/api/keplar Free: full answer, then a single-model answer when the pool runs low, then a friendly busy with Retry-After and nothing sent", async () => {
  await withPool({ FREE_POOL_DAILY_LIMIT: "4", FREE_POOL_RESERVE: "0", FREE_POOL_RPM: "1000", KEPLAR_LIVE_MODELS: "1", OPENROUTER_API_KEY: "sk-or-test" }, async () => {
    const stub = stubOpenRouter({ panel: "agree" });
    try {
      const events = async (res: Response) => (await res.text()).trim().split("\n").map((l) => JSON.parse(l) as { type: string; answer?: { reasoning?: string; consensus: { consulted: number } } });
      const r1 = await post();
      assert.equal(r1.status, 200);
      const e1 = await events(r1);
      assert.equal(e1.find((e) => e.type === "answer")?.answer?.consensus.consulted, 2);
      assert.equal(stub.stats.total, 3);

      const r2 = await post(); // 1 request left: not enough for a consensus answer
      assert.equal(r2.status, 200);
      const a2 = (await events(r2)).find((e) => e.type === "answer");
      assert.ok(a2, "a single-model answer");
      assert.equal(a2!.answer!.consensus.consulted, 1);
      assert.match(a2!.answer!.reasoning ?? "", /Free capacity is limited right now, so one model answered instead of two/);
      assert.equal(stub.stats.total, 4);

      const r3 = await post(); // nothing left
      assert.equal(r3.status, 503);
      const j = (await r3.json()) as { code: string; error: string; retryAfterSec: number };
      assert.equal(j.code, "free_busy");
      assert.match(j.error, /busy|capacity/i);
      assert.ok(Number(r3.headers.get("retry-after")) >= 1);
      assert.equal(stub.stats.total, 4, "the refused question sent nothing");
    } finally {
      stub.restore();
    }
  });
});

/* ── per-person provider-request budget ── */
import { callKey, callRoom, claimUserCall, releaseUserCall, CALL_CAP_MESSAGE } from "@/lib/usage/call-budget";
import { newScope, runInCostScope } from "@/lib/ops/request-cost";
import { PLAN_LIMITS } from "@/lib/orchestration/limits";
import { newDeviceId } from "@/lib/usage/daily";

test("per-person request budget: Free is limited to 150 provider requests a day, other plans have none; counted in the same daily table, no text", async () => {
  assert.equal(PLAN_LIMITS.free.dailyProviderCalls, 150);
  for (const p of ["lite", "plus", "pro", "business"] as const) assert.equal(PLAN_LIMITS[p].dailyProviderCalls, null);
  const scope = newScope();
  scope.callBudget = { key: callKey("acct:test-budget"), limit: 3 };
  await runInCostScope(scope, async () => {
    assert.equal(await claimUserCall(), "claimed");
    assert.equal(await claimUserCall(), "claimed");
    await releaseUserCall();
    assert.equal(await claimUserCall(), "claimed");
    assert.equal(await claimUserCall(), "claimed");
    assert.equal(await claimUserCall(), "capped");
  });
  assert.deepEqual(await callRoom("acct:test-budget", 3), { used: 3, limit: 3, left: 0 });
  assert.equal(await claimUserCall(), "none", "outside a request there is no budget");
});

test("registry: a person out of requests sends nothing and does not use the shared pool; a pool refusal gives the person's count back", async () => {
  const roster: ModelSpec[] = freeRoster.slice(0, 5);
  const { io } = fakeIo();
  const g = new PoolGovernor({ dailyLimit: 100, reserve: 0, usable: 100, rpm: 1000 }, io);
  const gw = gateway("ok");
  const reg = createRegistry([gw.p], { freeOnly: true, pool: g, fallbacks: (m) => roster.filter((x) => x.id !== m.id) });
  const scope = newScope();
  scope.callBudget = { key: callKey("acct:reg-budget"), limit: 2 };
  const out = await runInCostScope(scope, async () => {
    const a = await reg.generate({ model: roster[0], prompt: "q", classification: cls, params: {} });
    const b = await reg.generate({ model: roster[0], prompt: "q", classification: cls, params: {} });
    const c = await reg.generate({ model: roster[0], prompt: "q", classification: cls, params: {} });
    return [a, b, c];
  });
  assert.deepEqual(out.map((r) => r.ok), [true, true, false]);
  assert.equal(gw.calls.length, 2);
  assert.equal((await g.status()).usedToday, 2, "the refused third request did not touch the shared pool");

  // pool says no: the person keeps their request
  const g2 = new PoolGovernor({ dailyLimit: 1, reserve: 0, usable: 1, rpm: 1000 }, fakeIo().io);
  await g2.admit();
  const scope2 = newScope();
  scope2.callBudget = { key: callKey("acct:reg-budget2"), limit: 5 };
  await runInCostScope(scope2, () => createRegistry([gateway("ok").p], { freeOnly: true, pool: g2 }).generate({ model: roster[0], prompt: "q", classification: cls, params: {} }));
  assert.equal((await callRoom("acct:reg-budget2", 5)).used, 0);
  assert.match(CALL_CAP_MESSAGE, /reset at 00:00 UTC/);
});

test("/api/keplar Free: three heavy people cannot drain the pool; one person is stopped by their own request budget, then told when it resets", async () => {
  await withPool({ FREE_POOL_DAILY_LIMIT: "1000", FREE_POOL_RESERVE: "0", FREE_POOL_RPM: "1000", KEPLAR_LIVE_MODELS: "1", OPENROUTER_API_KEY: "sk-or-test" }, async () => {
    const stub = stubOpenRouter({ panel: "agree" });
    try {
      const dev = newDeviceId();
      const headers = { cookie: `keplar_dev=${dev.setCookie(true).split(";")[0].slice("keplar_dev=".length)}` };
      // pre-spend 148 of the person's 150 requests: 2 left is not enough for a two-model answer
      for (let i = 0; i < 148; i++) await (await import("@/lib/usage/daily")).claimOne(callKey(`dev:${dev.id}`), 150);
      const r1 = await post(headers);
      assert.equal(r1.status, 200);
      const a1 = (await r1.text()).trim().split("\n").map((l) => JSON.parse(l) as { type: string; answer?: { reasoning?: string; consensus: { consulted: number } } }).find((e) => e.type === "answer");
      assert.equal(a1?.answer?.consensus.consulted, 1, "one model answers");
      assert.match(a1?.answer?.reasoning ?? "", /close to today's Free model-request limit/);
      assert.equal(stub.stats.total, 1);
      const left = await callRoom(`dev:${dev.id}`, 150);
      assert.equal(left.used, 149);
      await (await import("@/lib/usage/daily")).claimOne(callKey(`dev:${dev.id}`), 150);
      const r2 = await post(headers);
      assert.equal(r2.status, 429);
      const j = (await r2.json()) as { code: string; error: string };
      assert.equal(j.code, "daily_calls");
      assert.match(j.error, /00:00 UTC/);
      assert.ok(Number(r2.headers.get("retry-after")) > 0);
      assert.equal(stub.stats.total, 1, "nothing was sent for the refused question");
      // the refused question did not burn one of the person's 50 questions
      const { usedToday } = await import("@/lib/usage/daily");
      assert.equal(await usedToday(`dev:${dev.id}`), 1);
    } finally {
      stub.restore();
    }
  });
});

test("quota: OpenRouter's GET /key report is read as the day budget (free_model_daily_requests.limit), odd values are ignored", async () => {
  const { quotaFromKeyInfo } = await import("@/lib/orchestration/pool-governor");
  assert.equal(quotaFromKeyInfo({ data: { is_free_tier: false, free_model_daily_requests: { used: 47, limit: 1000, remaining: 953 } } }), 1000);
  assert.equal(quotaFromKeyInfo({ free_model_daily_requests: { limit: 50 } }), 50);
  assert.equal(quotaFromKeyInfo({ data: {} }), null);
  assert.equal(quotaFromKeyInfo({ data: { free_model_daily_requests: { limit: "1000" } } }), null);
  assert.equal(quotaFromKeyInfo({ data: { free_model_daily_requests: { limit: 0 } } }), null);
  assert.equal(quotaFromKeyInfo(null), null);
});

test("quota: a 1000/day key is not held at the 50/day default (live 2026-10-05: Free said 'at capacity for today' after 47 requests)", async () => {
  const { t, io } = fakeIo();
  let asked = 0;
  const g = new PoolGovernor(poolConfig({}), { ...io, quota: async () => (asked++, 1000) });
  for (let i = 0; i < 47; i++) { assert.equal((await g.admit()).ok, true); t.now += 3_100; }
  assert.equal(asked, 1, "asked once, before the first request");
  assert.equal(g.cfg.usable, 950);
  const plan = await g.planFor();
  assert.equal(plan.mode, "full", "47 of 950 used is still a normal day");
  assert.equal(plan.status.remainingToday, 903);
  t.now += 11 * 60_000;
  await g.status();
  assert.equal(asked, 2, "refreshed after 10 minutes");
});

test("quota: a failed report keeps the safe 50/day budget and only the first attempt waits; an explicit FREE_POOL_DAILY_LIMIT is never overridden", async () => {
  const { t, io } = fakeIo();
  let asked = 0;
  const g = new PoolGovernor(poolConfig({}), { ...io, quota: async () => { asked++; throw new Error("down"); } });
  await g.status();
  assert.equal(g.cfg.usable, 47);
  await g.status();
  assert.equal(asked, 1, "no retry inside the minute");
  t.now += 61_000;
  let resolve!: (n: number) => void;
  const slow = new Promise<number>((r) => (resolve = r));
  const g2 = new PoolGovernor(poolConfig({}), { ...io, quota: () => slow });
  const firstCall = g2.status();
  resolve(50);
  await firstCall;
  assert.equal(g2.cfg.usable, 47, "a 50/day key stays at 50");
  let askedFixed = 0;
  const fixed = new PoolGovernor(poolConfig({ FREE_POOL_DAILY_LIMIT: "200" }), { ...io, quota: async () => (askedFixed++, 1000) }, true);
  await fixed.status();
  assert.equal(askedFixed, 0);
  assert.equal(fixed.cfg.dailyLimit, 200);
});

test("quota: a background refresh never makes a question wait", async () => {
  const { t, io } = fakeIo();
  let calls = 0;
  let hang!: () => void;
  const g = new PoolGovernor(poolConfig({}), { ...io, quota: () => (++calls === 1 ? Promise.resolve(1000) : new Promise<number>((r) => (hang = () => r(1000)))) });
  await g.status();
  t.now += 11 * 60_000;
  const done = await Promise.race([g.planFor().then(() => "answered"), new Promise((r) => setTimeout(() => r("waited"), 200))]);
  assert.equal(done, "answered");
  assert.equal(calls, 2);
  hang();
});
