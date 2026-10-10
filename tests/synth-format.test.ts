import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { freeRoster } from "@/lib/orchestration/live-catalog";
import { ModelSynthesizer, SYNTH_SYSTEM_PROMPT } from "@/lib/orchestration/live-synthesizer";
import { BASE_SYSTEM_PROMPT, FORMAT_STYLE } from "@/lib/orchestration/providers/shared";
import { EvidenceWeightedComparator } from "@/lib/orchestration/comparator";
import { LatencyBudget } from "@/lib/orchestration/latency";
import type { KeplarAnswer, ProviderResult } from "@/lib/orchestration/types";

test("the prompts keep the shape of the request: lists stay lists, code stays in fenced blocks, no invented 'sources'", () => {
  assert.ok(BASE_SYSTEM_PROMPT.includes(FORMAT_STYLE));
  for (const p of [FORMAT_STYLE, SYNTH_SYSTEM_PROMPT]) {
    assert.match(p, /numbered list/);
    assert.match(p, /fenced code block/);
  }
  assert.match(SYNTH_SYSTEM_PROMPT, /Never squeeze a list into one paragraph/);
  assert.match(SYNTH_SYSTEM_PROMPT, /no outside sources/i);
  assert.match(SYNTH_SYSTEM_PROMPT, /do not report it as a disagreement/);
});

test("a slow written synthesis does not hold a finished panel: the best-supported model's own answer is shown, and it says so", async () => {
  const [m1, m2, m3] = freeRoster;
  const registry = {
    generate: (input: { signal?: AbortSignal }) =>
      new Promise((_, reject) => input.signal?.addEventListener("abort", () => reject(new DOMException("timed out", "TimeoutError")))),
  } as never;
  const stances = ["postgres", "postgres", "nosql"];
  const texts = ["1. Use Postgres.\n2. Add an index.", "Postgres, with an index.", "Use a document store."];
  const results: ProviderResult[] = [m1, m2, m3].map((m, i) => ({ ok: true, modelId: m.id, stance: stances[i], claims: [], text: texts[i], latencyMs: 1, usage: { inputTokens: 1, outputTokens: 1 } }));
  const comparison = new EvidenceWeightedComparator().compare(results);
  const s = new ModelSynthesizer(registry, m1, new LatencyBudget(60_000).start());
  s.synthCapMs = 40;
  const plan = { mode: "consensus", panel: [m1, m2, m3].map((model) => ({ model, slot: "panel", covers: "Reasoning", reason: "" })), verifier: null, judge: null, estimate: { breakdown: [] }, rationale: "" } as never;
  const verification = { mode: "cross-model", checks: [], disputed: [], checked: 0, supported: 0, removed: [], notes: [] } as never;
  const classification = { kind: "general", complexity: "moderate", capabilities: [], estimatedInputTokens: 1, estimatedOutputTokens: 1, needsWeb: false, rationale: "" } as never;
  const t0 = Date.now();
  const keepAlive = setInterval(() => {}, 20); // AbortSignal.timeout timers are unref'd: keep the event loop alive while the synthesis waits for its cap
  const out = (await s.synthesize({ req: { prompt: "pg or nosql?", plan: "free" }, classification, plan, results, comparison, verification, onDelta: () => {}, signal: undefined } as never)) as unknown as KeplarAnswer;
  clearInterval(keepAlive);
  assert.ok(Date.now() - t0 < 5000, "gave up at the cap, not at the whole budget");
  assert.match(out.markdown, /Postgres/);
  assert.ok(!/Leading position/.test(out.markdown), "not a list of positions");
  assert.ok(out.verification.notes.some((n) => /final write-up (was slow|was not available)/.test(n)), out.verification.notes.join("|"));
});

function unanimousRun(opts: { plan: "free" | "lite"; preferred?: string; checks?: unknown[]; stances?: string[] }) {
  const [m1, m2, m3] = freeRoster;
  let calls = 0;
  const registry = { generate: async () => { calls++; return { ok: true, text: "Written together.\n\nRESOLUTION: No disagreement.", model: m1, modelId: m1.id, latencyMs: 1, usage: { inputTokens: 1, outputTokens: 1 } }; } } as never;
  const stances = opts.stances ?? ["same", "same", "same"];
  const texts = ["First model's own reply.", "Second.", "Third."];
  const results: ProviderResult[] = [m1, m2, m3].map((m, i) => ({ ok: true, modelId: m.id, stance: stances[i], claims: [], text: texts[i], latencyMs: 1, usage: { inputTokens: 1, outputTokens: 1 } }));
  const comparison = new EvidenceWeightedComparator().compare(results);
  const s = new ModelSynthesizer(registry, m1, new LatencyBudget(60_000).start());
  const plan = { mode: "consensus", panel: [m1, m2, m3].map((model) => ({ model, slot: "panel", covers: "Reasoning", reason: "" })), verifier: null, judge: null, estimate: { breakdown: [] }, rationale: "" } as never;
  const verification = { mode: "cross-model", checks: opts.checks ?? [], disputed: [], checked: 0, supported: 0, removed: [], notes: [] } as never;
  const classification = { kind: "general", complexity: "moderate", capabilities: [], estimatedInputTokens: 1, estimatedOutputTokens: 1, needsWeb: false, rationale: "" } as never;
  const go = async () => (await s.synthesize({ req: { prompt: "q", plan: opts.plan }, classification, plan, results, comparison, verification, preferredModelId: opts.preferred === "m1" ? m1.id : undefined, onDelta: () => {}, signal: undefined } as never)) as unknown as KeplarAnswer;
  return { go, calls: () => calls, s };
}

test("Free, all models took the same position, nothing flagged: the reply already on screen is kept (no extra model call)", async () => {
  const r = unanimousRun({ plan: "free", preferred: "m1" });
  const out = await r.go();
  assert.equal(r.calls(), 0);
  assert.equal(r.s.keptReply, true);
  assert.match(out.markdown, /First model's own reply/);
});

test("the written synthesis still runs when the plan is paid, a split exists, a check was flagged, or no leader reply is known", async () => {
  for (const o of [
    { plan: "lite" as const, preferred: "m1" },
    { plan: "free" as const, preferred: "m1", stances: ["a", "a", "b"] },
    { plan: "free" as const, preferred: "m1", checks: [{ kind: "reasoning", finding: "x", models: [], outcome: "revised", resolution: "y" }] },
    { plan: "free" as const },
  ]) {
    const r = unanimousRun(o);
    const out = await r.go();
    assert.ok(r.calls() >= 1, JSON.stringify(o));
    assert.equal(r.s.keptReply, false);
    assert.match(out.markdown, /Written together/);
  }
});
