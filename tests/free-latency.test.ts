import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { engineDeps, orchestrate } from "@/lib/orchestration/orchestrator";
import { LatencyBudget } from "@/lib/orchestration/latency";
import type { KeplarAnswer } from "@/lib/orchestration/types";

/** `overlapped`: for a held call (see `hold`), whether the call it waited for started while it was still open. */
type Call = { kind: string; start: number; end: number; system: string; overlapped?: boolean };

/**
 * Runs one question through the live pipeline with a stubbed network that delays every call by `delay` ms, and returns the calls.
 * `hold: [a, b]` keeps call `a` open until a call of kind `b` has started (at most 10 s), so "b runs alongside a" does not depend on how
 * fast a busy machine gets to b. The held call records whether b started while it was open (`overlapped`); if b only starts once a has
 * finished, a waits the full 10 s and `overlapped` is false.
 */
async function run(plan: "free" | "plus", prompt: string, delay = 120, env: Record<string, string> = {}, hold?: [string, string]) {
  const realFetch = globalThis.fetch;
  const calls: Call[] = [];
  const t0 = Date.now();
  globalThis.fetch = (async (_u: string | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { model: string; messages: { role: string; content: string }[] };
    const sys = body.messages[0]?.content ?? "";
    const kind = sys.startsWith("You are Keplar's combined reviewer") ? "merged" : sys.startsWith("You are Keplar's response classifier") ? "extract" : sys.startsWith("You are Keplar's verifier") ? "verify" : sys.includes("writing a DRAFT") ? "draft" : sys.startsWith("You are Keplar's judge-tier synthesizer") ? "synth" : sys.startsWith("You are Keplar's final editor") ? "critique" : "panel";
    const c: Call = { kind, start: Date.now() - t0, end: 0, system: sys };
    calls.push(c);
    await new Promise((r) => setTimeout(r, delay));
    if (hold && kind === hold[0]) {
      for (const until = Date.now() + 10_000; !calls.some((x) => x.kind === hold[1]) && Date.now() < until; ) await new Promise((r) => setTimeout(r, 5));
      c.overlapped = calls.some((x) => x.kind === hold[1]);
    }
    let content: string;
    if (kind === "extract" || kind === "merged") {
      const n = (body.messages[1].content.match(/### R\d+/g) ?? []).length;
      content = JSON.stringify({ topic: "t", positions: [{ id: "P1", label: "8,849 m", summary: "About 8,849 m." }], responses: Array.from({ length: n }, (_, i) => ({ id: `R${i + 1}`, kind: "answer", position: "P1" })), claims: [{ text: "Everest is about 8,849 m", responses: ["R1", "R2"] }] });
      if (kind === "merged") content += "\n=====ANSWER=====\nMount Everest is about 8,849 meters (29,032 feet) tall.\nRESOLUTION: No disagreement.";
    } else if (kind === "verify") content = JSON.stringify({ checks: [], disputed: [] });
    else if (kind === "draft") content = "Draft: about 8,849 m.";
    else if (kind === "synth") content = "Mount Everest is about 8,849 meters (29,032 feet) tall.\nRESOLUTION: No disagreement.";
    else if (kind === "critique") content = "OK";
    else content = "Everest is about 8,849 meters tall, per the 2020 survey.";
    c.end = Date.now() - t0;
    return new Response(JSON.stringify({ model: body.model, choices: [{ message: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 50, completion_tokens: 30, cost: 0 } }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const prev = { k: process.env.KEPLAR_LIVE_MODELS, o: process.env.OPENROUTER_API_KEY };
  process.env.KEPLAR_LIVE_MODELS = "1";
  process.env.OPENROUTER_API_KEY = "sk-or-test";
  const prevEnv: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) { prevEnv[k] = process.env[k]; process.env[k] = v; }
  try {
    let answer: KeplarAnswer | null = null;
    const deps = engineDeps({ keyTier: plan === "free" ? "free" : "paid" })!;
    for await (const e of orchestrate({ prompt, plan, computeRemaining: 1e6 }, deps)) if (e.type === "answer") answer = e.answer;
    return { calls, answer: answer!, total: Date.now() - t0 };
  } finally {
    globalThis.fetch = realFetch;
    for (const [k, v] of Object.entries(prevEnv)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    if (prev.k === undefined) delete process.env.KEPLAR_LIVE_MODELS; else process.env.KEPLAR_LIVE_MODELS = prev.k;
    if (prev.o === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = prev.o;
  }
}

test("Free plan: one combined request classifies, reviews and writes after a 2-model panel (3 requests in all)", async () => {
  const { calls, answer } = await run("free", "How tall is Mount Everest?");
  const kinds = calls.map((c) => c.kind);
  assert.deepEqual([...kinds].sort(), ["merged", "panel", "panel"], kinds.join(","));
  const merged = calls.find((c) => c.kind === "merged")!;
  assert.ok(merged.start >= Math.max(...calls.filter((c) => c.kind === "panel").map((c) => c.end)) - 5, "it reads the finished panel");
  assert.match(answer.markdown, /8,849/);
  assert.equal(answer.verification.mode, "cross-model");
  assert.ok(answer.verification.reviewer, "a reviewer is named");
  assert.equal(answer.consensus.consulted, 2);
});

test("Free plan with KEPLAR_FREE_MERGED=0: the reviewer runs alongside the position extraction, and there is no separate draft call", async () => {
  const { calls, answer } = await run("free", "How tall is Mount Everest?", 120, { KEPLAR_FREE_MERGED: "0" }, ["extract", "verify"]);
  const kinds = calls.map((c) => c.kind);
  assert.ok(kinds.includes("extract") && kinds.includes("verify") && kinds.includes("synth"), kinds.join(","));
  assert.equal(kinds.includes("draft"), false, "no draft call on Free");
  const extract = calls.find((c) => c.kind === "extract")!;
  const verify = calls.find((c) => c.kind === "verify")!;
  const synth = calls.find((c) => c.kind === "synth")!;
  assert.ok(extract.overlapped, `reviewer started at ${verify.start}ms, while the extraction was still running (it ended at ${extract.end}ms)`);
  assert.ok(synth.start >= Math.max(extract.end, verify.end) - 5, "the writer waits for both");
  assert.match(synth.system, /quick lookup: answer in at most 120 words/, "a factual lookup asks for a short answer");
  assert.match(answer.markdown, /8,849/);
  assert.equal(answer.verification.mode, "cross-model");
  assert.match(answer.verification.summary, /responses against each other/);
  assert.ok(answer.verification.reviewer, "a reviewer is named");
});

test("Free plan is faster than the sequential order by about one model call (two waits became one, and no draft)", async () => {
  const { calls, total } = await run("free", "How tall is Mount Everest?", 150, { KEPLAR_FREE_MERGED: "0" });
  // panel (150) + extract||verify (150) + synth (150) = ~450ms plus overhead; the old order added the draft and the reviewer serially (>= 750ms).
  assert.ok(total < 700, `took ${total}ms for ${calls.length} calls`);
});

test("Paid plans keep the draft-first order: extraction, then the draft, then the reviewer reading it, then the writer", async () => {
  const { calls } = await run("plus", "How tall is Mount Everest?");
  const by = (k: string) => calls.find((c) => c.kind === k)!;
  assert.ok(by("draft"), "a draft call");
  assert.ok(by("extract").end <= by("draft").start + 5);
  assert.ok(by("draft").end <= by("verify").start + 5, "the reviewer reads the finished draft");
  assert.ok(by("verify").end <= by("synth").start + 5);
});

test("Free plan: a straggler gets 3.5 s once two models have answered (paid keeps 6 s)", () => {
  const free = new LatencyBudget(60_000, { graceMinMs: 3500 }).start(1_000_000);
  assert.equal(free.stragglerDeadline(2, 3, 1_002_000), 1_002_000 + 3500);
  const paid = new LatencyBudget(60_000).start(1_000_000);
  assert.equal(paid.stragglerDeadline(2, 3, 1_002_000), 1_002_000 + 6000);
});
