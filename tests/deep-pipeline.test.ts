import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { engineDeps, orchestrate } from "@/lib/orchestration/orchestrator";
import { sameAnswer } from "@/lib/orchestration/live-synthesizer";
import type { KeplarAnswer, KeplarRequest } from "@/lib/orchestration/types";

const FAKE = { OPENROUTER_API_KEY: "sk-or-test", OPENAI_API_KEY: "sk-test", NVIDIA_API_KEY: "nvapi-test", KEPLAR_LIVE_MODELS: "1" };
async function withEnv<T>(vars: Record<string, string>, fn: () => Promise<T>): Promise<T> {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) { prev[k] = process.env[k]; process.env[k] = v; }
  try { return await fn(); } finally { for (const [k, v] of Object.entries(prev)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
}

type Calls = { sys: string; user: string }[];
function stub(editor: string, synth: string, calls: Calls) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    const body = JSON.parse(String(init?.body ?? "{}")) as { model: string; messages: { role: string; content: string }[] };
    const sys = body.messages[0].content;
    calls.push({ sys, user: body.messages[1]?.content ?? "" });
    if (u.includes("nvidia")) return new Response("{}", { status: 403 });
    let content: string;
    if (sys.startsWith("You are Keplar's response classifier")) {
      const n = (body.messages[1].content.match(/### R\d+/g) ?? []).length;
      content = JSON.stringify({ topic: "Quicksort", positions: [{ id: "P1", label: "Quadratic worst case", summary: "Worst case is O(n^2)." }], responses: Array.from({ length: n }, (_, i) => ({ id: `R${i + 1}`, kind: "answer", position: "P1" })), claims: [{ text: "The worst case is quadratic", responses: ["R1", "R2"] }] });
    } else if (sys.startsWith("You are Keplar's verifier")) content = JSON.stringify({ checks: [], disputed: [] });
    else if (sys.startsWith("You are Keplar's final editor")) content = editor;
    else if (sys.startsWith("You are Keplar's judge-tier synthesizer writing a DRAFT")) content = "Draft: quadratic worst case.";
    else if (sys.startsWith("You are Keplar's judge-tier synthesizer")) content = synth;
    else content = `Panel answer from ${body.model}: the worst case is quadratic when pivots are bad.`;
    return new Response(JSON.stringify({ model: body.model, choices: [{ message: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 50, cost: 0.0001 } }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return () => { globalThis.fetch = realFetch; };
}

async function run(req: KeplarRequest) {
  let a: KeplarAnswer | null = null;
  const types: string[] = [];
  for await (const e of orchestrate(req, engineDeps()!)) { types.push(e.type); if (e.type === "answer") a = e.answer; }
  return { a: a!, types };
}

const HARD = "Explain the time complexity of quicksort and why the worst case happens, step by step, design a pivot strategy that avoids it, and discuss the trade-offs of each approach in practice.";
const SYNTH = "Certainly! Quicksort degrades to quadratic time when the pivots split the array badly, for example on sorted input with a first-element pivot. Random or median-of-three pivots make that very unlikely in practice. I hope this helps!\nRESOLUTION: No disagreement.";

test("DEEP: a hard question gets a wide panel, a self-critique pass, polish on the final text, and a real reasoning summary", async () => {
  const calls: Calls = [];
  const revised = "Quicksort degrades to quadratic time when the pivots split the array badly, for instance sorted input with a first-element pivot. Random or median-of-three pivots make that very unlikely in practice, so I'd reach for one of those.";
  const restore = stub(revised, SYNTH, calls);
  try {
    const { a } = await withEnv(FAKE, () => run({ prompt: HARD, plan: "pro", computeRemaining: 1e6 }));
    assert.ok(calls.some((c) => c.sys.startsWith("You are Keplar's final editor")), "the self-critique pass ran");
    assert.ok(a.consensus.consulted >= 4, `panel ${a.consensus.consulted}`);
    assert.match(a.markdown, /median-of-three/);
    assert.match(a.markdown, /I'd reach for one of those/, "the editor's version is used");
    assert.doesNotMatch(a.markdown, /^Certainly/i);
    assert.doesNotMatch(a.markdown, /hope this helps/i);
    assert.doesNotMatch(a.markdown, /RESOLUTION/);
    // a real summary, not the placeholder
    assert.match(a.reasoning, /I asked \d+ models/);
    assert.match(a.reasoning, /self-review tightened it/);
    assert.doesNotMatch(a.reasoning, /How the answer was formed/);
    // the tone layer rides on the synthesis call
    assert.ok(calls.filter((c) => c.sys.startsWith("You are Keplar's judge-tier synthesizer")).every((c) => /thoughtful, warm person/.test(c.sys)));
  } finally { restore(); }
});

test("DEEP: an editor reply that is unrelated to the answer is ignored (the original stands)", async () => {
  const calls: Calls = [];
  const restore = stub("Here is a poem about autumn leaves and quiet streets at dusk, rewritten completely.", SYNTH, calls);
  try {
    const { a } = await withEnv(FAKE, () => run({ prompt: HARD, plan: "pro", computeRemaining: 1e6 }));
    assert.match(a.markdown, /quadratic time/);
    assert.doesNotMatch(a.markdown, /autumn/);
    assert.match(a.reasoning, /found nothing to change/);
  } finally { restore(); }
});

test("sameAnswer: edits keep the answer, unrelated text does not", () => {
  assert.equal(sameAnswer("Quicksort is quadratic with bad pivots.", "Quicksort turns quadratic when pivots are bad."), true);
  assert.equal(sameAnswer("Quicksort is quadratic with bad pivots.", "Autumn leaves fall quietly tonight."), false);
});

test("a short resolved message ('chatgpt') asks two models and a check, not one, and the reasoning says how it was read", async () => {
  const calls: Calls = [];
  const restore = stub("OK", "ChatGPT is OpenAI's AI assistant. Keplar One sits alongside it as a multi-model layer.\nRESOLUTION: No disagreement.", calls);
  try {
    const req: KeplarRequest = {
      prompt: "Give a short, useful overview of ChatGPT (a AI assistant from OpenAI): what it is, who makes it.",
      plan: "plus", computeRemaining: 1e6,
      understanding: { intent: "brand", crossCheck: true, mood: "neutral", interpretation: "I'm reading \"chatgpt\" as a request for a quick overview of ChatGPT. Tell me if you meant something else." },
    };
    const { a, types } = await withEnv(FAKE, () => run(req));
    assert.ok(types.includes("capabilities"));
    assert.equal(a.consensus.consulted, 2);
    assert.match(a.reasoning, /I read "chatgpt" as a request for a quick overview of ChatGPT\./);
    assert.ok(!calls.some((c) => c.sys.startsWith("You are Keplar's final editor")), "no editor pass on a moderate question");
  } finally { restore(); }
});
