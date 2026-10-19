import "./setup";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { HttpError, postJson, postChatStream, retryDecision } from "@/lib/orchestration/http";
import { circuitAllows, circuitFailure, circuitKey, circuitSnapshot, circuitSuccess, resetCircuits } from "@/lib/orchestration/circuit";

const realFetch = globalThis.fetch;
process.env.KEPLAR_CIRCUIT_FAILURES = "5";
beforeEach(() => {
  resetCircuits();
  globalThis.fetch = realFetch;
});

function fakeFetch(responses: (() => Response | Promise<Response>)[]) {
  let i = 0;
  const calls = { n: 0 };
  globalThis.fetch = (async () => {
    calls.n++;
    const r = responses[Math.min(i++, responses.length - 1)];
    return r();
  }) as typeof fetch;
  return calls;
}
const ok = (body: unknown) => () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const status = (s: number, headers: Record<string, string> = {}) => () => new Response("err", { status: s, headers });

test("retryDecision: 4xx and our own timeout are final; 429/5xx/network back off; long Retry-After fails over", () => {
  assert.deepEqual(retryDecision(new HttpError(400, "bad"), 0, 3, 4000), { retry: false });
  assert.deepEqual(retryDecision(new HttpError(408, "timeout"), 0, 3, 4000), { retry: false }, "a timed-out request may already be billed");
  assert.deepEqual(retryDecision(new HttpError(429, "slow down", 60_000), 0, 3, 4000), { retry: false }, "Retry-After 60 s exceeds the budget: fail over now");
  const r429 = retryDecision(new HttpError(429, "slow down", 1000), 0, 3, 4000);
  assert.deepEqual(r429, { retry: true, waitMs: 1000 });
  const r500 = retryDecision(new HttpError(502, "bad gateway"), 1, 3, 4000);
  assert.ok(r500.retry && r500.waitMs >= 400 * 2 * 0.7 && r500.waitMs <= 4000);
  const net = retryDecision(new TypeError("fetch failed"), 0, 3, 4000);
  assert.ok(net.retry && net.waitMs > 0, "network errors wait before retrying (no tight loop)");
  assert.deepEqual(retryDecision(new HttpError(503, "x"), 2, 3, 4000), { retry: false }, "never after the last attempt");
});

test("postJson: retries a 503 then succeeds, and a success closes the circuit", async () => {
  const calls = fakeFetch([status(503), ok({ choices: [] })]);
  const out = await postJson<{ choices: unknown[] }>("https://prov.test/v1/chat", { model: "m1" }, {}, undefined, { attempts: 3, maxMs: 1 });
  assert.deepEqual(out, { choices: [] });
  assert.equal(calls.n, 2);
  assert.equal(circuitSnapshot().length, 0);
});

test("postJson: a 400 is not retried and does not count against the endpoint", async () => {
  const calls = fakeFetch([status(400)]);
  await assert.rejects(postJson("https://prov.test/v1/chat", { model: "m2" }, {}, undefined, { attempts: 3, maxMs: 1 }), (e: unknown) => e instanceof HttpError && e.status === 400);
  assert.equal(calls.n, 1);
  assert.equal(circuitSnapshot().length, 0);
});

test("circuit: five failed calls open it, calls are refused without touching the network, a probe after cooldown closes it", async () => {
  process.env.KEPLAR_CIRCUIT_COOLDOWN_MS = "50";
  try {
    const calls = fakeFetch([status(500)]);
    for (let i = 0; i < 5; i++) await assert.rejects(postJson("https://down.test/v1/chat", { model: "m3" }, {}, undefined, { attempts: 1, maxMs: 1 }));
    assert.equal(calls.n, 5);
    await assert.rejects(postJson("https://down.test/v1/chat", { model: "m3" }, {}, undefined, { attempts: 3, maxMs: 1 }), (e: unknown) => e instanceof HttpError && e.status === 503 && /Circuit open/.test(e.message));
    assert.equal(calls.n, 5, "no request is sent while open: no retry storm");
    assert.equal(circuitSnapshot()[0].state, "open");
    // another model on the same host is unaffected
    fakeFetch([ok({ fine: true })]);
    assert.deepEqual(await postJson("https://down.test/v1/chat", { model: "other" }, {}, undefined, { attempts: 1 }), { fine: true });
    await new Promise((r) => setTimeout(r, 60));
    fakeFetch([ok({ back: true })]);
    assert.deepEqual(await postJson("https://down.test/v1/chat", { model: "m3" }, {}, undefined, { attempts: 1 }), { back: true });
    assert.equal(circuitSnapshot().find((c) => c.key === "down.test|m3")?.state, "closed");
  } finally {
    delete process.env.KEPLAR_CIRCUIT_COOLDOWN_MS;
  }
});

test("circuit: half-open admits one probe at a time, and a failed probe re-opens it", () => {
  const cfg = { failures: 2, windowMs: 60_000, cooldownMs: 1000 };
  const k = circuitKey("https://h.test/x", { model: "p" });
  circuitFailure(k, 0, cfg);
  circuitFailure(k, 10, cfg);
  assert.equal(circuitAllows(k, 500), false);
  assert.equal(circuitAllows(k, 1100), true, "first call after cooldown is the probe");
  assert.equal(circuitAllows(k, 1101), false, "a second concurrent call waits for the probe");
  circuitFailure(k, 1200, cfg);
  assert.equal(circuitAllows(k, 1300), false, "failed probe re-opens");
  assert.equal(circuitAllows(k, 2300), true);
  circuitSuccess(k);
  assert.equal(circuitAllows(k, 2301), true);
  assert.equal(circuitAllows(k, 2302), true);
});

test("circuit: failures spread beyond the window do not open it", () => {
  const cfg = { failures: 3, windowMs: 1000, cooldownMs: 1000 };
  const k = circuitKey("https://w.test/x", { model: "q" });
  circuitFailure(k, 0, cfg);
  circuitFailure(k, 500, cfg);
  circuitFailure(k, 2000, cfg);
  assert.equal(circuitAllows(k, 2001), true);
});

test("postChatStream: a 429 with a long Retry-After is not retried, and the caller's abort is not counted as an outage", async () => {
  const calls = fakeFetch([status(429, { "retry-after": "120" })]);
  await assert.rejects(postChatStream("https://s.test/v1/chat", { model: "s1" }, {}, () => {}, undefined, { attempts: 3, maxMs: 4000 }), (e: unknown) => e instanceof HttpError && e.status === 429);
  assert.equal(calls.n, 1);
  const ctl = new AbortController();
  globalThis.fetch = ((_: unknown, init?: RequestInit) => new Promise((_r, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))))) as typeof fetch;
  const p = postChatStream("https://s.test/v1/chat", { model: "s2" }, {}, () => {}, ctl.signal, { attempts: 3 });
  ctl.abort();
  await assert.rejects(p, (e: unknown) => e instanceof DOMException && e.name === "AbortError");
  assert.equal(circuitSnapshot().find((c) => c.key === "s.test|s2"), undefined);
});
