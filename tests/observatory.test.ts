import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DRIFT, detectDrift, featureCards, modelStats, runObservatory } from "@/lib/ops/observatory";
import { CRON_JOBS } from "@/lib/ops/health";
import { collection } from "@/lib/create/platform/store";
import { GET as observatoryCron } from "@/app/api/cron/observatory/route";
import type { ModelCallRow } from "@/lib/ops/telemetry";

const call = (model: string, ok: boolean, latencyMs: number, reason = ok ? "ok" : "error", usd = 0.001) => ({ model, ok, reason, latencyMs, usd });

test("model stats: success, timeouts and rate limits per model; latency from successful calls only; cost per success", () => {
  const [m] = modelStats([call("a", true, 100), call("a", true, 300), call("a", false, 30000, "timeout"), call("a", false, 5, "rate_limited", 0)]);
  assert.equal(m.calls, 4);
  assert.equal(m.successRate, 0.5);
  assert.equal(m.timeoutRate, 0.25);
  assert.equal(m.rateLimitedRate, 0.25);
  assert.equal(m.p95Ms, 300, "a 30 s timeout is not a latency sample");
  assert.equal(m.usdPerSuccess, 0.0015);
  assert.deepEqual(modelStats([]), []);
});

test("drift: claimed only with enough calls on both sides; success drop, timeout rise and latency blow-up each detected", () => {
  const many = (n: number, okShare: number, lat: number, reason = "error") => Array.from({ length: n }, (_, i) => call("m", i < n * okShare, lat, i < n * okShare ? "ok" : reason));
  const baseline = modelStats(many(100, 0.95, 1000));
  assert.deepEqual(detectDrift(modelStats(many(10, 0.2, 1000)), baseline), [], "10 calls today is too few to claim anything");
  const worse = detectDrift(modelStats(many(40, 0.6, 1000)), baseline);
  assert.ok(worse.some((d) => d.kind === "success" && d.model === "m"));
  const timeouts = detectDrift(modelStats(many(40, 0.7, 1000, "timeout")), modelStats(many(100, 0.95, 1000, "timeout")));
  assert.ok(timeouts.some((d) => d.kind === "timeouts"));
  const slow = detectDrift(modelStats(many(40, 1, 9000)), modelStats(many(100, 1, 2000)));
  assert.ok(slow.some((d) => d.kind === "latency"));
  assert.deepEqual(detectDrift(modelStats(many(40, 1, 3000)), modelStats(many(100, 1, 1000))), [], `slower but under ${DRIFT.latencyFloorMs} ms is not drift`);
  assert.deepEqual(detectDrift(modelStats(many(40, 0.93, 1000)), baseline), [], "a small wobble is not drift");
});

test("feature cards: success excludes the person's own cancels; regression needs 20+ requests each side and a 10-point drop", () => {
  const f = (outcome: "answered" | "no_answer" | "cancelled", feature = "ask") => ({ feature, outcome, cause: outcome === "no_answer" ? ("provider_error" as const) : null, durationMs: 1000, firstOutputMs: 300, calls: { sent: 1, returned: 1, failed: 0, rateLimited: 0, usd: 0.002 } });
  const base = [...Array(40).fill(0).map(() => f("answered")), f("no_answer")];
  const cur = [...Array(15).fill(0).map(() => f("answered")), ...Array(10).fill(0).map(() => f("no_answer")), f("cancelled")];
  const [card] = featureCards(cur, base);
  assert.equal(card.requests, 26);
  assert.equal(card.successRate, 15 / 25);
  assert.equal(card.regression, true);
  assert.equal(card.causes.provider_error, 10);
  const [small] = featureCards(cur.slice(0, 12), base);
  assert.equal(small.regression, false, "too few requests to call it a regression");
});

test("observatory run: real stored calls -> one drift alert for the model that got worse, sent once per day, audited", async () => {
  const at = Date.parse("2026-10-12T12:00:00Z");
  const rows = collection<ModelCallRow>("model_calls");
  const iso = (t: number) => new Date(t).toISOString();
  let n = 0;
  const put = (model: string, ok: boolean, t: number, reason = ok ? "ok" : "error") => rows.insert({ id: `mc_obs_${n++}`, workspaceId: "system", at: iso(t), model, vendor: "test", provider: "test", ok, reason, latencyMs: 800, usd: 0.001 });
  for (let i = 0; i < 80; i++) { await put("test/drifty", i % 20 !== 0, at - 3 * 864e5 + i * 1000); await put("test/steady", true, at - 3 * 864e5 + i * 1000); }
  for (let i = 0; i < 30; i++) { await put("test/drifty", i % 2 === 0, at - 3600_000 + i * 1000); await put("test/steady", true, at - 3600_000 + i * 1000); }
  const sent: string[] = [];
  const r = await runObservatory(at, async (subject) => { sent.push(subject); });
  assert.ok(r.drift.some((d) => d.model === "test/drifty" && d.kind === "success"), JSON.stringify(r.drift));
  assert.ok(!r.drift.some((d) => d.model === "test/steady"));
  assert.equal(sent.filter((s) => s.includes("test/drifty")).length, 1);
  const again = await runObservatory(at + 60_000, async (subject) => { sent.push(subject); });
  assert.equal(again.alerted, 0, "the same finding is not alerted twice in a day");
  const audit = await collection<{ id: string; workspaceId: string; action: string; detail: string; actor: string }>("admin_audit").listSystem((a) => a.action === "model_drift" && a.detail.includes("test/drifty"));
  assert.equal(audit.length, 1, "audited once");
  assert.equal(audit[0].actor, "system:observatory");
});

test("cron: secret required; registered as a daily Vercel cron, an hourly Inngest job and a monitored heartbeat", async () => {
  const res = await observatoryCron(new Request("https://keplar.one/api/cron/observatory", { headers: { "x-forwarded-for": "10.66.1.1" } }));
  assert.equal(res.status, 401);
  const crons = (JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string }[] }).crons;
  assert.ok(crons.some((c) => c.path === "/api/cron/observatory"));
  assert.match(readFileSync("src/lib/inngest/functions.ts", "utf8"), /ops-model-observatory/);
  assert.ok(CRON_JOBS.some((j) => j.name === "observatory"));
});
