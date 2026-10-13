import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { POST as keplarPOST } from "@/app/api/keplar/route";
import { GET as adminFlightGET } from "@/app/api/admin/flight/route";
import { classify, flightByRequest, flightPush, flightRow, FLIGHT_MAX_EVENTS, safe, startFlight, summarizeFlights, type FlightEvent, type FlightRow } from "@/lib/ops/flight";
import { pruneOperational } from "@/lib/ops/retention";
import { collection } from "@/lib/create/platform/store";

const PROMPT = "My landlord kept my deposit after I moved out of Flat 4B, what can I do?";
const ANSWER = "Write to the landlord first and ask for an itemised list of deductions, then use the deposit protection scheme.";

async function withStub<T>(reply: (model: string) => Response, fn: () => Promise<T>): Promise<T> {
  const realFetch = globalThis.fetch;
  const env = { KEPLAR_LIVE_MODELS: "1", OPENROUTER_API_KEY: "sk-or-test", OPENROUTER_FREE_API_KEY: "sk-or-free-test" };
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) { prev[k] = process.env[k]; process.env[k] = v; }
  globalThis.fetch = (async (_u: string | URL, init?: RequestInit) => reply((JSON.parse(String(init?.body ?? "{}")) as { model: string }).model)) as typeof fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = realFetch;
    for (const [k, v] of Object.entries(prev)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}
const okReply = (model: string) => new Response(JSON.stringify({ model, choices: [{ message: { content: ANSWER }, finish_reason: "stop" }], usage: { prompt_tokens: 40, completion_tokens: 30, cost: 0 } }), { status: 200, headers: { "content-type": "application/json" } });
const ask = (reqId: string, ip: string) =>
  keplarPOST(new Request("https://keplar.one/api/keplar", { method: "POST", headers: { "content-type": "application/json", origin: "https://keplar.one", "x-forwarded-for": ip, "x-request-id": reqId }, body: JSON.stringify({ prompt: PROMPT, history: [] }) }));
async function waitFlight(reqId: string): Promise<FlightRow> {
  for (let i = 0; i < 60; i++) {
    const row = await flightByRequest(reqId);
    if (row) return row;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`no flight row for ${reqId}`);
}

test("route: an answered request leaves one timeline with stages, every provider request and the outcome, and no text", async () => {
  const reqId = "req_flightok12345678";
  await withStub(okReply, async () => { await (await ask(reqId, "10.77.1.1")).text(); });
  const row = await waitFlight(reqId);
  assert.equal(row.outcome, "answered");
  assert.equal(row.cause, null);
  assert.equal(row.plan, "free");
  assert.ok(row.calls.sent >= 1 && row.calls.returned >= 1, JSON.stringify(row.calls));
  assert.equal(row.calls.failed, 0);
  const kinds = new Set(row.events.map((e) => e.k));
  for (const k of ["stage", "sent", "call", "answer", "note"] as const) assert.ok(kinds.has(k), `has ${k} events`);
  const call = row.events.find((e) => e.k === "call")!;
  assert.ok(call.model && typeof call.ms === "number" && call.ok === true, JSON.stringify(call));
  assert.ok(row.firstOutputMs !== null && row.firstOutputMs <= row.durationMs);
  assert.ok(row.events.every((e, i) => i === 0 || e.t >= row.events[i - 1].t), "events are in time order");
  const json = JSON.stringify(row);
  for (const fragment of ["landlord", "deposit", "Flat 4B", "itemised", "protection scheme"]) assert.ok(!json.includes(fragment), `no prompt or answer text (${fragment})`);
});

test("route: every provider rate-limited -> no answer, cause provider_rate_limited, all calls failed", async () => {
  const reqId = "req_flight429abcdefg";
  await withStub(() => new Response(JSON.stringify({ error: { code: 429 } }), { status: 429 }), async () => { await (await ask(reqId, "10.77.1.2")).text(); });
  const row = await waitFlight(reqId);
  assert.equal(row.outcome, "no_answer");
  assert.equal(row.cause, "provider_rate_limited");
  assert.ok(row.calls.returned >= 1);
  assert.equal(row.calls.failed, row.calls.returned);
  assert.equal(row.calls.rateLimited, row.calls.returned);
});

test("route: every provider erroring -> cause provider_error (not blamed on Keplar's pipeline or the client)", async () => {
  const reqId = "req_flight500abcdefg";
  await withStub(() => new Response("upstream down", { status: 500 }), async () => { await (await ask(reqId, "10.77.1.3")).text(); });
  const row = await waitFlight(reqId);
  assert.notEqual(row.outcome, "answered");
  assert.equal(row.cause, "provider_error");
});

test("privacy by construction: strings are short and character-limited; the timeline is bounded", () => {
  assert.equal(safe("hello world, write to pat@example.com about my rent"), "helloworldwritetopat@example.comaboutmyrent".slice(0, 64));
  assert.equal(safe("x".repeat(500))?.length, 64);
  assert.equal(safe(""), undefined);
  assert.equal(safe(42), undefined);
  const log = startFlight(0);
  for (let i = 0; i < FLIGHT_MAX_EVENTS + 25; i++) flightPush(log, { k: "sent", slot: "panel", model: "m/x" }, i);
  assert.equal(log.events.length, FLIGHT_MAX_EVENTS);
  assert.equal(log.dropped, 25);
  flightPush(log, { k: "note" });
  assert.equal(log.dropped, 26);
  const one = startFlight(0);
  flightPush(one, { k: "call", model: "openai/gpt", ok: false, reason: "timeout", ms: 1234.7, usd: 0.0012345678, prompt: "secret" } as unknown as Omit<FlightEvent, "t">, 10);
  assert.deepEqual(one.events[0], { t: 10, k: "call", model: "openai/gpt", reason: "timeout", ok: false, ms: 1235, usd: 0.001235 }, "unknown fields (a prompt) are dropped");
});

test("classification: from the timeline alone, which part failed", () => {
  const call = (ok: boolean, reason = ok ? "ok" : "error"): FlightEvent => ({ t: 1, k: "call", ok, reason, model: "m" });
  const base = { answered: false, aborted: false, errorCode: "no_response", limited: false };
  assert.deepEqual(classify([call(true)], { ...base, answered: true }), { outcome: "answered", cause: null });
  assert.deepEqual(classify([], { ...base, aborted: true }), { outcome: "cancelled", cause: "client" });
  assert.deepEqual(classify([], { ...base, limited: true }), { outcome: "limited", cause: "capacity" });
  assert.deepEqual(classify([call(false, "timeout"), call(false, "timeout")], base), { outcome: "no_answer", cause: "provider_timeout" });
  assert.deepEqual(classify([call(false, "gate:loop")], base), { outcome: "no_answer", cause: "quality_gate" });
  assert.deepEqual(classify([call(true), call(false)], { ...base, errorCode: "internal" }), { outcome: "error", cause: "orchestration" }, "providers answered, so the failure is after them");
  assert.deepEqual(classify([], { ...base, errorCode: "internal" }), { outcome: "error", cause: "orchestration" });
  assert.deepEqual(classify([], { ...base, errorCode: "free_busy" }), { outcome: "error", cause: "capacity" });
});

test("summary: success rate leaves out the person's own cancels; percentiles from real rows only", () => {
  const r = (outcome: FlightRow["outcome"], durationMs: number, firstOutputMs: number | null) => ({ outcome, cause: null, durationMs, firstOutputMs, calls: { sent: 1, returned: 1, failed: 0, rateLimited: 0, usd: 0.001 } });
  const s = summarizeFlights([r("answered", 1000, 300), r("answered", 3000, 500), r("cancelled", 200, null), r("no_answer", 9000, null)]);
  assert.equal(s.requests, 4);
  assert.equal(s.successRate, 2 / 3);
  assert.equal(s.firstOutputMs.p50, 500);
  assert.equal(summarizeFlights([]).successRate, null, "no data is null, never 0% or 100%");
});

test("admin only: the flight API refuses anyone who is not an admin", async () => {
  const res = await adminFlightGET(new Request("https://keplar.one/api/admin/flight?req=req_flightok12345678"));
  assert.ok(res.status === 401 || res.status === 403 || res.status === 404, `status ${res.status}`);
  assert.ok(!(await res.text()).includes("events"));
});

test("retention: timelines older than 7 days are pruned with the other operational rows", async () => {
  const log = startFlight(Date.parse("2020-01-01T00:00:00Z"));
  const old = flightRow(log, { reqId: "req_flightold0000001", plan: "free", kind: "answer", answered: true, aborted: false, errorCode: null, limited: false, usd: 0, end: Date.parse("2020-01-01T00:00:05Z") });
  await collection<FlightRow>("system_flight").insert(old);
  assert.ok(await flightByRequest("req_flightold0000001"));
  const out = await pruneOperational();
  assert.ok((out.system_flight ?? 0) >= 1, JSON.stringify(out));
  assert.equal(await flightByRequest("req_flightold0000001"), null);
});
