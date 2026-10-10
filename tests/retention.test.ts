import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { collection } from "@/lib/create/platform/store";
import { hourOfId, pruneTelemetry, retentionDays } from "@/lib/ops/retention";
import { effectiveLimits, hourlyBlock, hourlyBlockFor, hourlyLimits, recordHourly } from "@/lib/ops/hourly";
import { opsControls, resetOpsCache, sanitizeHourly, setControls } from "@/lib/ops/controls";
import { HttpError } from "@/lib/create/platform/http";

const DAY = 864e5;
const iso = (ago: number) => new Date(Date.now() - ago).toISOString();
const mk = <T extends { id: string; workspaceId: string }>(name: string) => collection<T>(name);

async function seed() {
  const calls = mk<{ id: string; workspaceId: string; at: string }>("model_calls");
  await calls.insert({ id: "old1", workspaceId: "system", at: iso(20 * DAY) });
  await calls.insert({ id: "old2", workspaceId: "system", at: iso(15 * DAY) });
  await calls.insert({ id: "new1", workspaceId: "system", at: iso(2 * DAY) });
  await calls.insert({ id: "now1", workspaceId: "system", at: iso(0) });
  const min = mk<{ id: string; workspaceId: string; m: string }>("system_spend_minute");
  await min.insert({ id: "a", workspaceId: "system", m: iso(10 * DAY).slice(0, 16) });
  await min.insert({ id: "b", workspaceId: "system", m: iso(60_000).slice(0, 16) });
  const h = mk<{ id: string; workspaceId: string; usd: number; calls: number }>("system_hourly_use");
  await h.insert({ id: `p:openrouter:${iso(9 * DAY).slice(0, 13)}`, workspaceId: "system", usd: 1, calls: 1 });
  await h.insert({ id: `m:some/model:${iso(0).slice(0, 13)}`, workspaceId: "system", usd: 1, calls: 1 });
  // an unrelated tenant row in another collection must never be touched
  await mk<{ id: string; workspaceId: string; at: string }>("keep_me").insert({ id: "k", workspaceId: "ws1", at: iso(400 * DAY) });
}

async function check() {
  const ids = async (n: string) => (await collection<{ id: string; workspaceId: string }>(n).listSystem()).map((r) => r.id).sort();
  assert.deepEqual(await ids("model_calls"), ["new1", "now1"]);
  assert.deepEqual(await ids("system_spend_minute"), ["b"]);
  assert.equal((await ids("system_hourly_use")).length, 1);
  assert.deepEqual(await ids("keep_me"), ["k"]);
}

test("retention: prunes old model_calls / minute / hour rows, keeps recent and unrelated rows (file store)", async () => {
  await seed();
  const r = await pruneTelemetry();
  assert.deepEqual(r, { model_calls: 2, system_spend_minute: 1, system_hourly_use: 1 });
  await check();
  assert.deepEqual(await pruneTelemetry(), { model_calls: 0, system_spend_minute: 0, system_hourly_use: 0 }); // idempotent
});

test("retention: batch limit bounds one run; rows without the field are never deleted", async () => {
  const c = mk<{ id: string; workspaceId: string; at?: string }>("model_calls");
  for (let i = 0; i < 5; i++) await c.insert({ id: `b${i}`, workspaceId: "system", at: iso(30 * DAY) });
  await c.insert({ id: "nofield", workspaceId: "system" });
  assert.equal((await pruneTelemetry(Date.now(), 3)).model_calls, 3);
  assert.equal((await pruneTelemetry(Date.now(), 3)).model_calls, 2);
  assert.ok(await c.get("system", "nofield"));
});

test("retention: env overrides, hourOfId parsing", () => {
  assert.deepEqual(retentionDays({ KEPLAR_RETAIN_MODEL_CALLS_DAYS: "30", KEPLAR_RETAIN_HOURLY_USE_DAYS: "0", KEPLAR_RETAIN_SPEND_MINUTE_DAYS: "x" }), { modelCalls: 30, spendMinute: 3, hourlyUse: 3 });
  assert.equal(hourOfId("m:vendor/model:v1:2026-10-02T16"), "2026-10-02T16");
  assert.equal(hourOfId("junk"), null);
});

/* ── admin-edited hourly limits ─────────────────────────────────────── */

test("hourly: admin edits override env defaults, merge per id, and are enforced", async () => {
  resetOpsCache();
  const base = hourlyLimits({ KEPLAR_PROVIDER_HOURLY_USD: "15" });
  const eff = effectiveLimits(base, { modelUsd: 1, overrides: { "some/model": { calls: 5 } } });
  assert.equal(eff.providerUsd, 15);
  assert.equal(eff.modelUsd, 1);
  assert.match(hourlyBlock(eff, "p", "some/model", { provider: { usd: 0, calls: 0 }, model: { usd: 0, calls: 5 } }) ?? "", /request limit/);
  assert.equal(hourlyBlock(eff, "p", "other", { provider: { usd: 0, calls: 0 }, model: { usd: 0.5, calls: 100 } }), null);

  await setControls({ hourly: { modelCalls: 2 } }, "admin@example.com");
  resetOpsCache();
  assert.equal((await opsControls()).hourly?.modelCalls, 2);
  const model = `edited/model-${Math.random().toString(36).slice(2)}`;
  assert.equal(await hourlyBlockFor("prov-x", model), null);
  recordHourly("prov-x", model, 0.01);
  recordHourly("prov-x", model, 0.01);
  assert.match((await hourlyBlockFor("prov-x", model)) ?? "", /Hourly request limit for this model reached \(2\/hour\)/);
  await setControls({ hourly: {} }, "admin@example.com"); // back to defaults
  resetOpsCache();
  assert.equal(await hourlyBlockFor("prov-x", model), null);
});

test("hourly: sanitizeHourly rejects junk and clamps nothing silently", () => {
  assert.deepEqual(sanitizeHourly(null), {});
  assert.deepEqual(sanitizeHourly({ providerUsd: "12.5", modelCalls: 40, overrides: { "OpenRouter ": { usd: 3 } } }), { providerUsd: 12.5, modelCalls: 40, overrides: { openrouter: { usd: 3 } } });
  for (const bad of [{ providerUsd: -1 }, { modelUsd: "abc" }, { modelCalls: 1.5 }, { providerUsd: 1e9 }, { overrides: { "bad name!": { usd: 1 } } }, { overrides: [] }, [], "x"]) {
    assert.throws(() => sanitizeHourly(bad), (e) => e instanceof HttpError && e.status === 400, JSON.stringify(bad));
  }
});
