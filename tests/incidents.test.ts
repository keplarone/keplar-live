import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { answerWindow, digest, evaluate, plan, providerWindows, runIncidentSweep, listIncidents, type IncidentRow, type Signals } from "@/lib/ops/incidents";
import { countError, countWebhook, errorsSince, webhooksSince } from "@/lib/ops/counters";
import { GET as incidentsCron } from "@/app/api/cron/incidents/route";

const NOW = Date.parse("2026-10-19T12:00:00Z");
const quiet = (over: Partial<Signals> = {}): Signals => ({
  at: NOW,
  windowMin: 15,
  database: { checked: true, ok: true, ms: 12 },
  authSecretMissing: false,
  answers: { judged: 40, failed: 1, causes: { provider_error: 1 }, traceIds: ["req_aaaaaaaaaaaa"] },
  providers: [{ provider: "openrouter", calls: 100, failed: 2, timeouts: 1, rateLimited: 1, p95Ms: 6000, baselineP95Ms: 5000, baselineCalls: 900 }],
  errors: {},
  webhooks: [{ provider: "whop", ok: 4, failed: 0, rejected: 0 }],
  spend: { todayUsd: 3, capUsd: 25, lastHourUsd: 0.4 },
  auth: { failed: 2, throttled: 0 },
  crons: [{ name: "domains", label: "Custom domain re-check", state: "ok" }],
  alertsRouted: true,
  ...over,
});
const keys = (s: Signals) => evaluate(s).map((d) => `${d.key}@${d.sev}`).sort();

test("a healthy system raises nothing", () => {
  assert.deepEqual(evaluate(quiet()), []);
});

test("database down and a missing auth secret are SEV-1", () => {
  assert.deepEqual(keys(quiet({ database: { checked: true, ok: false, ms: 3000 }, authSecretMissing: true })), ["auth:secret-missing@1", "database:unavailable@1"]);
  assert.deepEqual(evaluate(quiet({ database: { checked: false, ok: true, ms: null } })), [], "no database configured: nothing claimed");
});

test("answer failures scale SEV-3 → SEV-1 and carry request ids as trace ids, but need enough requests", () => {
  const at = (failed: number) => evaluate(quiet({ answers: { judged: 40, failed, causes: { provider_timeout: failed }, traceIds: ["req_111111111111", "req_222222222222"] } }));
  assert.equal(at(5)[0].sev, 3);
  assert.equal(at(12)[0].sev, 2);
  assert.equal(at(25)[0].sev, 1);
  assert.deepEqual(at(25)[0].traceIds, ["req_111111111111", "req_222222222222"]);
  assert.match(at(25)[0].evidence.join(" "), /provider_timeout 25/);
  assert.deepEqual(evaluate(quiet({ answers: { judged: 4, failed: 4, causes: {}, traceIds: [] } })), [], "4 requests are too few to call an outage");
});

test("a failing provider is SEV-2; every provider failing is SEV-1; rate limits and latency are SEV-3", () => {
  const p = (provider: string, failed: number, extra: Partial<Signals["providers"][number]> = {}) => ({ provider, calls: 50, failed, timeouts: 0, rateLimited: 0, p95Ms: 5000, baselineP95Ms: 5000, baselineCalls: 500, ...extra });
  assert.deepEqual(keys(quiet({ providers: [p("openai", 30), p("openrouter", 1)] })), ["provider:openai:failing@2"]);
  assert.deepEqual(keys(quiet({ providers: [p("openai", 50), p("openrouter", 48)] })), ["provider:openai:failing@1", "provider:openrouter:failing@1"]);
  assert.deepEqual(keys(quiet({ providers: [p("openrouter", 2, { rateLimited: 20 })] })), ["provider:openrouter:rate-limited@3"]);
  assert.deepEqual(keys(quiet({ providers: [p("openrouter", 0, { p95Ms: 30_000, baselineP95Ms: 8000 })] })), ["provider:openrouter:slow@3"]);
  assert.deepEqual(keys(quiet({ providers: [p("openrouter", 0, { p95Ms: 12_000, baselineP95Ms: 4000 })] })), [], "slow but under the 20 s floor");
  assert.deepEqual(evaluate(quiet({ providers: [{ ...p("tiny", 5), calls: 5 }] })), [], "too few calls");
});

test("server error bursts, browser errors, billing webhook failures, forged webhooks, spend and sign-in abuse", () => {
  assert.deepEqual(keys(quiet({ errors: { server: 12 } })), ["errors:server@3"]);
  assert.deepEqual(keys(quiet({ errors: { server: 40, render: 15 } })), ["errors:server@2"]);
  assert.deepEqual(keys(quiet({ errors: { client: 31 } })), ["errors:client@3"]);
  assert.deepEqual(keys(quiet({ webhooks: [{ provider: "whop", ok: 1, failed: 3, rejected: 0 }] })), ["webhook:whop:failing@2"]);
  assert.deepEqual(keys(quiet({ webhooks: [{ provider: "stripe-connect", ok: 1, failed: 3, rejected: 12 }] })), ["webhook:stripe-connect:failing@3", "webhook:stripe-connect:rejected@3"]);
  assert.deepEqual(keys(quiet({ spend: { todayUsd: 20, capUsd: 25, lastHourUsd: 5 } })), ["spend:daily-cap@3"]);
  assert.deepEqual(keys(quiet({ spend: { todayUsd: 24, capUsd: 25, lastHourUsd: 5 } })), ["spend:daily-cap@2"]);
  assert.deepEqual(keys(quiet({ auth: { failed: 10, throttled: 25 } })), ["auth:failures@3"]);
  assert.deepEqual(keys(quiet({ crons: [{ name: "agents", label: "Agents", state: "failed" }, { name: "domains", label: "Domains", state: "late" }] })), ["cron:agents:failed@3", "cron:domains:late@4"]);
  assert.deepEqual(keys(quiet({ alertsRouted: false })), ["alerts:unrouted@4"]);
});

test("no evidence line or digest carries an email address or a prompt", () => {
  const all = evaluate(quiet({ database: { checked: true, ok: false, ms: 1 }, errors: { server: 60, client: 40 }, webhooks: [{ provider: "whop", ok: 0, failed: 5, rejected: 20 }], auth: { failed: 200, throttled: 50 } }));
  const p = plan([], all, NOW);
  const d = digest(p.notify, NOW)!;
  assert.doesNotMatch(d.text, /@[a-z0-9-]+\.[a-z]/i);
  assert.match(d.subject, /^SEV-1 /);
  assert.match(d.text, /First seen 2026-10-19T12:00:00.000Z/);
});

test("plan: new incidents notify once, unchanged ones stay quiet until the reminder interval, escalation and resolution notify", () => {
  const sev3 = { key: "errors:server", sev: 3 as const, service: "server", title: "12 server errors", evidence: ["e"], traceIds: [] };
  const first = plan([], [sev3], NOW);
  assert.deepEqual(first.notify.map((n) => n.why), ["new"]);
  const open = first.upsert as IncidentRow[];
  assert.equal(plan(open, [sev3], NOW + 5 * 60_000).notify.length, 0, "5 minutes later: no repeat");
  assert.deepEqual(plan(open, [sev3], NOW + 13 * 3_600_000).notify.map((n) => n.why), ["reminder"], "SEV-3 reminder after 12 h");
  const esc = plan(open, [{ ...sev3, sev: 2 as const }], NOW + 5 * 60_000);
  assert.deepEqual(esc.notify.map((n) => n.why), ["escalated"]);
  // SEV-3 resolutions are quiet; SEV-1/2 resolutions are announced
  assert.equal(plan(open, [], NOW + 10 * 60_000).notify.length, 0);
  assert.equal(plan(open, [], NOW + 10 * 60_000).upsert[0].status, "resolved");
  const escRows = esc.upsert as IncidentRow[];
  assert.deepEqual(plan(escRows, [], NOW + 20 * 60_000).notify.map((n) => n.why), ["resolved"]);
  // SEV-4 is dashboard-only
  assert.equal(plan([], [{ ...sev3, key: "cron:x:late", sev: 4 as const }], NOW).notify.length, 0);
});

test("digest groups everything into one message and caps its length", () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ key: `k${i}`, sev: 3 as const, service: "s", title: `t${i}`, evidence: ["e"], traceIds: [] }));
  const p = plan([], many, NOW);
  const d = digest(p.notify, NOW)!;
  assert.match(d.subject, /\(\+11 more\)/);
  assert.match(d.text, /and 4 more/);
  assert.equal(digest([], NOW), null);
});

test("signal helpers: provider windows exclude quality-gate rejects from failures; answer windows exclude cancels and limits", () => {
  const w = providerWindows(
    [
      { provider: "openrouter", ok: true, reason: "ok", latencyMs: 1000 },
      { provider: "openrouter", ok: false, reason: "timeout", latencyMs: 45000 },
      { provider: "openrouter", ok: false, reason: "gate:degenerate", latencyMs: 900 },
    ],
    [{ provider: "openrouter", ok: true, latencyMs: 800 }],
  );
  assert.deepEqual({ calls: w[0].calls, failed: w[0].failed, timeouts: w[0].timeouts, p95: w[0].p95Ms, base: w[0].baselineP95Ms }, { calls: 3, failed: 1, timeouts: 1, p95: 1000, base: 800 });
  const a = answerWindow([
    { outcome: "answered", cause: null, reqId: "req_a" },
    { outcome: "cancelled", cause: "client", reqId: "req_b" },
    { outcome: "limited", cause: "capacity", reqId: "req_c" },
    { outcome: "error", cause: "provider_error", reqId: "req_d" },
    { outcome: "no_answer", cause: "provider_timeout", reqId: "unknown" },
  ]);
  assert.deepEqual(a, { judged: 3, failed: 2, causes: { provider_error: 1, provider_timeout: 1 }, traceIds: ["req_d"] });
});

test("counters: errors per minute and webhook outcomes per hour are counted and read back", async () => {
  const t = Date.now();
  await countError("server", t);
  await countError("server", t);
  await countError("client", t);
  const e = await errorsSince(15, t);
  assert.ok(e.server >= 2 && e.client >= 1);
  countWebhook("whop", "failed", t);
  countWebhook("whop", "ok", t);
  countWebhook("whop", "rejected", t);
  await new Promise((r) => setTimeout(r, 50));
  const w = (await webhooksSince(2, t)).find((x) => x.provider === "whop")!;
  assert.ok(w.failed >= 1 && w.ok >= 1 && w.rejected >= 1);
});

test("sweep: persists incidents, sends one digest, dedupes overlapping runs, and resolves when the signal clears", async () => {
  const sent: string[] = [];
  const notify = async (subject: string) => { sent.push(subject); };
  const t0 = Date.parse("2026-10-19T13:00:00Z");
  const bad = { ...quiet({ database: { checked: true, ok: false, ms: 5000 } }), at: t0 };
  const r1 = await runIncidentSweep(t0, notify, bad);
  assert.equal(r1.notified, 1);
  assert.match(sent[0], /^SEV-1 Database round trip failing/);
  const again = await runIncidentSweep(t0 + 30_000, notify, bad);
  assert.equal(again.skipped, "locked", "a second scheduler in the same 2-minute slot does nothing");
  await runIncidentSweep(t0 + 5 * 60_000, notify, bad);
  assert.equal(sent.length, 1, "still open, inside the SEV-1 reminder interval: quiet");
  const open = (await listIncidents()).filter((r) => r.key === "database:unavailable" && r.status === "open");
  assert.equal(open.length, 1);
  assert.equal(open[0].seen, 2);
  await runIncidentSweep(t0 + 10 * 60_000, notify, { ...quiet(), at: t0 + 10 * 60_000 });
  assert.match(sent[1], /^Resolved: Database round trip failing/);
  assert.equal((await listIncidents()).find((r) => r.key === "database:unavailable")!.status, "resolved");
});

test("cron route: 401 without the ops secret", async () => {
  const res = await incidentsCron(new Request("https://keplar.one/api/cron/incidents"));
  assert.equal(res.status, 401);
});
