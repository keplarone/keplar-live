/**
 * Model classifier (KEPLAR_MODEL_CLASSIFIER=1). The flag defaults off, so production
 * keeps the regex. These tests never call a live model: a stub stands in for the registry.
 * Stacked on the golden route lock. When the model agrees with the regex, or when the
 * call fails, the routes stay on that lock.
 */
import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { HeuristicClassifier } from "@/lib/orchestration/classifier";
import { liveEnv, modelClassifierEnabled } from "@/lib/orchestration/config";
import { isFreeModel } from "@/lib/orchestration/free-guard";
import { freeRoster, liveRoster } from "@/lib/orchestration/live-catalog";
import { applyModelFields, classifierModel, ModelClassifier, parseModelClassification, type ClassifierAsk } from "@/lib/orchestration/model-classifier";
import { liveDeps } from "@/lib/orchestration/orchestrator";
import { CostAwareRouter } from "@/lib/orchestration/router";
import type { Classification, KeplarRequest, Provider } from "@/lib/orchestration/types";
import expected from "./fixtures/route-golden.expected.json";
import { GOLDEN_CASES, lockRoute, ROUTE_AT, type GoldenCase, type LockedRoute } from "./fixtures/route-golden";

const locked = expected as Record<string, LockedRoute>;

function reqOf(c: GoldenCase): KeplarRequest {
  return { prompt: c.prompt, plan: c.plan, at: ROUTE_AT, ...(c.modes ? { modes: c.modes } : {}) };
}

function echo(cls: Classification): string {
  return JSON.stringify({
    kind: cls.kind,
    complexity: cls.complexity,
    capabilities: cls.capabilities,
    errorProne: cls.errorProne ?? null,
    estimatedOutputTokens: 999999,
  });
}

function routeOf(cls: Classification, c: GoldenCase): LockedRoute {
  const roster = c.plan === "free" ? freeRoster : liveRoster;
  const plan = new CostAwareRouter(roster, () => 1).route(cls, reqOf(c));
  return {
    kind: cls.kind,
    complexity: cls.complexity,
    errorProne: cls.errorProne ?? null,
    capabilities: [...cls.capabilities],
    needsWeb: cls.needsWeb,
    mode: plan.mode,
    panel: plan.panel.map((p) => p.model.id),
    verifier: plan.verifier?.model.id ?? null,
    judge: plan.judge?.model.id ?? null,
  };
}

test("the model classifier flag defaults off and only accepts exactly 1", () => {
  assert.equal(modelClassifierEnabled({}), false);
  assert.equal(modelClassifierEnabled({ KEPLAR_MODEL_CLASSIFIER: "" }), false);
  assert.equal(modelClassifierEnabled({ KEPLAR_MODEL_CLASSIFIER: "true" }), false);
  assert.equal(modelClassifierEnabled({ KEPLAR_MODEL_CLASSIFIER: "0" }), false);
  assert.equal(modelClassifierEnabled({ KEPLAR_MODEL_CLASSIFIER: "1" }), true);
});

test("invalid model replies are rejected; token fields are ignored", () => {
  assert.equal(parseModelClassification("not json"), null);
  assert.equal(parseModelClassification('{"kind":"poem","complexity":"simple"}'), null);
  assert.equal(parseModelClassification('{"kind":"factual","complexity":"huge"}'), null);
  assert.equal(parseModelClassification('{"kind":"factual","complexity":"simple","capabilities":["Telepathy"]}'), null);
  const parsed = parseModelClassification('```json\n{"kind":"code","complexity":"moderate","errorProne":"exact","estimatedOutputTokens":999999}\n```');
  assert.deepEqual(parsed, { kind: "code", complexity: "moderate", capabilities: undefined, errorProne: "exact" });
});

test("a model reply cannot set token estimates or turn web on by itself", () => {
  const base = new HeuristicClassifier().classify({ prompt: "What is the capital of France?", at: ROUTE_AT });
  const next = applyModelFields(base, { kind: "strategy", complexity: "complex", capabilities: ["Reasoning"], errorProne: null }, { prompt: "What is the capital of France?" });
  assert.equal(next.kind, "strategy");
  assert.equal(next.complexity, "complex");
  assert.equal(next.estimatedInputTokens, base.estimatedInputTokens);
  assert.equal(next.estimatedOutputTokens, 1600);
  assert.equal(next.needsWeb, false);
  assert.equal(next.rationale, base.rationale);
  assert.equal(next.errorProne, undefined);
});

test("echoing the regex classification keeps every golden route", async () => {
  const calls: { id: string; free: boolean }[] = [];
  for (const c of GOLDEN_CASES) {
    const roster = c.plan === "free" ? freeRoster : liveRoster;
    const model = classifierModel(roster, c.plan === "free");
    assert.ok(model, c.id);
    const ask: ClassifierAsk = async (input) => {
      calls.push({ id: input.model.id, free: c.plan === "free" });
      assert.equal(input.model.id, model!.id);
      assert.equal(input.params.reasoningOff, true);
      assert.ok((input.params.maxOutputTokens ?? 0) <= 200);
      return { ok: true, text: echo(input.classification) };
    };
    const cls = await new ModelClassifier({ ask, model }).classify(reqOf(c));
    assert.deepEqual(routeOf(cls, c), locked[c.id], c.id);
    assert.deepEqual(routeOf(cls, c), lockRoute(c), c.id);
  }
  assert.ok(calls.some((c) => c.free && c.id.startsWith("free:")));
  assert.ok(calls.some((c) => !c.free && c.id === "live:gpt-5-nano"));
  for (const c of calls.filter((x) => x.free)) {
    const model = freeRoster.find((m) => m.id === c.id);
    assert.ok(model && isFreeModel(model), c.id);
  }
});

test("timeouts, errors, bad JSON, and no model fall back to the golden routes", async () => {
  const failures: ClassifierAsk[] = [
    async () => ({ ok: false }),
    async () => {
      throw new Error("network");
    },
    async () => ({ ok: true, text: "hello" }),
    () => new Promise(() => {}),
  ];
  for (const ask of failures) {
    for (const c of GOLDEN_CASES) {
      const model = classifierModel(c.plan === "free" ? freeRoster : liveRoster, c.plan === "free");
      const cls = await new ModelClassifier({ ask, model, timeoutMs: 30 }).classify(reqOf(c));
      assert.deepEqual(routeOf(cls, c), locked[c.id], c.id);
    }
  }
  for (const c of GOLDEN_CASES) {
    const cls = await new ModelClassifier({ ask: async () => ({ ok: true, text: "{}" }), model: null }).classify(reqOf(c));
    assert.deepEqual(routeOf(cls, c), locked[c.id], `${c.id} no model`);
  }
});

function stubProvider(texts: string[]): { provider: Provider; calls: { id: string }[] } {
  const calls: { id: string }[] = [];
  const provider: Provider = {
    name: "openrouter",
    live: false,
    supports: () => true,
    async generate({ model }) {
      calls.push({ id: model.id });
      const text = texts.shift() ?? "not json";
      return { ok: true, modelId: model.id, stance: "unclassified", claims: [], text, latencyMs: 1, usage: { inputTokens: 1, outputTokens: 1 } };
    },
  };
  return { provider, calls };
}

test("live routing keeps the regex classifier unless the flag is on", async () => {
  const off = stubProvider([]);
  const depsOff = liveDeps([off.provider], liveEnv("paid"));
  assert.ok(depsOff.classifier instanceof HeuristicClassifier);
  await depsOff.classifier.classify({ prompt: "What is the capital of France?", plan: "plus", at: ROUTE_AT });
  assert.equal(off.calls.length, 0, "flag off makes no model call");

  const prev = process.env.KEPLAR_MODEL_CLASSIFIER;
  delete process.env.KEPLAR_MODEL_CLASSIFIER;
  try {
    const cleared = liveDeps([stubProvider([]).provider], liveEnv("paid"));
    assert.ok(cleared.classifier instanceof HeuristicClassifier);
    process.env.KEPLAR_MODEL_CLASSIFIER = "1";
    const fromEnv = liveDeps([stubProvider([]).provider], liveEnv("free"));
    assert.ok(!(fromEnv.classifier instanceof HeuristicClassifier));
  } finally {
    if (prev === undefined) delete process.env.KEPLAR_MODEL_CLASSIFIER;
    else process.env.KEPLAR_MODEL_CLASSIFIER = prev;
  }

  const paid = stubProvider([]);
  const paidDeps = liveDeps([paid.provider], liveEnv("paid"), { modelClassifier: true });
  await paidDeps.classifier.classify({ prompt: "What is the capital of France?", plan: "plus", at: ROUTE_AT });
  assert.deepEqual(paid.calls.map((c) => c.id), ["live:gpt-5-nano"]);

  const free = stubProvider([]);
  const freeDeps = liveDeps([free.provider], liveEnv("free"), { modelClassifier: true });
  await freeDeps.classifier.classify({ prompt: "What is the capital of France?", plan: "free", at: ROUTE_AT });
  const freeModel = freeRoster.find((m) => m.id === free.calls[0]?.id);
  assert.ok(freeModel && isFreeModel(freeModel), free.calls[0]?.id);
});
