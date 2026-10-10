import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyFanout, beginRun, fanoutPolicy, loadInflight, loadThresholds } from "@/lib/orchestration/fanout";
import { PLAN_LIMITS, limitsFor } from "@/lib/orchestration/limits";
import { bumpFanout, fanoutUsedToday } from "@/lib/usage/fanout-day";
import { newScope, noteModelCall, enterCostScope, recordRequestCost, recentRequestCosts, summarizeCosts, type RequestCostRow } from "@/lib/ops/request-cost";
import { recordModelCall } from "@/lib/ops/telemetry";
import { FREE_MAX_PANEL } from "@/lib/orchestration/router";
import { freeRoster } from "@/lib/orchestration/live-catalog";
import { isFreeModel } from "@/lib/orchestration/free-guard";

test("every plan has a daily full-panel cap, and higher plans have higher caps", () => {
  const caps = (["free", "lite", "plus", "pro", "business"] as const).map((p) => limitsFor(p).dailyFanoutRuns);
  assert.ok(caps.every((n) => n > 0));
  assert.ok(caps[1] < caps[2] && caps[2] < caps[3] && caps[3] < caps[4]);
  assert.ok(PLAN_LIMITS.lite.dailyFanoutRuns <= PLAN_LIMITS.lite.dailyRequests, "a cap above the question limit would never bind");
});

test("policy: under the daily cap nothing changes; at the cap a paid plan drops to 2 models (fast); admin and Free are not capped by it", () => {
  assert.deepEqual(fanoutPolicy({ plan: "plus", usedToday: 10, loadInflight: 0 }), { maxModels: null, fast: false, reason: null });
  assert.deepEqual(fanoutPolicy({ plan: "plus", usedToday: PLAN_LIMITS.plus.dailyFanoutRuns, loadInflight: 0 }), { maxModels: 2, fast: true, reason: "daily_fanout" });
  assert.equal(fanoutPolicy({ plan: "plus", usedToday: 9999, loadInflight: 0, admin: true }).reason, null);
  assert.equal(fanoutPolicy({ plan: "free", usedToday: 9999, loadInflight: 0 }).reason, null);
});

test("policy: load shedding (high -> 2 models, critical -> 1), even for admin, thresholds from env", () => {
  const t = loadThresholds({});
  assert.equal(fanoutPolicy({ plan: "pro", usedToday: 0, loadInflight: t.high }).maxModels, 2);
  assert.equal(fanoutPolicy({ plan: "pro", usedToday: 0, loadInflight: t.critical }).maxModels, 1);
  assert.equal(fanoutPolicy({ plan: "pro", usedToday: 0, loadInflight: 5, env: { KEPLAR_LOAD_HIGH: "5" } }).reason, "load");
});

test("applyFanout keeps the person's stricter limit and only ever lowers the model count", () => {
  assert.deepEqual(applyFanout({ maxModels: 1 }, { maxModels: 2, fast: true, reason: "load" })?.maxModels, 1);
  assert.equal(applyFanout({ maxModels: 5 }, { maxModels: 2, fast: true, reason: "load" })?.maxModels, 2);
  assert.equal(applyFanout(undefined, { maxModels: 2, fast: true, reason: "load" })?.strategy, "fast");
  const r = { maxModels: 4 };
  assert.equal(applyFanout(r, { maxModels: null, fast: false, reason: null }), r);
});

test("load counter: beginRun/end is balanced and idempotent", () => {
  const base = loadInflight();
  const a = beginRun(), b = beginRun();
  assert.equal(loadInflight(), base + 2);
  a(); a();
  assert.equal(loadInflight(), base + 1);
  b();
  assert.equal(loadInflight(), base);
});

test("daily fan-out counter increments per account and day", async () => {
  const ws = `ws_fan_${Math.random().toString(36).slice(2, 8)}`;
  assert.equal(await fanoutUsedToday(ws), 0);
  await bumpFanout(ws); await bumpFanout(ws); await bumpFanout(ws);
  assert.equal(await fanoutUsedToday(ws), 3);
  assert.equal(await fanoutUsedToday(`${ws}_other`), 0);
});

test("per-request cost: provider calls made in the scope are summed; calls outside it are not attributed", async () => {
  noteModelCall({ model: "x", ok: true, usd: 9 }); // no scope: ignored
  const scope = newScope();
  await new Promise<void>((resolve) => {
    setImmediate(() => {
      enterCostScope(scope);
      setTimeout(() => {
        recordModelCall({ model: "m/a", vendor: "a", provider: "openrouter", ok: true, reason: "ok", latencyMs: 100, usd: 0.012 });
        recordModelCall({ model: "m/b", vendor: "b", provider: "openrouter", ok: false, reason: "timeout", latencyMs: 5000, usd: 0 });
        recordModelCall({ model: "m/a", vendor: "a", provider: "openrouter", ok: true, reason: "ok", latencyMs: 90, usd: 0.003 });
        resolve();
      }, 5);
    });
  });
  assert.equal(scope.calls, 3);
  assert.equal(scope.failed, 1);
  assert.equal(scope.models.size, 2);
  assert.ok(Math.abs(scope.usd - 0.015) < 1e-9);
  recordRequestCost(scope, { reqId: "req_test0000001", plan: "plus", accountId: "ws_x", kind: "answer", units: 9, durationMs: 4200, answered: true, degraded: "daily_fanout", maxModels: 2 });
  let row: RequestCostRow | undefined;
  for (let i = 0; i < 40 && !row; i++) {
    await new Promise((r) => setTimeout(r, 50));
    row = (await recentRequestCosts(1)).find((r) => r.reqId === "req_test0000001");
  }
  assert.ok(row);
  assert.equal(row!.modelCalls, 3);
  assert.equal(row!.distinctModels, 2);
  assert.equal(row!.usd, 0.015);
  assert.ok(!("prompt" in row!) && !("text" in row!), "no content stored");
});

test("summary: totals, per plan, per day, degraded counts, p95, top", () => {
  const mk = (o: Partial<RequestCostRow>): RequestCostRow => ({ id: "rc" + Math.random(), workspaceId: "system", at: "2026-10-04T10:00:00.000Z", reqId: "r", plan: "plus", accountId: null, kind: "answer", modelCalls: 3, failedCalls: 0, distinctModels: 3, usd: 0.01, units: 5, durationMs: 1000, answered: true, degraded: null, maxModels: null, ...o });
  const s = summarizeCosts([mk({ usd: 0.02 }), mk({ usd: 0.04, degraded: "load" }), mk({ plan: "free", usd: 0, units: 0, at: "2026-10-03T09:00:00.000Z" }), mk({ answered: false, usd: 0.01, degraded: "daily_fanout" })]);
  assert.equal(s.requests, 4);
  assert.equal(s.answered, 3);
  assert.ok(Math.abs(s.usd - 0.07) < 1e-9);
  assert.deepEqual(s.degraded, { load: 1, daily_fanout: 1 });
  assert.equal(s.byPlan[0].plan, "plus");
  assert.equal(s.byDay.length, 2);
  assert.equal(s.top[0].usd, 0.04);
  assert.deepEqual(summarizeCosts([]).byPlan, []);
});

test("Free plan only ever uses $0 :free models, and its panel is capped", () => {
  assert.ok(freeRoster.length >= 5);
  for (const m of freeRoster) { assert.ok(isFreeModel(m), `${m.id} must be free`); assert.match(m.routes!.openrouter!, /:free$/); }
  assert.ok(FREE_MAX_PANEL >= 1 && FREE_MAX_PANEL <= 3, `free panel cap ${FREE_MAX_PANEL}`);
});

import { POST as keplarPOST } from "@/app/api/keplar/route";

test("route: a live (stubbed) request writes one cost row with its real provider calls and cost, and no prompt text", async () => {
  const realFetch = globalThis.fetch;
  process.env.KEPLAR_LIVE_MODELS = "1";
  process.env.OPENROUTER_API_KEY = "sk-or-test";
  process.env.OPENROUTER_FREE_API_KEY = "sk-or-free-test";
  globalThis.fetch = (async (_u: string | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { model: string };
    return new Response(JSON.stringify({ model: body.model, choices: [{ message: { content: "That sounds like a lot, and I'm sorry. Start with the weakest topic for an hour, then sleep; a rested brain recalls more." }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.004 } }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const before = new Date().toISOString();
    const res = await keplarPOST(new Request("https://keplar.one/api/keplar", { method: "POST", headers: { "content-type": "application/json", origin: "https://keplar.one", "x-forwarded-for": "10.99.7.7", "x-request-id": "req_costrouteabc1234" }, body: JSON.stringify({ prompt: "I'm so stressed, my exam is tomorrow and I haven't studied", history: [] }) }));
    await res.text();
    let rows: RequestCostRow[] = [];
    for (let i = 0; i < 40 && !rows.length; i++) {
      await new Promise((r) => setTimeout(r, 50));
      rows = (await recentRequestCosts(1)).filter((r) => r.at >= before && r.reqId === "req_costrouteabc1234");
    }
    assert.equal(rows.length, 1);
    assert.equal(rows[0].plan, "free");
    assert.ok(rows[0].modelCalls >= 2, `model calls ${rows[0].modelCalls}`);
    assert.equal(rows[0].answered, true);
    assert.equal(rows[0].units, 0, "Free is never charged credits");
    assert.ok(!JSON.stringify(rows[0]).includes("stressed"), "no prompt text in the log");
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.KEPLAR_LIVE_MODELS;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_FREE_API_KEY;
  }
});
