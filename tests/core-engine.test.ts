import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { liveEnv } from "@/lib/orchestration/config";
import { liveDeps, orchestrate } from "@/lib/orchestration/orchestrator";
import { runCore } from "@/lib/core/run";
import { setActiveForTests } from "@/lib/core/selfdev/variants";
import type { KeplarAnswer, KeplarEvent, KeplarRequest, ModelSpec, Provider } from "@/lib/orchestration/types";

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) { prev[k] = process.env[k]; if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  return fn().finally(() => { for (const [k, v] of Object.entries(prev)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
}

type Script = { plan?: string; step?: string; critic?: string; final?: string; revise?: string; panel?: string; insight?: string; delayMs?: number };
function fakeGateway(script: Script = {}) {
  const calls: { model: string; kind: string }[] = [];
  const p: Provider = {
    name: "openrouter",
    live: true,
    supports: () => true,
    async generate({ model, system }: { model: ModelSpec; system?: string }) {
      const sys = system ?? "";
      const kind = sys.startsWith("You plan how") ? "plan" : sys.startsWith("You are one specialist") ? "step" : sys.startsWith("You check another") ? "critic" : sys.startsWith("You are the final checker") ? "final" : sys.startsWith("You revise an answer") ? "revise" : sys.startsWith("After an answer") ? "insight" : "panel";
      calls.push({ model: model.id, kind });
      if (script.delayMs) await new Promise((r) => setTimeout(r, script.delayMs));
      const text =
        kind === "plan" ? (script.plan ?? JSON.stringify({ steps: [{ title: "Compute 6 times 7", kind: "math", detail: "6*7" }, { title: "State the answer", kind: "write", detail: "one line" }] })) :
        kind === "step" ? (script.step ?? "6 times 7.\n```js\nconsole.log(6*7)\n```\nResult: 42") :
        kind === "critic" ? (script.critic ?? JSON.stringify({ ok: true, issue: "", fix: "" })) :
        kind === "final" ? (script.final ?? JSON.stringify({ score: 9, issues: [], missing: [], overclaims: [] })) :
        kind === "revise" ? (script.revise ?? "The answer is **42**.") :
        kind === "insight" ? (script.insight ?? JSON.stringify({ next: ["Check that the inputs are exact integers."], clarify: "" })) :
        (script.panel ?? "The answer is 42. 6 × 7 = 42.");
      return { ok: true as const, modelId: model.id, stance: "unclassified" as const, claims: [], text, latencyMs: 1, usage: { inputTokens: 10, outputTokens: 10 }, actualCostUsd: 0 };
    },
  };
  return { p, calls };
}

const ENV = { KEPLAR_LIVE_MODELS: "1", OPENROUTER_API_KEY: "sk-or-test", OPENROUTER_API_KEY_FREE: "sk-or-test" };

async function collect(gen: AsyncGenerator<KeplarEvent>) {
  const events: KeplarEvent[] = [];
  for await (const e of gen) events.push(e);
  const answer = events.find((e): e is Extract<KeplarEvent, { type: "answer" }> => e.type === "answer")?.answer as KeplarAnswer | undefined;
  return { events, answer, core: events.filter((e): e is Extract<KeplarEvent, { type: "core" }> => e.type === "core").map((e) => e.core) };
}

test("thorough: plans, executes the math in the sandbox, reviews, and reports confidence; Free uses :free models only", async () => {
  setActiveForTests(null);
  await withEnv(ENV, async () => {
    const { p, calls } = fakeGateway();
    const deps = liveDeps([p], liveEnv("free"));
    const req: KeplarRequest = { prompt: "Work out 6 times 7, then explain the result step by step.", plan: "free", routing: { depth: "thorough" } };
    const { answer, core } = await collect(runCore(req, deps));
    assert.ok(answer, "an answer");
    assert.ok(core.some((c) => c.phase === "route"), "route event");
    assert.ok(core.some((c) => c.phase === "plan"), "plan event");
    assert.ok(core.some((c) => c.phase === "step"), "step events");
    const sum = answer!.core!;
    assert.equal(sum.depth, "thorough");
    assert.ok(sum.checks.some((c) => c.kind === "execution" && c.outcome === "passed"), "the computation was executed and matched");
    assert.ok(["high", "medium", "low"].includes(sum.confidence.level));
    assert.ok(sum.use && sum.use.calls <= sum.use.callLimit, "stayed inside the explicit budget");
    assert.ok(calls.every((c) => c.model.endsWith(":free") || c.model.startsWith("free:")), `free models only: ${[...new Set(calls.map((c) => c.model))].join(", ")}`);
    assert.ok(calls.some((c) => c.kind === "plan") && calls.some((c) => c.kind === "final"));
  });
});

test("critique loop: a failing step is revised until it passes, and the stop reason is the quality criterion", async () => {
  setActiveForTests(null);
  await withEnv(ENV, async () => {
    let n = 0;
    const g = fakeGateway({ plan: JSON.stringify({ steps: [{ title: "Explain the trade-off", kind: "reason", detail: "x" }] }), step: "Some reasoning. Result: done" });
    const orig = g.p.generate.bind(g.p);
    g.p.generate = async (i) => {
      if ((i.system ?? "").startsWith("You check another")) { n++; return { ok: true, modelId: i.model.id, stance: "unclassified", claims: [], text: JSON.stringify(n < 2 ? { ok: false, issue: "missed a requirement", fix: "add it" } : { ok: true }), latencyMs: 1, usage: { inputTokens: 1, outputTokens: 1 }, actualCostUsd: 0 }; }
      return orig(i);
    };
    const deps = liveDeps([g.p], liveEnv("free"));
    const { answer } = await collect(runCore({ prompt: "Compare two approaches to caching and recommend one for a read-heavy API, explaining the trade-offs.", plan: "free", routing: { depth: "thorough" } }, deps));
    const step = answer!.core!.steps[0]!;
    assert.equal(step.status, "revised");
    assert.ok(n >= 2);
    assert.equal(answer!.core!.stoppedBy, "criterion");
  });
});

test("fast path: Quick adds no model calls and no planning compared with the plain pipeline", async () => {
  setActiveForTests(null);
  await withEnv(ENV, async () => {
    const a = fakeGateway(), b = fakeGateway();
    const req: KeplarRequest = { prompt: "What is the boiling point of water at sea level in Celsius?", plan: "free", routing: { depth: "quick" } };
    const t0 = Date.now();
    const plain = await collect(orchestrate(req, liveDeps([a.p], liveEnv("free"))));
    const plainMs = Date.now() - t0;
    const t1 = Date.now();
    const core = await collect(runCore(req, liveDeps([b.p], liveEnv("free"))));
    const coreMs = Date.now() - t1;
    assert.equal(b.calls.length, a.calls.length, "same number of model calls");
    assert.ok(!b.calls.some((c) => c.kind === "plan" || c.kind === "final"));
    assert.ok(!core.core.some((c) => c.phase === "plan"));
    assert.ok(core.answer && plain.answer);
    assert.ok(coreMs < plainMs + 250, `overhead under 250 ms (plain ${plainMs} ms, core ${coreMs} ms)`);
  });
});

test("kill switch: KEPLAR_CORE_OFF=1 runs the plain pipeline even when Thorough is asked", async () => {
  setActiveForTests(null);
  await withEnv({ ...ENV, KEPLAR_CORE_OFF: "1" }, async () => {
    const g = fakeGateway();
    const { core, answer } = await collect(runCore({ prompt: "Work out 6 times 7 step by step.", plan: "free", routing: { depth: "thorough" } }, liveDeps([g.p], liveEnv("free"))));
    assert.equal(core.length, 0);
    assert.ok(answer && !answer.core);
    assert.ok(!g.calls.some((c) => c.kind === "plan"));
  });
});

test("budget: a run stops at the plan's call limit and says so", async () => {
  setActiveForTests(null);
  await withEnv({ ...ENV, KEPLAR_CORE_BUDGETS: JSON.stringify({ free: { thorough: { calls: 3 } } }) }, async () => {
    const g = fakeGateway({ critic: JSON.stringify({ ok: false, issue: "wrong", fix: "redo" }), plan: JSON.stringify({ steps: [{ title: "a", kind: "reason", detail: "x" }, { title: "b", kind: "reason", detail: "y" }] }) });
    const { answer } = await collect(runCore({ prompt: "Plan a three-city rail itinerary with costs and timings, step by step, and verify every connection.", plan: "free", routing: { depth: "thorough" } }, liveDeps([g.p], liveEnv("free"))));
    assert.ok(answer);
    assert.ok(answer!.core!.use!.calls <= 3, `calls ${answer!.core!.use!.calls}`);
    assert.equal(answer!.core!.stoppedBy, "budget");
  });
});
