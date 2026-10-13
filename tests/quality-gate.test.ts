import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import fixture from "./fixtures/gibberish-sample.json";
import { assessOutput, QUALITY_FAIL_MESSAGE, UNRELIABLE_MESSAGE } from "@/lib/orchestration/quality-gate";
import { engineDeps, orchestrate } from "@/lib/orchestration/orchestrator";
import { parseSanity } from "@/lib/orchestration/sanity";
import { FREE_FALLBACK_ORDER, FREE_SINGLE_PICK } from "@/lib/orchestration/live-catalog";
import { collection } from "@/lib/create/platform/store";
import type { KeplarEvent } from "@/lib/orchestration/types";

const rejected = (t: string, prompt = "summarize this") => assessOutput(t, { prompt });

test("gate: the production gibberish sample is rejected (and so are its variants)", () => {
  const v = rejected(fixture.text);
  assert.equal(v.ok, false);
  // the same word salad without the glued punctuation is still caught as non-words / incoherent
  const noGlue = "xells massiving this sax self summar along healthcare rigor ge in fortified overt along ells aellsells stuck at forcesellsells ellsellsells";
  assert.equal(rejected(noGlue).ok, false);
  // coherent tail does not rescue a junk head
  assert.equal(rejected("xells massiving this sax self summar along healthcare rigor ge in fortified overt along ells stuck at forces. What's on your mind? I'm ready to help with a short summary of whatever you'd like to share with me today.").ok, false);
});

test("gate: loops, empty output and character runs are rejected", () => {
  assert.equal(rejected("").ok, false);
  assert.equal(rejected("   \n ").ok, false);
  assert.equal(rejected("Sure thing ellsellsells and more").ok, false);
  assert.equal(rejected("The answer is " + "very ".repeat(10)).ok, false);
  assert.equal(rejected("Hello " + "a".repeat(40)).ok, false);
  assert.equal(rejected(("the cat sat on the mat and ").repeat(12)).ok, false, "phrase loop");
  assert.equal(rejected("Result: Paris,is.thecapital and the.city,iscalled something else entirely here").ok, false, "glued words");
  const para = "To reset the router, hold the reset button for ten seconds until the lights flash, then wait two minutes for it to restart fully. ";
  assert.equal(rejected("Here is how. " + para.repeat(6)).ok, false, "a paragraph pasted six times");
  assert.equal(rejected("I understand your question. " + "I am sorry but I cannot help with that request right now. ".repeat(8)).ok, false, "an apology loop");
});

test("gate: a long how-to guide that names the same parts often is good writing, not a loop", async () => {
  // A real answer from production (2026-10-12) to "how do I tie a bowline knot": "the working end" 13 times, "the standing part" 10.
  const { readFileSync } = await import("node:fs");
  assert.ok(rejected(readFileSync("tests/fixtures/bowline-guide.md", "utf8")).ok);
});

test("gate: normal answers pass (prose, short, math, code, JSON, lists, tables, URLs, other languages)", () => {
  const ok = (t: string, prompt = "explain") => assert.equal(assessOutput(t, { prompt }).ok, true, t.slice(0, 60));
  ok("Hi! What would you like to ask?", "hello");
  ok("4", "2+2");
  ok("17 × 23 = 391. Steps: 17×20 = 340, 17×3 = 51, and 340 + 51 = 391.", "17 times 23");
  ok("Jane Austen wrote Pride and Prejudice, and it was published in 1813. It follows Elizabeth Bennet and her complicated relationship with Mr. Darcy.", "who wrote pride and prejudice");
  ok("The Industrial Revolution began in Britain in the late 18th century. Machines replaced hand production and cities grew quickly. Living standards rose over time, though conditions were harsh at first.", "summarize");
  ok("```ts\nconst xs = [1, 2, 3].map((n) => n * 2);\nconsole.log(xs);\n```\nThis doubles every element and prints the array to the console for you.", "code");
  ok('{"topic":"Fusion by 2040","positions":[{"id":"P1","label":"Unlikely","summary":"Very unlikely by 2040."}]}', "classify");
  ok("- Apples\n- Oranges\n- Bananas\n- Pears\n\n| Fruit | Colour |\n|---|---|\n| Apple | Red |\n| Pear | Green |", "list fruit");
  ok("See https://example.org/docs/page.html and email team@keplar.one for the details you asked about, thanks for waiting.", "where are the docs");
  ok("Bonjour ! La capitale de la France est Paris, une ville célèbre pour sa cuisine, son histoire et ses musées.", "quelle est la capitale de la france");
  ok("La capital de España es Madrid, una ciudad conocida por su arte, su gastronomía y su vida nocturna muy animada.", "cual es la capital de espana");
  ok("東京は日本の首都であり、世界で最も人口の多い都市圏の一つです。多くの企業や大学があります。", "東京について");
  ok("Haha, that's funny! hahaha okay okay, I get the joke now and it was a good one honestly.", "tell me a joke");
  ok("Use `useEffect` with a cleanup function, call `setState` only when mounted, and prefer `useMemo` for derived values in your component.", "react tips");
  ok("The eigenvalue λ satisfies \\( \\det(A - \\lambda I) = 0 \\), so the characteristic polynomial determines it uniquely for the matrix.", "eigenvalues");
});

test("gate: false-positive rate on real technical prose (repo docs) stays under 2%", () => {
  let n = 0;
  let bad = 0;
  for (const f of readdirSync("docs").filter((x) => x.endsWith(".md"))) {
    for (const p of readFileSync(path.join("docs", f), "utf8").split(/\n\s*\n/)) {
      if (p.split(/\s+/).length < 15 || /^\s*(\||#)/.test(p)) continue; // tables and heading blocks are not answer prose
      n++;
      if (!assessOutput(p, { prompt: "explain this in detail please" }).ok) bad++;
    }
  }
  assert.ok(n > 100);
  assert.ok(bad / n < 0.02, `${bad}/${n} paragraphs rejected`);
});

/* ── through the real engine (stubbed network) ───────────────────────── */

const CLEAN = "The capital of France is Paris. It has been the capital for many centuries and is the country's largest city.";
function stubNetwork(replyFor: (slug: string) => string) {
  const real = globalThis.fetch;
  const seen: { slug: string; temperature: unknown }[] = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { model: string; temperature?: unknown };
    seen.push({ slug: body.model, temperature: body.temperature });
    return new Response(JSON.stringify({ model: body.model, choices: [{ message: { content: replyFor(body.model) }, finish_reason: "stop" }], usage: { prompt_tokens: 20, completion_tokens: 30, cost: 0 } }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { seen, restore: () => (globalThis.fetch = real) };
}
async function run(prompt: string) {
  const prev = { k: process.env.OPENROUTER_API_KEY, l: process.env.KEPLAR_LIVE_MODELS };
  process.env.OPENROUTER_API_KEY = "sk-or-test";
  process.env.KEPLAR_LIVE_MODELS = "1";
  try {
    const events: KeplarEvent[] = [];
    let deltas = "";
    for await (const e of orchestrate({ prompt, plan: "free", computeRemaining: 1e6 }, engineDeps({ keyTier: "free" })!)) {
      events.push(e);
      if (e.type === "delta") deltas += e.text;
    }
    return { events, deltas };
  } finally {
    for (const [k, v] of [["OPENROUTER_API_KEY", prev.k], ["KEPLAR_LIVE_MODELS", prev.l]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("engine (free): a gibberish answer from the first model is never shown; another model answers instead; temperature is pinned", async () => {
  const net = stubNetwork((slug) => (slug.includes("nemotron-3-super") ? fixture.text : CLEAN));
  try {
    const { events, deltas } = await run("What is the capital of France?");
    const answer = events.find((e) => e.type === "answer");
    assert.ok(answer && answer.type === "answer");
    assert.equal(answer.answer.markdown, CLEAN);
    assert.equal(deltas, CLEAN, "streamed text is exactly the answer (lossless chunk join)");
    assert.ok(!events.some((e) => e.type === "delta" && /xells|ells/.test(e.text)));
    assert.equal(net.seen[0].slug.includes("nemotron-3-super"), true, "benchmarked-clean model first");
    assert.ok(net.seen.length >= 2);
    assert.ok(net.seen.every((s) => s.temperature === 0.3), "free path pins a low temperature");
    // quality failure logged for /admin
    await new Promise((r) => setTimeout(r, 50));
    const calls = await collection<{ id: string; workspaceId: string; ok: boolean; reason: string; model: string }>("model_calls").listSystem((r) => r.reason.startsWith("quality:"));
    assert.ok(calls.some((c) => c.ok === false && c.model === "free:nemotron-3-super" && /^quality:/.test(c.reason)));
  } finally {
    net.restore();
  }
});

test("engine (free): when every model returns junk the user gets the clear 'couldn't produce a reliable answer' error, nothing else", async () => {
  const net = stubNetwork(() => fixture.text);
  try {
    const { events } = await run("What is the capital of France?");
    assert.ok(!events.some((e) => e.type === "answer"));
    assert.ok(!events.some((e) => e.type === "delta"));
    const err = events.find((e) => e.type === "error");
    assert.ok(err && err.type === "error");
    assert.equal(err.code, "no_response");
    assert.equal(err.message, UNRELIABLE_MESSAGE);
    assert.equal(err.retryable, true);
    assert.equal(err.charged, false);
  } finally {
    net.restore();
  }
});

test("free roster: benchmarked-clean models lead; the stalling/capacity-limited ones are demoted", () => {
  assert.deepEqual(FREE_SINGLE_PICK, ["free:nemotron-3-super", "free:qwen3.8-27b", "free:dots-3-note"]);
  const i = (id: string) => FREE_FALLBACK_ORDER.indexOf(id);
  assert.ok(i("free:nemotron-3.5-lightning") > i("free:gemma-4-26b-a4b"));
  assert.ok(i("free:nemotron-3-nano-omni") > i("free:nemotron-3.5-lightning") - 1);
  assert.ok(i("free:nemotron-3-super") < i("free:nemotron-3.5-lightning"));
  assert.equal(QUALITY_FAIL_MESSAGE.includes("quality check"), true);
});

test("sanity check reply parsing: only a clear OK/BAD counts", () => {
  assert.equal(parseSanity("OK"), "ok");
  assert.equal(parseSanity(" ok."), "ok");
  assert.equal(parseSanity("BAD - garbled"), "bad");
  assert.equal(parseSanity("I think so"), "unknown");
  assert.equal(parseSanity(""), "unknown");
});

test("router: an anonymous request on the free roster also gets the benchmarked-clean single model, not Lightning", async () => {
  const { CostAwareRouter } = await import("@/lib/orchestration/router");
  const { HeuristicClassifier } = await import("@/lib/orchestration/classifier");
  const { freeRoster } = await import("@/lib/orchestration/live-catalog");
  const req = { prompt: "summarize" };
  const plan = new CostAwareRouter(freeRoster).route(await new HeuristicClassifier().classify(req), req);
  assert.equal(plan.mode, "single");
  assert.equal(plan.panel[0].model.id, "free:nemotron-3-super");
});
