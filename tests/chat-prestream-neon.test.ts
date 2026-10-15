import "./setup";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { installFakeNeon } from "./helpers/fake-neon";
import { signIn } from "./helpers/session";
import { POST as keplarPOST } from "@/app/api/keplar/route";

// PERF-8: the independent reads before a chat turn's first byte run in parallel. Measured against Postgres semantics (PGlite behind a fake
// Neon endpoint) with a fixed per-query latency, as a Neon round trip has: the time until the response starts and the overlap of reads.
process.env.KEPLAR_FREE_DATA_COLLECTION = "deny";
Object.assign(process.env, { OPENROUTER_API_KEY: "sk-or-test", OPENAI_API_KEY: "sk-test", NVIDIA_API_KEY: "nvapi-test", KEPLAR_LIVE_MODELS: "1" });
const LATENCY = 25;
let fake: Awaited<ReturnType<typeof installFakeNeon>> = null;
let inFlight = 0;
let peak = 0;
let queries = 0;
/** Sequential round trips: each time the database goes from idle to busy (overlapping queries share one). */
let waves = 0;
before(async () => {
  fake = await installFakeNeon("ep-prestream.us-east-2.aws.neon.tech");
  if (!fake) return;
  process.env.DATABASE_URL = fake.url;
  const inner = globalThis.fetch;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    // Models: one clean line for every provider call (live-model env below).
    if (!url.includes("ep-prestream")) return new Response(JSON.stringify({ id: "x", model: "m", choices: [{ index: 0, message: { role: "assistant", content: "A list is mutable; a tuple is not. Example: [1, 2] vs (1, 2)." }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 8 } }), { status: 200, headers: { "content-type": "application/json" } });
    if (inFlight === 0) waves++;
    inFlight++;
    queries++;
    peak = Math.max(peak, inFlight);
    try {
      await new Promise((r) => setTimeout(r, LATENCY));
      return await inner(input, init);
    } finally {
      inFlight--;
    }
  }) as typeof fetch;
});
after(() => {
  fake?.restore();
  for (const k of ["OPENROUTER_API_KEY", "OPENAI_API_KEY", "NVIDIA_API_KEY", "KEPLAR_LIVE_MODELS"]) delete process.env[k];
});

let ipn = 0;
const ask = (cookie: string, prompt: string) => keplarPOST(new Request("https://keplar.one/api/keplar", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.77.0.${++ipn}`, cookie }, body: JSON.stringify({ prompt }) }));

test("postgres: a paid chat turn overlaps its independent reads before the first byte", async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const a = await signIn("prestream@example.com", "pro");
  await (await ask(a.cookie, "Warm up: what is the capital of France?")).text(); // schema, session and caches warmed
  peak = 0;
  queries = 0;
  waves = 0;
  const t0 = Date.now();
  const res = await ask(a.cookie, "Explain the difference between a list and a tuple in Python, with an example.");
  const ttfb = Date.now() - t0;
  const pre = { queries, peak, waves };
  await res.text();
  console.log(`[measure] time to response start: ${ttfb} ms with ${LATENCY} ms per query; ${pre.queries} queries before it in ${pre.waves} sequential round trips, up to ${pre.peak} at once`);
  assert.equal(res.status, 200);
  assert.ok(pre.peak >= 2, `independent reads overlap (peak ${pre.peak})`);
  // 13 sequential round trips before the change, 8 after (breaker/fan-out, context/project/personal and usage/window/extension reads one by one).
  assert.ok(pre.waves <= 10, `sequential round trips before the first byte: ${pre.waves}`);
});
