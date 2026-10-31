import "./setup";
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { CONSENT_VERSION } from "../src/lib/consent";
import { DatabaseError, expireStoreCircuit, isStoreUnavailable, neonQuery, resetStoreCircuit, setLastStoreActivity, storeCircuit, storeUnavailableNow, StoreUnavailableError, unavailableStatus } from "@/lib/create/platform/neon";
import { errorResponse } from "@/lib/create/platform/http";
import { AWAKE_MS, BACKLOG_FLUSH, flushDue, maxHoldMs, MIN_GAP_MS, telemetryBuffer } from "@/lib/traffic/flush-gate";
import { admitDegraded, DEGRADED_LIMITS, DEGRADED_PREFIX, resetDegradedLimits } from "@/lib/orchestration/degraded";

// A Neon endpoint that answers what each test sets, and a model provider that answers every call (only used by the chat test).
const HOST = "ep-outage-1.us-east-2.aws.neon.tech";
type Mode = "ok" | "402" | "503" | "sql" | "network";
let mode: Mode = "ok";
let neonCalls = 0;
const modelBodies: { model?: string }[] = [];
const real = globalThis.fetch;
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (new URL(url).hostname === HOST) {
    neonCalls++;
    if (mode === "network") throw new TypeError("fetch failed");
    if (mode === "402") return Response.json({ message: "Your project has exceeded the compute time quota." }, { status: 402 });
    if (mode === "503") return new Response("upstream", { status: 503 });
    if (mode === "sql") return Response.json({ message: "relation does not exist", code: "42P01" }, { status: 400 });
    return Response.json({ rows: [{ x: "1" }] });
  }
  if (/openrouter|nvidia|openai|api\./.test(url)) {
    try { modelBodies.push(JSON.parse(String(init?.body ?? "{}"))); } catch { /* not JSON */ }
    return new Response(JSON.stringify({ id: "x", model: "m", choices: [{ index: 0, message: { role: "assistant", content: "Paris is the capital of France." }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 8 } }), { status: 200, headers: { "content-type": "application/json" } });
  }
  return real(input, init);
}) as typeof fetch;
after(() => { globalThis.fetch = real; });

process.env.DATABASE_URL = `postgresql://user:secret-pass@${HOST}/neondb?sslmode=require`;
beforeEach(() => {
  mode = "ok";
  neonCalls = 0;
  resetStoreCircuit();
  resetDegradedLimits();
});

test("classification: 402 / 5xx / 401 / 403 / 429 / quota text are 'unavailable'; SQL errors are not", () => {
  assert.equal(unavailableStatus(402), "quota");
  assert.equal(unavailableStatus(500), "server");
  assert.equal(unavailableStatus(503), "server");
  assert.equal(unavailableStatus(429), "server");
  assert.equal(unavailableStatus(401), "server");
  assert.equal(unavailableStatus(403), "server");
  assert.equal(unavailableStatus(400), null);
  assert.equal(unavailableStatus(404), null);
  assert.equal(unavailableStatus(400, { message: "Your project has exceeded the compute time quota" }), "quota");
  const e = new StoreUnavailableError("quota");
  assert.ok(e instanceof DatabaseError && isStoreUnavailable(e));
  assert.equal(isStoreUnavailable(new DatabaseError("x")), false);
});

test("402: one request, a typed error, then every query fails fast without a network call until the probe", async () => {
  mode = "402";
  await assert.rejects(neonQuery("SELECT 1"), (e: unknown) => isStoreUnavailable(e) && e.reason === "quota" && !/secret-pass/.test(e.message));
  assert.equal(neonCalls, 1, "402 is not retried");
  assert.equal(storeUnavailableNow(), true);
  assert.equal(storeCircuit().reason, "quota");
  for (let i = 0; i < 5; i++) await assert.rejects(neonQuery("SELECT 1"), (e: unknown) => isStoreUnavailable(e) && e.reason === "circuit_open");
  assert.equal(neonCalls, 1, "short-circuited queries never reach Neon");
  // The open period passes: exactly one probe goes out; while it is in flight, others still fail fast.
  expireStoreCircuit();
  mode = "ok";
  const probe = neonQuery("SELECT 1");
  await assert.rejects(neonQuery("SELECT 2"), (e: unknown) => isStoreUnavailable(e) && e.reason === "circuit_open");
  assert.deepEqual(await probe, [{ x: "1" }]);
  assert.equal(neonCalls, 2);
  assert.equal(storeUnavailableNow(), false);
  assert.deepEqual(await neonQuery("SELECT 3"), [{ x: "1" }]);
});

test("a failed probe opens the circuit again; 5xx is retried once before it trips; network errors trip too", async () => {
  mode = "503";
  await assert.rejects(neonQuery("SELECT 1"), (e: unknown) => isStoreUnavailable(e) && e.reason === "server");
  assert.equal(neonCalls, 2, "one retry on 5xx");
  expireStoreCircuit();
  await assert.rejects(neonQuery("SELECT 1"), (e: unknown) => isStoreUnavailable(e) && e.reason === "server");
  assert.equal(storeUnavailableNow(), true);
  resetStoreCircuit();
  mode = "network";
  neonCalls = 0;
  await assert.rejects(neonQuery("SELECT 1"), (e: unknown) => isStoreUnavailable(e) && e.reason === "network");
  assert.equal(neonCalls, 2);
  assert.equal(storeUnavailableNow(), true);
});

test("SQL errors keep their Postgres code and never open the circuit", async () => {
  mode = "sql";
  await assert.rejects(neonQuery("SELECT * FROM nope"), (e: unknown) => e instanceof DatabaseError && !isStoreUnavailable(e) && e.code === "42P01");
  assert.equal(storeUnavailableNow(), false);
  mode = "ok";
  assert.deepEqual(await neonQuery("SELECT 1"), [{ x: "1" }]);
});

test("routes answer a calm 503 for a store outage, not a 500", async () => {
  const res = errorResponse(new StoreUnavailableError("quota"));
  assert.equal(res.status, 503);
  assert.equal(res.headers.get("retry-after"), "30");
  const body = (await res.json()) as { error: string; message: string };
  assert.equal(body.error, "temporarily_unavailable");
  assert.match(body.message, /temporarily unavailable/);
});

test("flush gate: writes when the store is awake anyway, otherwise holds up to MAX_HOLD, never while it is down", () => {
  const env = {} as Record<string, string | undefined>; // production behaviour (tests/setup.ts sets immediate)
  const now = Date.now();
  assert.equal(flushDue(0, 0, now, env), false, "nothing to write");
  setLastStoreActivity(now - 30_000);
  assert.equal(flushDue(now - MIN_GAP_MS, 3, now, env), true, "awake: write now");
  assert.equal(flushDue(now - 10_000, 3, now, env), false, "not more often than MIN_GAP");
  setLastStoreActivity(now - AWAKE_MS - 1);
  assert.equal(flushDue(now - MIN_GAP_MS, 3, now, env), false, "asleep: hold");
  assert.equal(flushDue(now - maxHoldMs(env), 3, now, env), true, "held long enough: one wake-up");
  assert.equal(flushDue(now - MIN_GAP_MS, BACKLOG_FLUSH, now, env), true, "a large backlog goes out");
  assert.equal(maxHoldMs(env), 30 * 60_000);
  assert.equal(maxHoldMs({ KEPLAR_TELEMETRY_HOLD_MIN: "10" }), 10 * 60_000);
  assert.equal(flushDue(0, 1, now, { KEPLAR_TELEMETRY_FLUSH: "immediate" }), true);
});

test("flush gate: while the circuit is open nothing is written, and a batch cut by an outage is kept", async () => {
  mode = "402";
  await assert.rejects(neonQuery("SELECT 1"));
  assert.equal(flushDue(0, 5, Date.now(), {}), false);
  const written: number[] = [];
  const buf = telemetryBuffer<number>("t", async (n) => {
    if (n === 2) throw new StoreUnavailableError("quota");
    written.push(n);
  });
  // Immediate mode (tests/setup.ts) bypasses the gate, so the outage hits mid-batch: 1 is written, 2 and 3 are kept for later.
  await buf.push(1);
  await buf.push(2);
  assert.deepEqual(written, [1]);
  await buf.push(3);
  assert.deepEqual(written, [1]);
  assert.equal(buf.size(), 2, "2 and 3 wait for the next window");
});

const consent = `keplar_consent=${encodeURIComponent(JSON.stringify({ version: CONSENT_VERSION, at: Date.now(), choices: { analytics: true } }))}`;
const UA = "Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0 Safari/537.36";

test("telemetry endpoints answer 204 and stay quiet while the store is down", async () => {
  mode = "402";
  await assert.rejects(neonQuery("SELECT 1")); // circuit open
  neonCalls = 0;
  const errors: string[] = [];
  const orig = console.error;
  console.error = (...a: unknown[]) => void errors.push(a.join(" "));
  try {
    const { POST: presence } = await import("@/app/api/presence/route");
    const p = await presence(new Request("https://keplar.one/api/presence", { method: "POST", body: "hb", headers: { "user-agent": UA, "x-forwarded-for": "198.51.100.40" } }));
    assert.equal(p.status, 204);
    const { POST: growth } = await import("@/app/api/growth/event/route");
    const g = await growth(new Request("https://keplar.one/api/growth/event", { method: "POST", headers: { cookie: consent, "content-type": "application/json", "x-forwarded-for": "198.51.100.41" }, body: JSON.stringify({ event: "share_dialog", vid: "b".repeat(24) }) }));
    assert.equal(g.status, 204);
    const { POST: seo } = await import("@/app/api/seo/event/route");
    const s = await seo(new Request("https://keplar.one/api/seo/event", { method: "POST", headers: { cookie: consent, "content-type": "application/json", "x-forwarded-for": "198.51.100.42" }, body: JSON.stringify({ event: "landing_view", landing: "/pricing", src: "direct", vid: "c".repeat(24) }) }));
    assert.equal(s.status, 204);
    const { noteVisit } = await import("@/lib/traffic/visits");
    const v = noteVisit(new Request("https://keplar.one/pricing", { headers: { "user-agent": UA, "sec-fetch-dest": "document", "x-forwarded-for": "198.51.100.43" } }));
    if (v) await v;
  } finally {
    console.error = orig;
  }
  assert.equal(neonCalls, 0, "nothing reached the database while its circuit was open");
  assert.ok(errors.every((l) => !/not recorded/.test(l)), errors.join("\n"));
});

test("health stays honest: 503 while the store is down", async () => {
  mode = "402";
  await assert.rejects(neonQuery("SELECT 1"));
  const { GET } = await import("@/app/api/health/route");
  const res = await GET(new Request("https://keplar.one/api/health"));
  assert.equal(res.status, 503);
  assert.equal(((await res.json()) as { ok: boolean }).ok, false);
});

test("degraded limits are in memory, stricter than Free, and refuse before counting", () => {
  const t = Date.parse("2026-10-31T12:00:00Z");
  const who = { ip: "203.0.113.9", device: null };
  for (let i = 0; i < DEGRADED_LIMITS.ipPerMinute; i++) {
    const a = admitDegraded(who, t + i);
    assert.ok("release" in a);
    a.release();
  }
  const over = admitDegraded(who, t + 10);
  assert.ok("message" in over && over.retryAfterSec > 0);
  // One answer at a time per IP.
  const other = { ip: "203.0.113.10", device: null };
  const first = admitDegraded(other, t);
  assert.ok("release" in first);
  assert.ok("message" in admitDegraded(other, t + 1));
  first.release();
  assert.ok("release" in admitDegraded(other, t + 2));
  assert.ok(DEGRADED_LIMITS.ipPerMinute < 6 && DEGRADED_LIMITS.ipPerDay <= 50);
});

test("chat while the store is down: a free-model answer with the notice, nothing saved, no paid model, no credits", async () => {
  Object.assign(process.env, { OPENROUTER_API_KEY: "sk-or-test", OPENROUTER_API_KEY_FREE: "sk-or-free-test", OPENAI_API_KEY: "sk-test", NVIDIA_API_KEY: "nvapi-test", KEPLAR_LIVE_MODELS: "1", KEPLAR_FREE_DATA_COLLECTION: "deny" });
  try {
    mode = "402";
    modelBodies.length = 0;
    const { POST } = await import("@/app/api/keplar/route");
    const ask = (prompt: string, extra: Record<string, unknown> = {}, ip = "203.0.113.50") =>
      POST(new Request("https://keplar.one/api/keplar", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify({ prompt, turnKey: "k".repeat(20), history: [{ role: "user", text: "hi" }, { role: "keplar", text: "Hello!" }], ...extra }) }));
    // First request: the store is found down during the normal path (circuit closed), then answered degraded.
    const res = await ask("What is the capital of France? Answer briefly.");
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("x-keplar-degraded"), "store");
    const events = (await res.text()).trim().split("\n").map((l) => JSON.parse(l) as { type: string; answer?: { markdown: string; reasoning?: string; compute: { units: number } } });
    const answer = events.find((e) => e.type === "answer")?.answer;
    assert.ok(answer, JSON.stringify(events.map((e) => e.type)));
    assert.ok(answer.markdown.startsWith(DEGRADED_PREFIX), answer.markdown);
    assert.match(answer.markdown, /Paris/);
    assert.match(answer.reasoning ?? "", /paused briefly/);
    assert.ok(!events.some((e) => e.type === "memory" || e.type === "daily" || e.type === "limit"), "no memory, meter or credit events");
    // Only $0 free models were called.
    assert.ok(modelBodies.length > 0);
    for (const b of modelBodies) assert.match(String(b.model ?? ""), /:free$/, `paid model called: ${b.model}`);
    // Second request: the circuit is open, so not one database call is made (nothing read, nothing saved).
    neonCalls = 0;
    const res2 = await ask("And of Italy?", {}, "203.0.113.51");
    assert.equal(res2.status, 200);
    const text2 = await res2.text();
    assert.match(text2, /paused briefly/);
    assert.equal(neonCalls, 0, "degraded answers never touch the store");
    // Attachments need storage and privacy checks: refused plainly.
    const withDocs = await ask("Summarize this", { docs: [{ name: "a.txt", text: "hello", source: "file" }] }, "203.0.113.52");
    assert.equal(withDocs.status, 503);
    assert.equal(((await withDocs.json()) as { code: string }).code, "temporarily_unavailable");
  } finally {
    for (const k of ["OPENROUTER_API_KEY", "OPENROUTER_API_KEY_FREE", "OPENAI_API_KEY", "NVIDIA_API_KEY", "KEPLAR_LIVE_MODELS", "KEPLAR_FREE_DATA_COLLECTION"]) delete process.env[k];
  }
});

test("chat with a healthy store is unchanged: no degraded header", async () => {
  // Without live models the full path answers its usual 503 "not set up yet" (never the degraded path).
  mode = "ok";
  const { POST } = await import("@/app/api/keplar/route");
  const res = await POST(new Request("https://keplar.one/api/keplar", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.60" }, body: JSON.stringify({ prompt: "What is 2+2?" }) }));
  assert.equal(res.headers.get("x-keplar-degraded"), null);
  assert.equal(storeUnavailableNow(), false);
});

test("/api/compute?lite=1: a signed-out page view reads nothing from the database; during an outage it says unavailable, not signed out", async () => {
  const { GET } = await import("@/app/api/compute/route");
  mode = "ok";
  neonCalls = 0;
  const res = await GET(new Request("https://keplar.one/api/compute?lite=1", { headers: { "x-forwarded-for": "203.0.113.70" } }));
  assert.equal(res.status, 200);
  const body = (await res.json()) as { plan: string; signedIn: boolean; lite: boolean };
  assert.deepEqual([body.plan, body.signedIn, body.lite], ["free", false, true]);
  assert.equal(neonCalls, 0);
  mode = "402";
  await assert.rejects(neonQuery("SELECT 1"));
  const down = await GET(new Request("https://keplar.one/api/compute?lite=1", { headers: { "x-forwarded-for": "203.0.113.70" } }));
  assert.equal(down.status, 503);
  const full = await GET(new Request("https://keplar.one/api/compute", { headers: { "x-forwarded-for": "203.0.113.71" } }));
  assert.equal(full.status, 503);
  assert.equal(((await full.json()) as { error: string }).error, "temporarily_unavailable");
});
