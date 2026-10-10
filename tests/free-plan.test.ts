import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { liveEnv } from "@/lib/orchestration/config";
import { catalog, catalogById } from "@/lib/orchestration/catalog";
import { applyFreeSnapshot, freeFallbacks, type SyncSnapshot } from "@/lib/orchestration/catalog-sync";
import { FREE_PLAN_REFUSAL, isFreeModel } from "@/lib/orchestration/free-guard";
import { FREE_ROLES, freeRoster, liveRoster } from "@/lib/orchestration/live-catalog";
import { engineDeps, orchestrate } from "@/lib/orchestration/orchestrator";
import { createRegistry, defaultProviders, FREE_BUSY_MESSAGE, OpenRouterProvider } from "@/lib/orchestration/providers";
import { FREE_NO_RESPONSE_MESSAGE } from "@/lib/orchestration/no-response";
import { CostAwareRouter } from "@/lib/orchestration/router";
import { HeuristicClassifier } from "@/lib/orchestration/classifier";
import type { Classification, KeplarAnswer, ModelSpec, Provider, ProviderResult } from "@/lib/orchestration/types";

const KEYS = { OPENROUTER_API_KEY: "sk-or-test", OPENAI_API_KEY: "sk-test", NVIDIA_API_KEY: "nvapi-test" };

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  const restore = () => { for (const [k, v] of Object.entries(prev)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } };
  try {
    const r = fn();
    if (r instanceof Promise) return r.finally(restore) as T;
    restore();
    return r;
  } catch (e) {
    restore();
    throw e;
  }
}

const cls: Classification = { kind: "general", complexity: "moderate", capabilities: ["Reasoning"], estimatedInputTokens: 100, estimatedOutputTokens: 100, needsWeb: false, rationale: "t" };

/** Fake "openrouter" provider: records every model it is asked for; per-model scripted outcome. */
function fakeGateway(outcome: (m: ModelSpec) => ProviderResult["ok"] | "rate_limited" | "error") {
  const calls: string[] = [];
  const p: Provider = {
    name: "openrouter",
    live: true,
    supports: () => true,
    async generate({ model }) {
      calls.push(model.id);
      const o = outcome(model);
      if (o === true) return { ok: true, modelId: model.id, stance: "unclassified", claims: [], text: `answer from ${model.id}`, latencyMs: 1, usage: { inputTokens: 1, outputTokens: 1 }, actualCostUsd: 0 };
      return { ok: false, modelId: model.id, reason: o === "rate_limited" ? "rate_limited" : "error", message: o === "rate_limited" ? "Rate limited after retries." : "Gateway error.", latencyMs: 1 };
    },
  };
  return { p, calls };
}

test("free roster: every model is a $0 OpenRouter :free model; roles exist", () => {
  assert.ok(freeRoster.length >= 5);
  for (const m of freeRoster) {
    assert.ok(isFreeModel(m), `${m.id} must be free`);
    assert.deepEqual(Object.keys(m.routes ?? {}), ["openrouter"]);
    assert.match(m.routes!.openrouter!, /:free$/);
  }
  const families = new Set(freeRoster.filter((m) => m.role === "primary").map((m) => m.family));
  assert.ok(families.size >= 3 && families.size <= 5, "3–5 panel families");
  assert.ok(catalogById.get(FREE_ROLES.synthesizer) && catalogById.get(FREE_ROLES.extractor));
  // The paid roster and the research catalog are never "free".
  for (const m of [...liveRoster, ...catalog]) assert.equal(isFreeModel(m), false, m.id);
});

test("HARD GUARD: a Free-plan call to a model with nonzero price is refused and never sent", async () => {
  const { p, calls } = fakeGateway(() => true);
  const reg = createRegistry([p], { freeOnly: true });
  const paid = catalogById.get("live:gpt-6-luna")!;
  const r = await reg.generate({ model: paid, prompt: "hi", classification: cls, params: {} });
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.message, FREE_PLAN_REFUSAL);
  // A ":free" slug with a nonzero price is refused too (price wins, not the name).
  const sneaky: ModelSpec = { ...freeRoster[0], id: "free:sneaky", pricing: [{ from: null, inputPer1M: 0, outputPer1M: 0.01 }] };
  const r2 = await reg.generate({ model: sneaky, prompt: "hi", classification: cls, params: {} });
  assert.equal(!r2.ok && r2.message, FREE_PLAN_REFUSAL);
  // A $0 model with a direct (paid-provider) route is refused.
  const direct: ModelSpec = { ...freeRoster[0], id: "free:direct", routes: { openrouter: "x/y:free", nvidia: "x/y" } };
  const r3 = await reg.generate({ model: direct, prompt: "hi", classification: cls, params: {} });
  assert.equal(!r3.ok && r3.message, FREE_PLAN_REFUSAL);
  assert.deepEqual(calls, [], "nothing was sent");
  // Fallbacks can't smuggle in a paid model either.
  const reg2 = createRegistry([p], { freeOnly: true, fallbacks: () => [paid] });
  const { p: p2, calls: calls2 } = fakeGateway((m) => (m.id === freeRoster[0].id ? "rate_limited" : true));
  const reg3 = createRegistry([p2], { freeOnly: true, fallbacks: () => [paid] });
  const r4 = await reg3.generate({ model: freeRoster[0], prompt: "hi", classification: cls, params: {} });
  assert.equal(r4.ok, false);
  assert.deepEqual(calls2, [freeRoster[0].id]);
  assert.ok(reg2.chain(paid).length === 0);
  // A provider that isn't OpenRouter is never used on the Free plan, even for a $0 model.
  const { p: nv, calls: nvCalls } = fakeGateway(() => true);
  const reg4 = createRegistry([{ ...nv, name: "nvidia" }], { freeOnly: true });
  const r5 = await reg4.generate({ model: freeRoster[0], prompt: "hi", classification: cls, params: {} });
  assert.equal(r5.ok, false);
  assert.deepEqual(nvCalls, []);
});

test("Free tier providers: OpenRouter only, normal key, OPENROUTER_API_KEY_FREE still honoured", () => {
  withEnv({ ...KEYS, OPENROUTER_API_KEY_FREE: undefined, KEPLAR_LIVE_MODELS: "1" }, () => {
    const env = liveEnv("free");
    assert.equal(env.openRouterKey, "sk-or-test");
    assert.equal(env.direct.openai, null);
    assert.equal(env.nvidiaKey, null);
    const p = defaultProviders("free");
    assert.deepEqual(p.map((x) => x.name), ["openrouter"]);
    // The Free-tier OpenRouter instance itself declines priced models.
    assert.equal(p[0].supports(catalogById.get("live:qwen3.8-flash")!), false);
    assert.equal(p[0].supports(freeRoster[0]), true);
  });
  withEnv({ ...KEYS, OPENROUTER_API_KEY_FREE: "OPENROUTER_API_KEY_FREE=sk-or-free", KEPLAR_LIVE_MODELS: "1" }, () => {
    assert.equal(liveEnv("free").openRouterKey, "sk-or-free");
    assert.equal(liveEnv("paid").openRouterKey, "sk-or-test");
  });
});

test("Free-tier OpenRouter provider refuses a priced model without a network call", async () => {
  await withEnv({ ...KEYS, KEPLAR_LIVE_MODELS: "1" }, async () => {
    const realFetch = globalThis.fetch;
    let sent = 0;
    globalThis.fetch = (async () => { sent++; return new Response("{}", { status: 500 }); }) as typeof fetch;
    try {
      const r = await new OpenRouterProvider(liveEnv("free")).generate({ model: catalogById.get("live:gemini-3.8-flash")!, prompt: "x", classification: cls, params: {} });
      assert.equal(!r.ok && r.message, FREE_PLAN_REFUSAL);
      assert.equal(sent, 0);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

test("router: Free plan only picks $0 :free models, never a judge; nothing eligible in the paid catalogs", () => {
  const plan = new CostAwareRouter([...liveRoster, ...freeRoster]).route({ ...cls, complexity: "complex" }, { prompt: "x", plan: "free" });
  assert.ok(plan.panel.length >= 2 && plan.panel.length <= 3);
  for (const m of [...plan.panel, ...(plan.verifier ? [plan.verifier] : [])]) assert.ok(isFreeModel(m.model), m.model.id);
  assert.equal(plan.judge, null);
  assert.equal(new Set(plan.panel.map((p) => p.model.family)).size, plan.panel.length, "distinct families");
  assert.throws(() => new CostAwareRouter(liveRoster).route(cls, { prompt: "x", plan: "free" }));
  // Paid plans keep the paid panel.
  const paid = new CostAwareRouter(liveRoster).route(cls, { prompt: "x", plan: "pro" });
  assert.ok(paid.panel.every((p) => !isFreeModel(p.model)));
});

test("429 on a free model falls back to another free model; all busy → friendly message", async () => {
  const [a, b] = freeRoster;
  const fb = freeFallbacks(freeRoster, []);
  assert.ok(fb(a).every((m) => isFreeModel(m) && m.id !== a.id));
  assert.notEqual(fb(a)[0].family, a.family, "other families first");

  const { p, calls } = fakeGateway((m) => (m.id === a.id ? "rate_limited" : true));
  const r = await createRegistry([p], { freeOnly: true, fallbacks: fb }).generate({ model: a, prompt: "hi", classification: cls, params: {} });
  assert.equal(r.ok, true);
  assert.equal(r.fellBackFrom, a.id);
  assert.ok(isFreeModel(r.model) && r.model.id !== a.id);
  assert.equal(calls.length, 2);

  // `avoid`: a substitute already on the panel is skipped.
  const avoid = new Set([a.id, fb(a)[0].id]);
  const r2 = await createRegistry([p], { freeOnly: true, fallbacks: fb }).generate({ model: a, prompt: "hi", classification: cls, params: {}, avoid });
  assert.ok(r2.ok && r2.model.id !== fb(a)[0].id);

  const busy = fakeGateway(() => "rate_limited");
  const r3 = await createRegistry([busy.p], { freeOnly: true, fallbacks: fb, maxFallbacks: 2 }).generate({ model: b, prompt: "hi", classification: cls, params: {} });
  assert.equal(r3.ok, false);
  assert.equal(!r3.ok && r3.reason, "rate_limited");
  assert.equal(!r3.ok && r3.message, FREE_BUSY_MESSAGE);
  assert.equal(busy.calls.length, 3, "the model plus 2 fallbacks, then stop");
});

test("catalog sync: a free seed that is missing or no longer $0 becomes unroutable; extras are $0 :free only", () => {
  const snap: SyncSnapshot = {
    syncedAt: "2026-09-28T00:00:00Z",
    fetched: { openrouter: true, openai: false, nvidia: false },
    models: {},
    candidates: [],
    free: { "free:qwen3.8-27b": { listed: false, zeroPriced: false }, "free:dots-3-note": { listed: true, zeroPriced: false }, "free:gemma-4-31b": { listed: true, zeroPriced: true } },
    freeExtras: [{ id: "vendor/new-model:free", contextWindow: 131072 }, { id: "thinkingmachines/inkling:free", contextWindow: 1 }],
    errors: [],
  };
  const { roster, extras } = applyFreeSnapshot(freeRoster, snap);
  const by = new Map(roster.map((m) => [m.id, m]));
  assert.equal(by.get("free:qwen3.8-27b")!.routable, false);
  assert.equal(by.get("free:dots-3-note")!.routable, false);
  assert.equal(by.get("free:gemma-4-31b")!.routable, true);
  assert.deepEqual(extras.map((m) => m.routes?.openrouter), ["vendor/new-model:free"]);
  assert.ok(extras.every(isFreeModel));
  const fb = freeFallbacks(roster, extras)(by.get("free:gemma-4-31b")!);
  assert.ok(!fb.some((m) => m.id === "free:qwen3.8-27b"));
  assert.equal(fb.at(-1)!.routes?.openrouter, "vendor/new-model:free", "synced extras come last");
});

test("Free plan end to end (stubbed network): only OpenRouter :free models are called; OpenAI/NVIDIA never", async () => {
  const realFetch = globalThis.fetch;
  const seen: { url: string; model: string }[] = [];
  let busyFor = new Set<string>();
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { model: string; provider?: Record<string, unknown> };
    seen.push({ url: String(url), model: body.model });
    if (busyFor.has(body.model) || busyFor.has("*")) return new Response(JSON.stringify({ error: { code: 429 } }), { status: 429 });
    assert.equal(body.provider?.quantizations, undefined, "no fp8/bf16 pin on free hosts");
    return new Response(JSON.stringify({ model: body.model, choices: [{ message: { content: `Answer from ${body.model}.` }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0 } }), { status: 200 });
  }) as typeof fetch;
  const ask = () =>
    withEnv({ ...KEYS, KEPLAR_LIVE_MODELS: "1" }, async () => {
      let a: KeplarAnswer | null = null;
      let err: string | null = null;
      const req = { prompt: "Should a small bakery switch to a four-day week? Weigh the trade-offs.", plan: "free" as const, computeRemaining: 1e6 };
      assert.notEqual((await new HeuristicClassifier().classify(req)).complexity, "simple");
      for await (const e of orchestrate(req, engineDeps({ keyTier: "free" })!)) {
        if (e.type === "answer") a = e.answer;
        if (e.type === "error") err = e.message;
      }
      return { a, err };
    });
  try {
    // One panel model is rate-limited: a free substitute answers instead.
    busyFor = new Set(["qwen/qwen3.8-27b:free", "google/gemma-4-31b-it:free"]);
    const { a } = await ask();
    assert.ok(a);
    assert.ok(seen.length > 0);
    for (const s of seen) {
      assert.ok(s.url.startsWith("https://openrouter.ai/api/v1/"), s.url);
      assert.match(s.model, /:free$/);
    }
    assert.ok(a!.models.filter((m) => m.slot === "panel").every((m) => isFreeModel(catalogById.get(m.id)!)));
    // $0 provider cost: only the base unit per answer is metered.
    assert.equal(a!.compute.units, 1);
    assert.ok(a!.models.some((m) => m.slot === "panel" && m.status === "responded"));

    // Every free model busy → the friendly message, nothing else.
    seen.length = 0;
    busyFor = new Set(["*"]);
    const { a: none, err } = await ask();
    assert.equal(none, null);
    assert.equal(err, FREE_NO_RESPONSE_MESSAGE);
    assert.ok(seen.every((s) => s.url.startsWith("https://openrouter.ai/") && s.model.endsWith(":free")));
  } finally {
    globalThis.fetch = realFetch;
  }
});
