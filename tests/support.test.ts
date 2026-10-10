import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { SUPPORT_FALLBACK, isSupportRequest, looksLeaky, runSupport } from "@/lib/orchestration/support";
import { orchestrate } from "@/lib/orchestration/orchestrator";
import { smallTalkModels } from "@/lib/orchestration/smalltalk";
import type { KeplarEvent, KeplarRequest } from "@/lib/orchestration/types";
import { POST as keplarPOST } from "@/app/api/keplar/route";

type Once = (i: { model: { id: string }; prompt: string; system?: string; signal?: AbortSignal }) => Promise<{ ok: boolean; text?: string; reason?: string }>;
const reg = (once: Once) => ({ once } as never);
const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((res, rej) => { const t = setTimeout(res, ms); signal?.addEventListener("abort", () => { clearTimeout(t); rej(new DOMException("aborted", "AbortError")); }, { once: true }); });
const isWriter = (i: { system?: string }) => /final writer/.test(i.system ?? "");
const req = (prompt: string, mood: string): KeplarRequest => ({ prompt, understanding: { intent: "plain", crossCheck: false, mood, interpretation: null } });
async function collect(g: AsyncGenerator<KeplarEvent>) { const out: KeplarEvent[] = []; for await (const e of g) out.push(e); return out; }
const answerOf = (ev: KeplarEvent[]) => { const a = ev.find((e) => e.type === "answer"); return a && a.type === "answer" ? a.answer : undefined; };

const DRAFT_A = "That sounds like a lot with the exam so close, and I'm sorry you're feeling this much pressure. Pick the three topics most likely to come up, spend the next hour on the first one, then sleep. A rested brain recalls more than a tired one.";
const DRAFT_B = "I can hear how stressed you are, and honestly that's understandable the night before. Start with the weakest topic you can still fix in an hour, write a one-page summary of it, and stop by midnight so you can rest.";
const MERGED = "That's a lot to carry the night before an exam, and I'm sorry it's landed on you like this. Here's a way to use tonight: pick the three topics most likely to come up, give the weakest one an hour with a one-page summary, then stop by midnight. A rested brain recalls more than a tired one, and I'm here if you want to talk through the first topic.";

test("supportive path: two drafts in parallel, one writer merges them; a plain reply, no charge, no consensus card", async () => {
  const calls: { writer: boolean; model: string; prompt: string }[] = [];
  const registry = reg(async (i) => {
    calls.push({ writer: isWriter(i), model: i.model.id, prompt: i.prompt });
    if (isWriter(i)) return { ok: true, text: `Certainly! ${MERGED}` };
    return { ok: true, text: i.model.id === smallTalkModels()[0].id ? DRAFT_A : DRAFT_B };
  });
  const ev = await collect(runSupport(req("I'm so stressed, my exam is tomorrow and I haven't studied", "stressed"), { registry }));
  assert.equal(ev[0].type, "smalltalk", "shown as a plain reply");
  const a = answerOf(ev)!;
  assert.equal(a.smalltalk, true);
  assert.equal(a.compute.units, 0);
  assert.equal(a.markdown, MERGED, "the writer's text, with the stock opener removed");
  const drafts = calls.filter((c) => !c.writer);
  const writers = calls.filter((c) => c.writer);
  assert.equal(drafts.length, 2);
  assert.notEqual(drafts[0].model, drafts[1].model, "two different models");
  assert.equal(writers.length, 1);
  assert.match(writers[0].prompt, /Draft A:[\s\S]*Draft B:/);
  assert.ok(a.markdown.split(/\s+/).length >= 45, "fuller than a one-line reply");
  assert.equal(ev.filter((e) => e.type === "delta").map((e) => (e as { text: string }).text).join(""), a.markdown);
});

test("a slow second draft is not waited for: one good draft plus the grace period, and that draft is the reply", async () => {
  const registry = reg(async (i) => {
    if (i.model.id === smallTalkModels()[0].id) return { ok: true, text: DRAFT_A };
    await wait(5000, i.signal); // never answers in time
    return { ok: true, text: DRAFT_B };
  });
  const t0 = Date.now();
  const ev = await collect(runSupport(req("I'm so stressed, my exam is tomorrow", "stressed"), { registry, graceMs: 80, standInMs: 60, draftMs: 400 }));
  assert.ok(Date.now() - t0 < 1500, `took ${Date.now() - t0}ms`);
  assert.equal(answerOf(ev)!.markdown, DRAFT_A);
});

test("a failed first model is replaced by a stand-in; a failed writer falls back to the fuller draft", async () => {
  const models = smallTalkModels();
  const registry = reg(async (i) => {
    if (isWriter(i)) return { ok: false, reason: "error" };
    if (i.model.id === models[0].id) return { ok: false, reason: "rate_limited" };
    return { ok: true, text: i.model.id === models[1].id ? DRAFT_B : DRAFT_A };
  });
  const ev = await collect(runSupport(req("ugh this is still not working", "frustrated"), { registry, graceMs: 50 }));
  const text = answerOf(ev)!.markdown;
  assert.ok(text === DRAFT_A || text === DRAFT_B);
  assert.ok(text.length > 100);
});

test("every model busy: a kind fixed reply per mood, never an error; crisis names a crisis line", async () => {
  const registry = reg(async () => ({ ok: false, reason: "error" }));
  for (const mood of ["stressed", "sad", "excited", "frustrated", "crisis"] as const) {
    const a = answerOf(await collect(runSupport(req("x", mood), { registry, timeoutMs: 500 })))!;
    assert.equal(a.markdown, SUPPORT_FALLBACK[mood]);
    assert.doesNotMatch(a.markdown, /\bI(?:'m| am) (?:a )?(?:human|person)\b/i);
  }
  assert.match(SUPPORT_FALLBACK.crisis, /988/);
});

test("leaked reasoning and junk are rejected; a draft that claims to be human is rewritten by polish", async () => {
  assert.equal(looksLeaky("The user is stressed about an exam and wants help studying tonight.", "x"), true);
  assert.equal(looksLeaky("<think>hmm</think>ok", "x"), true);
  assert.equal(looksLeaky(DRAFT_A, "I'm stressed"), false);
  const registry = reg(async (i) => ({ ok: true, text: isWriter(i) ? "As a person, I know exactly how you feel. I'm a human too, and I get it. Take a breath and start with the first topic for an hour, then rest." : DRAFT_A }));
  const a = answerOf(await collect(runSupport(req("I'm so stressed", "stressed"), { registry })))!;
  assert.doesNotMatch(a.markdown, /\bI(?:'m| am) a human\b/i);
});

test("who gets the supportive path: a feeling and no task; a task with a feeling goes to the full engine", () => {
  const yes = ["I'm so stressed, my exam is tomorrow and I haven't studied", "I got the job!!! I can't believe it", "my dog passed away yesterday and I feel so empty", "ugh this is still not working and I've tried everything", "I don't want to be here anymore"];
  const moods: Record<string, string> = { "I'm so stressed, my exam is tomorrow and I haven't studied": "stressed", "I got the job!!! I can't believe it": "excited", "my dog passed away yesterday and I feel so empty": "sad", "ugh this is still not working and I've tried everything": "frustrated", "I don't want to be here anymore": "crisis" };
  for (const p of yes) assert.equal(isSupportRequest(req(p, moods[p])), true, p);
  assert.equal(isSupportRequest(req("I'm frustrated, my python script throws a KeyError, how do I fix it?", "frustrated")), false);
  assert.equal(isSupportRequest(req("I'm so stressed. What is the capital of Australia?", "stressed")), false);
  assert.equal(isSupportRequest(req("I'm stressed, can you draft an email to my professor asking for an extension", "stressed")), false);
  assert.equal(isSupportRequest(req("how tall is mount everest", "neutral")), false, "no mood, no support path");
  assert.equal(isSupportRequest({ ...req("I'm so stressed", "stressed"), attachments: [{ name: "a.pdf", size: 1, type: "application/pdf" }] }), false);
  assert.equal(isSupportRequest({ ...req("I'm so stressed", "stressed"), modes: { web: true } }), false);
  assert.equal(isSupportRequest({ prompt: "I'm so stressed" }), false, "understanding sets the mood; without it nothing changes");
});

test("orchestrate: a stressed message is answered by the supportive path before the panel (the panel is never called)", async () => {
  const registry = reg(async (i) => ({ ok: true, text: isWriter(i) ? MERGED : DRAFT_A }));
  const deps = { smallTalk: registry, registry: { generate: async () => { throw new Error("the panel must not run"); } } } as never;
  const ev = await collect(orchestrate(req("I'm so stressed, my exam is tomorrow and I haven't studied", "stressed"), deps));
  assert.equal(ev.some((e) => e.type === "stage"), false, "no panel stages");
  assert.equal(answerOf(ev)!.markdown, MERGED);
});

test("route: a stressed message with live models stubbed gets two drafts and a writer (3 model calls), as a plain reply", async () => {
  const realFetch = globalThis.fetch;
  process.env.KEPLAR_LIVE_MODELS = "1";
  process.env.OPENROUTER_API_KEY = "sk-or-test";
  process.env.OPENROUTER_FREE_API_KEY = "sk-or-free-test";
  let modelCalls = 0;
  let writerSeen = false;
  globalThis.fetch = (async (_u: string | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { model: string; messages?: { role: string; content: string }[] };
    modelCalls++;
    const sys = body.messages?.find((m) => m.role === "system")?.content ?? "";
    const writer = /final writer/.test(sys);
    if (writer) writerSeen = true;
    return new Response(JSON.stringify({ model: body.model, choices: [{ message: { content: writer ? MERGED : DRAFT_A }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0 } }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const res = await keplarPOST(new Request("https://keplar.one/api/keplar", { method: "POST", headers: { "content-type": "application/json", origin: "https://keplar.one", "x-forwarded-for": "10.99.1.1" }, body: JSON.stringify({ prompt: "I'm so stressed, my exam is tomorrow and I haven't studied", history: [] }) }));
    const events = (await res.text()).trim().split("\n").map((l) => JSON.parse(l) as KeplarEvent);
    const a = answerOf(events)!;
    assert.ok(a, "an answer");
    assert.equal(a.smalltalk, true);
    assert.ok(writerSeen, "a writer call");
    assert.ok(modelCalls >= 3, `model calls ${modelCalls}`);
    assert.equal(a.markdown, MERGED);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.KEPLAR_LIVE_MODELS;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_FREE_API_KEY;
  }
});
