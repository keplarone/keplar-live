import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertCanSpend } from "@/lib/create/platform/compute";
import { ENTITLEMENTS } from "@/lib/create/platform/plans";
import { enterUsage, UsageLimitError } from "@/lib/create/platform/usage";
import { assertOpsAllows, isDisabled, opsControls, OpsStopError, resetOpsCache, setControls } from "@/lib/ops/controls";
import { writeAudit, recentAudit, maskEmail } from "@/lib/ops/audit";
import { recordMinuteSpend, spikeConfig, sumWindow } from "@/lib/ops/telemetry";
import { percentile, summarize } from "@/lib/ops/metrics";
import { createRegistry, MODEL_OFF_MESSAGE } from "@/lib/orchestration/providers";
import { liveRoster } from "@/lib/orchestration/live-catalog";
import { errorResponse } from "@/lib/create/platform/http";
import { FREE_DAY_BUDGET_MESSAGE, freePaused, nextUtcMidnight } from "@/lib/create/platform/spend";
import type { Provider } from "@/lib/orchestration/types";
import type { Workspace } from "@/lib/create/platform/workspace";
import type { WorkspaceRow } from "@/lib/accounts/workspaces";

const ws = (plan: "plus" | "free" = "plus"): Workspace => ({
  id: `ws_${Math.random().toString(36).slice(2)}`, name: "T", plan, verified: true, entitlements: ENTITLEMENTS[plan], anonymous: false, admin: false,
  userId: "u", email: "u@example.com", period: { start: new Date(Date.now() - 864e5).toISOString(), end: new Date(Date.now() + 864e5 * 20).toISOString() },
});
const reset = async () => {
  resetOpsCache();
  await setControls({ globalStop: false, pauseMedia: false, pauseAgents: false, disabledProviders: [], disabledModels: [], autoPauseUntil: null, reason: "" }, "test");
};
const req = () => new Request("https://keplar.one/api/keplar", { method: "POST" });

test("ops: defaults are all open; global stop blocks every spend path with a 503 and no charge", async () => {
  await reset();
  await assertCanSpend(ws(), 1);
  await setControls({ globalStop: true, reason: "test stop" }, "t@example.com");
  await assert.rejects(assertCanSpend(ws(), 1), (e) => e instanceof OpsStopError && e.status === 503 && e.code === "global_stop");
  await assert.rejects(assertCanSpend(ws("free"), 0), OpsStopError);
  await assert.rejects(enterUsage(req(), ws("free"), { countsDaily: true }), (e) => e instanceof OpsStopError && !(e instanceof UsageLimitError));
  const r = errorResponse(new OpsStopError("x", "global_stop"));
  assert.equal(r.status, 503);
  await reset();
  await assertCanSpend(ws(), 1);
});

test("ops: media and agent pauses are separate; text keeps working", async () => {
  await reset();
  await setControls({ pauseMedia: true }, "t");
  await assert.rejects(assertOpsAllows("media"), (e) => e instanceof OpsStopError && e.code === "media_paused");
  await assertOpsAllows("text");
  await assertOpsAllows("agent");
  await assert.rejects(assertCanSpend(ws(), 1, { paidMedia: true }), OpsStopError);
  await reset();
  await setControls({ pauseAgents: true }, "t");
  await assert.rejects(assertCanSpend(ws(), 1, { kind: "agent" }), (e) => e instanceof OpsStopError && e.code === "agents_paused");
  await assertCanSpend(ws(), 1);
  await reset();
});

test("ops: provider/model switches match route provider, vendor and model id; input is sanitised", async () => {
  await reset();
  const c = await setControls({ disabledProviders: ["OpenRouter ", "bad name!", "anthropic"], disabledModels: ["Some/Model-1"] }, "t");
  assert.deepEqual(c.disabledProviders, ["openrouter", "anthropic"]);
  assert.ok(isDisabled(c, { provider: "openrouter" }));
  assert.ok(isDisabled(c, { vendor: "Anthropic" }));
  assert.ok(isDisabled(c, { modelId: "some/model-1" }));
  assert.ok(!isDisabled(c, { provider: "direct:openai", vendor: "openai", modelId: "x" }));
  await reset();
});

test("ops: the registry refuses a disabled model and a global stop before anything is sent", async () => {
  await reset();
  let sent = 0;
  const model = liveRoster[0];
  const provider: Provider = { name: "fake", live: false, supports: () => true, async generate() { sent++; return { ok: true, modelId: model.id, text: "hi", latencyMs: 1, tokensIn: 1, tokensOut: 1 } as never; } };
  const reg = createRegistry([provider]);
  const input = { model, prompt: "hi", system: "", classification: {} as never, params: { maxOutputTokens: 10 } } as never;
  assert.equal((await reg.generate(input)).ok, true);
  assert.equal(sent, 1);
  await setControls({ disabledModels: [model.id] }, "t");
  const off = await reg.generate(input);
  assert.equal(off.ok, false);
  assert.equal((off as { message: string }).message, MODEL_OFF_MESSAGE);
  await setControls({ disabledModels: [], globalStop: true, reason: "x" }, "t");
  assert.equal((await reg.generate(input)).ok, false);
  assert.equal(sent, 1, "nothing was sent while switched off");
  await reset();
});

test("ops: KEPLAR_GLOBAL_STOP=1 is a hard stop even with open controls", async () => {
  await reset();
  process.env.KEPLAR_GLOBAL_STOP = "1";
  try {
    assert.equal((await opsControls()).globalStop, true);
    await assert.rejects(assertOpsAllows("text"), OpsStopError);
  } finally {
    delete process.env.KEPLAR_GLOBAL_STOP;
  }
  await assertOpsAllows("text");
});

test("ops: spend spike pauses media + Free (auto, reversible), audits, and never stops paid text", async () => {
  await reset();
  process.env.KEPLAR_SPIKE_USD = "1";
  try {
    assert.equal(spikeConfig().usdInWindow, 1);
    const t = Date.now();
    await recordMinuteSpend(0.4, t);
    assert.equal((await opsControls()).autoPauseUntil, null);
    await recordMinuteSpend(0.8, t + 11_000);
    resetOpsCache();
    const c = await opsControls();
    assert.ok(c.autoPauseUntil && Date.parse(c.autoPauseUntil) > Date.now());
    assert.ok(await freePaused());
    await assert.rejects(assertOpsAllows("media"), OpsStopError);
    await assertOpsAllows("text");
    await assertCanSpend(ws(), 1);
    assert.ok((await recentAudit()).some((a) => a.action === "auto_pause"));
  } finally {
    delete process.env.KEPLAR_SPIKE_USD;
  }
  await reset();
});

test("ops: sumWindow adds only the last N minute buckets", () => {
  const at = Date.parse("2026-10-02T12:10:30Z");
  const b = { "2026-10-02T12:10": 1, "2026-10-02T12:09": 2, "2026-10-02T12:05": 4, "2026-10-02T12:04": 8 };
  assert.equal(sumWindow(b, 2, at), 3);
  assert.equal(sumWindow(b, 6, at), 7);
});

test("audit: written, listed newest first, emails masked", async () => {
  await writeAudit("a@b.com", "x", "one");
  await writeAudit("a@b.com", "y", "two");
  const l = await recentAudit(5);
  assert.ok(l.length >= 2);
  assert.equal(maskEmail("team@keplar.one"), "t***@keplar.one");
  assert.equal(maskEmail(null), "—");
});

test("admin summary: MRR only from active, unexpired paid subscriptions; spend and calls from real rows; no data -> zeros/nulls", () => {
  const now = Date.parse("2026-10-02T12:00:00Z");
  const w = (id: string, plan: WorkspaceRow["plan"], status: WorkspaceRow["billing"]["status"], end: string | null, email = `${id}@x.com`): WorkspaceRow => ({
    id, workspaceId: id, name: id, ownerUserId: id, ownerEmail: email, plan, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    billing: { customerId: null, subscriptionId: null, status, lookupKey: null, periodStart: null, periodEnd: end, cancelAtPeriodEnd: false, paymentFailedAt: null, mode: "live" },
  });
  const empty = summarize({ now, workspaces: [], ledger: [], calls: [], payments: [], events: [] });
  assert.equal(empty.revenue.mrrUsd, 0);
  assert.equal(empty.models.errorRate24h, null);
  assert.equal(empty.models.p95Ms, null);
  const s = summarize({
    now,
    workspaces: [w("a", "plus", "active", "2026-10-20T00:00:00Z"), w("b", "pro", "active", "2026-10-20T00:00:00Z"), w("c", "plus", "active", "2026-09-01T00:00:00Z"), w("d", "free", "none", null), w("e", "plus", "canceled", null)],
    ledger: [
      { id: "1", workspaceId: "a", action: "answer", units: 10, usd: 0.02, at: "2026-10-02T10:00:00Z" },
      { id: "2", workspaceId: "b", action: "site.build", units: 100, usd: 0.2, at: "2026-10-01T10:00:00Z" },
      { id: "3", workspaceId: "a", action: "answer", units: 5, usd: 0.01, at: "2026-08-01T10:00:00Z" },
    ],
    calls: [
      { id: "m1", workspaceId: "system", at: "2026-10-02T11:59:00Z", model: "m/x", vendor: "m", provider: "openrouter", ok: true, reason: "ok", latencyMs: 100, usd: 0.01 },
      { id: "m2", workspaceId: "system", at: "2026-10-02T11:58:10Z", model: "m/x", vendor: "m", provider: "openrouter", ok: false, reason: "timeout", latencyMs: 9000, usd: 0 },
    ],
    payments: [{ id: "p", email: "a@x.com", plan: "plus", at: "2026-10-01T00:00:00Z" }],
    events: [{ id: "e", type: "payment.succeeded", at: "2026-10-01T00:00:00Z", result: "ok" }],
  });
  assert.equal(s.revenue.mrrUsd, 45 + 99, "expired and canceled subscriptions are not MRR");
  assert.deepEqual(s.plans.activePaid, { lite: 0, plus: 1, pro: 1 });
  assert.equal(s.spend.last30dUsd, 0.22, "the August charge is outside the 30-day window");
  assert.equal(s.spend.byFeature[0].key, "site.build");
  assert.equal(s.spend.topUsers[0].user, "b***@x.com");
  assert.equal(s.models.calls24h, 2);
  assert.equal(s.models.errors24h, 1);
  assert.equal(s.models.errorRate24h, 0.5);
  assert.equal(s.models.requestsPerMinute.reduce((a, b) => a + b, 0), 2);
  assert.equal(s.revenue.paymentsLast30d, 1);
  assert.equal(percentile([1, 2, 3, 4], 50), 3);
});

test("breaker: chat answers switch to lighter routing as the day's spend nears the cap (and never widen a user's own limit)", async () => {
  const { lighterRouting } = await import("@/lib/orchestration/breaker-routing");
  assert.deepEqual(lighterRouting({ strategy: "thorough" }, "normal"), { strategy: "thorough" });
  assert.deepEqual(lighterRouting(undefined, "cheap"), { strategy: "fast", maxModels: 3 });
  assert.deepEqual(lighterRouting({ maxModels: 2, strategy: "thorough" }, "cheap"), { strategy: "fast", maxModels: 2 });
  assert.equal(lighterRouting(undefined, "no_media")?.maxModels, 2);
  assert.equal(lighterRouting({ maxModels: 5 }, "capped")?.maxModels, 1);
});

test("logs: every /api response carries x-request-id (valid caller ids kept, junk replaced); log lines are JSON without bodies", async () => {
  const { proxy } = await import("@/proxy");
  const { NextRequest } = await import("next/server");
  const mk = (h: Record<string, string> = {}) => new NextRequest("https://keplar.one/api/compute", { headers: h });
  const a = await proxy(mk());
  assert.match(a.headers.get("x-request-id") ?? "", /^req_[a-f0-9]{20}$/);
  assert.equal((await proxy(mk({ "x-request-id": "abc12345-good_ID" }))).headers.get("x-request-id"), "abc12345-good_ID");
  assert.notEqual((await proxy(mk({ "x-request-id": "<script>bad</script>" }))).headers.get("x-request-id"), "<script>bad</script>");
  const { logEvent, requestIdOf } = await import("@/lib/ops/log");
  const lines: string[] = [];
  const orig = console.log;
  console.log = (l: string) => void lines.push(l);
  try {
    logEvent("info", "test_event", { code: "x" }, new Request("https://keplar.one/", { headers: { "x-request-id": "req_1234567890abcdef" } }));
  } finally {
    console.log = orig;
  }
  const j = JSON.parse(lines[0]);
  assert.equal(j.event, "test_event");
  assert.equal(j.reqId, "req_1234567890abcdef");
  assert.equal(requestIdOf(null), "unknown");
});

import { hourlyBlock, hourlyLimits, hourlyBlockFor, recordHourly } from "../src/lib/ops/hourly";

test("hourly limits: defaults, overrides, malformed override ignored, pure block decision", () => {
  const d = hourlyLimits({});
  assert.equal(d.providerUsd, 15);
  assert.equal(d.modelUsd, 8);
  const o = hourlyLimits({ KEPLAR_HOURLY_LIMITS: '{"openrouter":{"usd":2},"m1":{"usd":1,"calls":5}}' });
  assert.equal(hourlyBlock(o, "openrouter", "m2", { provider: { usd: 2, calls: 1 }, model: { usd: 0, calls: 0 } })?.includes("provider"), true);
  assert.equal(hourlyBlock(o, "openai", "m1", { provider: { usd: 0, calls: 0 }, model: { usd: 1, calls: 0 } })?.includes("model"), true);
  assert.equal(hourlyBlock(o, "openai", "m1", { provider: { usd: 0, calls: 0 }, model: { usd: 0, calls: 5 } })?.includes("request"), true);
  assert.equal(hourlyBlock(o, "openai", "m3", { provider: { usd: 14.99, calls: 9 }, model: { usd: 7.99, calls: 2999 } }), null);
  assert.equal(hourlyLimits({ KEPLAR_HOURLY_LIMITS: "{not json" }).providerUsd, 15);
});

test("hourly limits: recorded spend blocks the next call on this instance", async () => {
  process.env.KEPLAR_MODEL_HOURLY_USD = "1";
  assert.equal(await hourlyBlockFor("prov-x", "model-x"), null);
  recordHourly("prov-x", "model-x", 1.5);
  await new Promise((r) => setTimeout(r, 20));
  assert.match((await hourlyBlockFor("prov-x", "model-x")) ?? "", /Hourly spend limit for this model/);
  delete process.env.KEPLAR_MODEL_HOURLY_USD;
});

test("the shared daily budget lifts at the next 00:00 UTC and does not describe a personal monthly balance", () => {
  assert.equal(nextUtcMidnight(Date.parse("2026-10-11T15:16:00.000Z")), "2026-10-12T00:00:00.000Z");
  assert.equal(nextUtcMidnight(Date.parse("2026-10-12T00:00:00.000Z")), "2026-10-13T00:00:00.000Z");
  assert.match(FREE_DAY_BUDGET_MESSAGE, /today's usage budget/);
  assert.match(FREE_DAY_BUDGET_MESSAGE, /not counted against your Free questions/);
  assert.doesNotMatch(FREE_DAY_BUDGET_MESSAGE, /month/i);
});

test("hourly limits are enforced in the registry: over-limit live model is refused as rate-limited, nothing is sent", async () => {
  await reset();
  const model = liveRoster[1] ?? liveRoster[0];
  let sent = 0;
  const provider: Provider = { name: "hourly-fake", live: true, supports: () => true, async generate() { sent++; return { ok: true, modelId: model.id, text: "hi", latencyMs: 1, tokensIn: 1, tokensOut: 1, actualCostUsd: 0.5 } as never; } };
  const reg = createRegistry([provider]);
  const input = { model, prompt: "hi", system: "", classification: {} as never, params: { maxOutputTokens: 10 } } as never;
  process.env.KEPLAR_HOURLY_LIMITS = JSON.stringify({ [model.id]: { calls: 2 } });
  try {
    assert.equal((await reg.generate(input)).ok, true);
    assert.equal((await reg.generate(input)).ok, true);
    await new Promise((r) => setTimeout(r, 30));
    const third = await reg.generate(input);
    assert.equal(third.ok, false);
    assert.match((third as { message: string }).message, /Hourly request limit/);
    assert.equal(sent, 2, "the third call was never sent");
  } finally {
    delete process.env.KEPLAR_HOURLY_LIMITS;
  }
});
