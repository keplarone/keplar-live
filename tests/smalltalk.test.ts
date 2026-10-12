import "./setup";
import { SMALLTALK_VOICE_FALLBACK } from "@/lib/persona";
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanSmallTalk, isSmallTalk, looksBroken, smallTalkKind, smallTalkModels, runSmallTalk } from "@/lib/orchestration/smalltalk";
import { engineDeps, orchestrate } from "@/lib/orchestration/orchestrator";
import { isFreeModel } from "@/lib/orchestration/free-guard";
import { catalogById } from "@/lib/orchestration/catalog";
import type { KeplarAnswer, KeplarEvent, KeplarRequest } from "@/lib/orchestration/types";

const talk = (prompt: string, extra: Partial<KeplarRequest> = {}) => isSmallTalk({ prompt, ...extra });

test("small talk: trivial chat is detected", () => {
  for (const p of ["hi", "Hi!", "hello", "Hey there", "hey keplar", "Thanks!", "thank you so much", "thx", "how are you doing", "How are you doing today?", "good morning", "Good evening!", "bye", "goodbye!", "see you later", "who are you", "Who are you?", "what's your name", "hi, how are you?", "hello, thanks", "ok thanks", "cool", "😊 hi"]) {
    assert.ok(talk(p), p);
  }
  assert.equal(smallTalkKind({ prompt: "who are you" }), "identity");
  assert.equal(smallTalkKind({ prompt: "hi, how are you?" }), "how-are-you");
  assert.equal(smallTalkKind({ prompt: "thanks" }), "thanks");
});

test("small talk: anything that could be a real question goes through full Keplar", () => {
  for (const p of [
    "hi, should I buy a house?",
    "what is 2+2",
    "thanks, but how do I fix this bug?",
    "hello can you explain quantum computing",
    "how are you different from ChatGPT",
    "how are you going to help me with taxes",
    "who are you voting for",
    "who was the first president",
    "good morning, plan my day",
    "hi 5",
    "hey, is it safe to take ibuprofen with alcohol",
    "bye the way what is a mortgage",
    "thanks for the help, now write an email to my landlord",
    "hello `code`",
    "https://example.com hi",
    "",
    "   ",
    "hi ".repeat(40),
  ]) {
    assert.equal(talk(p), false, p);
  }
});

test("small talk: a greeting word run into another pleasantry, with no comma, is still small talk (never a paid panel)", () => {
  assert.equal(smallTalkKind({ prompt: "hey how are you" }), "how-are-you");
  assert.equal(smallTalkKind({ prompt: "hi there how's it going" }), "how-are-you");
  assert.equal(smallTalkKind({ prompt: "hello who are you" }), "identity");
  assert.equal(smallTalkKind({ prompt: "hi thanks" }), "thanks");
  for (const p of ["gm", "bonjour", "Salut!", "ciao"]) assert.equal(smallTalkKind({ prompt: p }), "greeting", p);
  // a greeting word followed by a real request still goes to the full engine
  for (const p of ["hey how are you different from ChatGPT", "hi explain quantum tunneling", "hello world in python", "hey how do I fix this", "gm plan my day"]) {
    assert.equal(talk(p), false, p);
  }
});

test("small talk: attachments, media and modes disable it", () => {
  assert.equal(talk("hi", { attachments: [{ name: "a.pdf", size: 10, type: "application/pdf" }] }), false);
  assert.equal(talk("hi", { media: { images: [{ name: "a.png", mime: "image/png", dataUrl: "data:image/png;base64,AAAA" }] } as unknown as KeplarRequest["media"] }), false);
  for (const m of ["web", "deepResearch", "create", "agent"] as const) assert.equal(talk("hi", { modes: { [m]: true } }), false, m);
  assert.equal(talk("hi", { modes: { web: false, deepResearch: false, create: false, agent: false } }), true);
});

test("small talk: the model list is free-only", () => {
  const models = smallTalkModels();
  assert.ok(models.length >= 3);
  for (const m of models) assert.ok(isFreeModel(catalogById.get(m.id) ?? m), m.id);
});

const KEYS = { OPENROUTER_API_KEY: "sk-or-test", KEPLAR_LIVE_MODELS: "1" };
function withEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) { prev[k] = process.env[k]; if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  return fn().finally(() => { for (const [k, v] of Object.entries(prev)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
}

async function collect(req: KeplarRequest, tier: "free" | "paid") {
  const events: KeplarEvent[] = [];
  const deps = engineDeps({ keyTier: tier })!;
  for await (const e of orchestrate(req, deps)) events.push(e);
  return events;
}

test("small talk on Pro: exactly one free model call, no panel, verifier, judge or comparison", async () => {
  const real = globalThis.fetch;
  const calls: { model: string; body: Record<string, unknown> }[] = [];
  globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { model: string };
    calls.push({ model: body.model, body });
    return new Response(JSON.stringify({ model: body.model, choices: [{ message: { content: "Hi! How can I help?" }, finish_reason: "stop" }], usage: { prompt_tokens: 20, completion_tokens: 6, cost: 0 } }), { status: 200 });
  }) as typeof fetch;
  try {
    for (const tier of ["paid", "free"] as const) {
      calls.length = 0;
      const events = await withEnv(KEYS, () => collect({ prompt: "hi", plan: tier === "paid" ? "pro" : "free", computeRemaining: 1e6 }, tier));
      assert.equal(calls.length, 1, `${tier}: one call`);
      assert.match(calls[0].model, /:free$/);
      const types = events.map((e) => e.type);
      assert.ok(types.includes("smalltalk"));
      for (const banned of ["stage", "model", "disagreement", "limit", "verify"]) assert.ok(!types.includes(banned as KeplarEvent["type"]), `${tier}: no ${banned}`);
      const a = (events.find((e) => e.type === "answer") as { answer: KeplarAnswer }).answer;
      assert.equal(a.smalltalk, true);
      assert.equal(a.markdown, "Hi! How can I help?");
      assert.equal(a.compute.units, 0);
      assert.equal(a.models.length, 0);
      assert.equal(a.disagreements.length, 0);
    }
  } finally {
    globalThis.fetch = real;
  }
});

test("small talk: when every free model fails the user still gets a friendly line, not an error", async () => {
  const real = globalThis.fetch;
  let n = 0;
  globalThis.fetch = (async () => { n++; return new Response(JSON.stringify({ error: { code: 429 } }), { status: 429 }); }) as typeof fetch;
  try {
    const events = await withEnv(KEYS, () => collect({ prompt: "thanks!", plan: "plus", computeRemaining: 1e6 }, "paid"));
    assert.ok(n >= 1);
    assert.ok(!events.some((e) => e.type === "error"));
    const a = (events.find((e) => e.type === "answer") as { answer: KeplarAnswer }).answer;
    assert.equal(a.markdown, SMALLTALK_VOICE_FALLBACK.thanks);
  } finally {
    globalThis.fetch = real;
  }
});

test("a real question still goes through the full engine (panel, more than one call)", async () => {
  const real = globalThis.fetch;
  const models = new Set<string>();
  globalThis.fetch = (async (_u: string | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { model: string };
    models.add(body.model);
    return new Response(JSON.stringify({ model: body.model, choices: [{ message: { content: "An answer." }, finish_reason: "stop" }], usage: { prompt_tokens: 20, completion_tokens: 6, cost: 0 } }), { status: 200 });
  }) as typeof fetch;
  try {
    const events = await withEnv(KEYS, () => collect({ prompt: "Should a small bakery switch to a four-day week? Weigh the trade-offs.", plan: "free", computeRemaining: 1e6 }, "free"));
    assert.ok(events.some((e) => e.type === "stage"));
    assert.ok(models.size >= 2);
    const a = (events.find((e) => e.type === "answer") as { answer: KeplarAnswer } | undefined)?.answer;
    assert.ok(a && !a.smalltalk);
  } finally {
    globalThis.fetch = real;
  }
});

test("small talk: reasoning artifacts are stripped and garbled replies are rejected", () => {
  assert.equal(cleanSmallTalk("<think>The user said hi. I should greet.</think>\nHi! How can I help?"), "Hi! How can I help?");
  assert.equal(cleanSmallTalk("The user said hi.</think> Hello there!"), "Hello there!");
  assert.equal(cleanSmallTalk("<thinking>still going and never closed"), "");
  assert.equal(cleanSmallTalk('  "Hi there! How are you doing today? I am happy to hel'), "Hi there! How are you doing today?");
  assert.equal(cleanSmallTalk("Hello! 😊"), "Hello! 😊");
  assert.ok(looksBroken('Hey! Nice to meet you said "hi" 2. - how\'s it going?', "hi"));
  assert.ok(looksBroken("The user said hi, so I should reply.", "hi"));
  assert.ok(looksBroken("", "hi"));
  assert.ok(!looksBroken("Hi! How can I help you today?", "hi"));
  assert.ok(!looksBroken("I'm doing well, thanks for asking! How are you?", "how are you doing"));
});

test("small talk: the request carries the clean system prompt, reasoning excluded, small token cap", async () => {
  const real = globalThis.fetch;
  type Sent = { messages: { role: string; content: string }[]; reasoning?: unknown; max_tokens?: number };
  const sent: Sent[] = [];
  globalThis.fetch = (async (_u: string | URL, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body ?? "{}")) as Sent);
    return new Response(JSON.stringify({ model: "x", choices: [{ message: { content: "Hi!" }, finish_reason: "stop" }] }), { status: 200 });
  }) as typeof fetch;
  try {
    await withEnv(KEYS, () => collect({ prompt: "hi", plan: "free", computeRemaining: 1e6 }, "free"));
    assert.ok(sent.length >= 1);
    const b = sent[0];
    assert.match(b.messages[0].content, /^You are Keplar, a warm, quick-witted assistant\. Reply in one or two short sentences, with a light touch of wit when it fits\./);
    assert.match(b.messages[0].content, /sharp, warm, curious person/);
    assert.deepEqual(b.reasoning, { effort: "none", exclude: true });
    assert.ok((b.max_tokens ?? 0) <= 256);
  } finally {
    globalThis.fetch = real;
  }
});

test("small talk: a garbled or think-leaking first model falls through to the next; a hung model is cut off", async () => {
  const real = globalThis.fetch;
  const seen: string[] = [];
  globalThis.fetch = ((_u: string | URL, init?: RequestInit) => {
    const model = (JSON.parse(String(init?.body ?? "{}")) as { model: string }).model;
    seen.push(model);
    const reply = (content: string) => new Response(JSON.stringify({ model, choices: [{ message: { content }, finish_reason: "stop" }] }), { status: 200 });
    if (seen.length === 1) return Promise.resolve(reply('Hey! Nice to meet you said "hi" 2. - how\'s it going?'));
    if (seen.length === 2) return new Promise<Response>((_res, rej) => init?.signal?.addEventListener("abort", () => rej(new DOMException("Aborted", "AbortError"))));
    return Promise.resolve(reply("<think>user greeted</think>Hello! What can I help with?"));
  }) as typeof fetch;
  try {
    const t0 = Date.now();
    const events = await withEnv(KEYS, () => collect({ prompt: "hi", plan: "plus", computeRemaining: 1e6 }, "paid"));
    const a = (events.find((e) => e.type === "answer") as { answer: KeplarAnswer }).answer;
    assert.equal(a.markdown, "Hello! What can I help with?");
    assert.ok(Date.now() - t0 < 5000, "fast: the hung model does not hold the reply");
    assert.ok(seen.length >= 3);
  } finally {
    globalThis.fetch = real;
  }
});

test("small talk: every model hanging gives the static line within the total budget", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = ((_u: string | URL, init?: RequestInit) => new Promise<Response>((_res, rej) => init?.signal?.addEventListener("abort", () => rej(new DOMException("Aborted", "AbortError"))))) as typeof fetch;
  try {
    const events: KeplarEvent[] = [];
    const t0 = Date.now();
    await withEnv(KEYS, async () => {
      const deps = engineDeps({ keyTier: "free" })!;
      for await (const e of runSmallTalk({ prompt: "good morning", plan: "free", computeRemaining: 1e6 }, { registry: deps.registry!, perModelMs: 150, staggerMs: 50, timeoutMs: 600 })) events.push(e);
    });
    assert.ok(Date.now() - t0 < 2000);
    const a = (events.find((e) => e.type === "answer") as { answer: KeplarAnswer }).answer;
    assert.equal(a.markdown, SMALLTALK_VOICE_FALLBACK.greeting);
  } finally {
    globalThis.fetch = real;
  }
});
