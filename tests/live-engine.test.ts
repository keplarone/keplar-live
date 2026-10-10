import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { liveEnv, openRouterSlug, readKey } from "@/lib/orchestration/config";
import { catalogById } from "@/lib/orchestration/catalog";
import { defaultProviders, liveMode, NvidiaProvider, OpenAIProvider, OpenRouterProvider } from "@/lib/orchestration/providers";
import { extractCitations } from "@/lib/orchestration/providers/shared";
import { applyExtraction, parseExtraction } from "@/lib/orchestration/extractor";
import { DailySpendGuard } from "@/lib/orchestration/live-budget";
import { LatencyBudget } from "@/lib/orchestration/latency";
import { applySnapshot, type SyncSnapshot } from "@/lib/orchestration/catalog-sync";
import { liveRoster } from "@/lib/orchestration/live-catalog";
import { engineDeps, orchestrate } from "@/lib/orchestration/orchestrator";
import type { KeplarAnswer, ProviderResult } from "@/lib/orchestration/types";

const FAKE = { OPENROUTER_API_KEY: "sk-or-test", OPENAI_API_KEY: "sk-test", NVIDIA_API_KEY: "nvapi-test" };

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

test("live mode needs KEPLAR_LIVE_MODELS=1 and a key; otherwise there are no providers and no engine", () => {
  withEnv({ ...FAKE, KEPLAR_LIVE_MODELS: undefined }, () => {
    assert.equal(liveMode(liveEnv()), false);
    assert.deepEqual(defaultProviders(), []);
    assert.equal(engineDeps(), null);
  });
  withEnv({ OPENROUTER_API_KEY: undefined, OPENAI_API_KEY: undefined, NVIDIA_API_KEY: undefined, KEPLAR_LIVE_MODELS: "1" }, () => {
    assert.deepEqual(defaultProviders(), []);
    assert.equal(engineDeps(), null);
  });
  withEnv({ ...FAKE, KEPLAR_LIVE_MODELS: "1" }, () => {
    const p = defaultProviders();
    assert.deepEqual(p.map((x) => x.constructor), [NvidiaProvider, OpenAIProvider, OpenRouterProvider]);
    const luna = catalogById.get("live:gpt-6-luna")!;
    const qwen = catalogById.get("live:qwen3.8-flash")!;
    assert.deepEqual(p.filter((x) => x.supports(luna)).map((x) => x.name), ["openai", "openrouter"]);
    assert.deepEqual(p.filter((x) => x.supports(qwen)).map((x) => x.name), ["openrouter"]);
  });
});

test("keys pasted as NAME=value are tolerated", () => {
  assert.equal(readKey({ OPENROUTER_API_KEY: "OPENROUTER_API_KEY=sk-or-abc" }, "OPENROUTER_API_KEY"), "sk-or-abc");
  assert.equal(readKey({ X: ' "k" ' }, "X"), "k");
  assert.equal(readKey({}, "X"), null);
});

test("OpenRouter slugs verified against /api/v1/models (2026-09-28)", () => {
  const slug = (id: string) => openRouterSlug(catalogById.get(id)!);
  assert.equal(slug("claude-opus-5-5"), "anthropic/claude-opus-5.5");
  assert.equal(slug("deepseek-flash"), "deepseek/deepseek-v4.1-flash");
  assert.equal(slug("qwen3.8-max"), "qwen/qwen3.8-max-0902");
  assert.equal(slug("mistral-medium-3.5"), "mistralai/mistral-medium-3-5");
  assert.equal(slug("gpt-6-sol"), "openai/gpt-6-sol");
  assert.equal(slug("nvidia/nemotron-3.5-lightning"), "nvidia/nemotron-3.5-lightning");
  assert.equal(slug("live:qwen3.8-flash"), "qwen/qwen3.8-flash");
});

test("citations: annotations, markdown links and bare URLs; junk dropped", () => {
  const c = extractCitations("See [IEA report](https://www.iea.org/reports/x). Also https://example.org/a. and http://localhost:3000/x", [{ type: "url_citation", url_citation: { url: "https://arxiv.org/abs/1", title: "Paper" } }]);
  assert.deepEqual(c.map((x) => x.url), ["https://arxiv.org/abs/1", "https://www.iea.org/reports/x", "https://example.org/a"]);
  assert.equal(c[1].title, "IEA report");
});

test("response classification: positions, claims, declines become missing votes", () => {
  const ok = (id: string, text: string): ProviderResult => ({ ok: true, modelId: id, stance: "unclassified", claims: [], text, latencyMs: 1, usage: { inputTokens: 1, outputTokens: 1 } });
  const results = [ok("a", "yes"), ok("b", "yes indeed"), ok("c", "no"), ok("d", "I can't help")];
  const ids = new Map([["a", "R1"], ["b", "R2"], ["c", "R3"], ["d", "R4"]]);
  const json = JSON.stringify({
    topic: "t",
    positions: [{ id: "P1", label: "Yes", summary: "s1" }, { id: "P2", label: "No", summary: "s2" }],
    responses: [{ id: "R1", kind: "answer", position: "P1" }, { id: "R2", kind: "answer", position: "P1" }, { id: "R3", kind: "answer", position: "P2" }, { id: "R4", kind: "declined", position: null }],
    claims: [{ text: "claim one", responses: ["R1", "R2"] }, { text: "claim two", responses: ["R3", "R9"] }],
  });
  const ex = parseExtraction("```json\n" + json + "\n```", [...ids.values()]);
  assert.ok(ex);
  const { results: out, summaries } = applyExtraction(results, ids, ex);
  assert.equal(out[0].ok && out[0].stance, "Yes");
  assert.equal(out[2].ok && out[2].claims[0].text, "claim two");
  assert.equal(out[3].ok, false);
  assert.equal(!out[3].ok && out[3].reason, "refusal");
  assert.equal(summaries.No, "s2");
  // An unclassified response makes the whole extraction unusable (never scored on a partial picture).
  assert.equal(parseExtraction(json, ["R1", "R2", "R3", "R4", "R5"]), null);
  assert.equal(parseExtraction("not json", ["R1"]), null);
});

test("daily spend guard refuses calls whose worst case would cross the cap", async () => {
  const g = new DailySpendGuard(0.01, false);
  const m = catalogById.get("live:gemini-3.8-flash")!;
  const w = g.worstCase(m, 1000, 1000); // ≈ $0.0052
  const a = await g.reserve(w);
  assert.ok(a);
  assert.equal(await g.reserve(w), null, "in-flight reservations count");
  a!(0.001);
  assert.ok(await g.reserve(w));
});

test("shared latency budget: quorum shortens the straggler wait", () => {
  const b = new LatencyBudget(40_000, { graceMinMs: 4000 }).start(1_000_000);
  assert.equal(b.panelDeadline(), 1_000_000 + 22_000);
  assert.equal(b.stragglerDeadline(1, 5, 1_005_000), b.panelDeadline());
  assert.equal(b.stragglerDeadline(3, 5, 1_008_000), 1_008_000 + 6000);
  assert.equal(b.stragglerDeadline(3, 5, 1_020_000), b.panelDeadline());
});

test("catalog sync snapshot drops unlisted routes and re-prices", () => {
  const snap: SyncSnapshot = {
    syncedAt: "2026-09-28T00:00:00Z",
    fetched: { openrouter: true, openai: true, nvidia: true },
    models: {
      "live:gpt-6-luna": { routes: { openai: false, openrouter: true }, openRouterPrice: { inputPer1M: 0.2, outputPer1M: 0.8 } },
      "live:gemini-3.8-flash": { routes: { openrouter: true }, openRouterPrice: { inputPer1M: 5, outputPer1M: 20 } },
      "live:qwen3.8-flash": { routes: { openrouter: false } },
    },
    candidates: [],
    errors: [],
  };
  const r = new Map(applySnapshot(liveRoster, snap).map((m) => [m.id, m]));
  assert.deepEqual(r.get("live:gpt-6-luna")!.routes, { openrouter: "openai/gpt-6-luna" });
  assert.equal(r.get("live:gpt-6-luna")!.pricing[0].inputPer1M, 0.2);
  assert.equal(r.get("live:gemini-3.8-flash")!.routable, false, "too expensive after re-price");
  assert.equal(r.get("live:qwen3.8-flash")!.routable, false, "no route left");
  assert.equal(r.get("live:deepseek-v4-flash")!.routable, true);
});

test("live pipeline end to end (stubbed network): extraction, disagreement, judge-tier synthesis", async () => {
  const realFetch = globalThis.fetch;
  const panelText: Record<string, string> = {};
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    const body = JSON.parse(String(init?.body ?? "{}")) as { model: string; messages: { role: string; content: string }[] };
    const sys = body.messages[0].content;
    let content: string;
    if (u.includes("nvidia")) return new Response(JSON.stringify({ status: 403 }), { status: 403 });
    if (sys.startsWith("You are Keplar's response classifier")) {
      const n = (body.messages[1].content.match(/### R\d+/g) ?? []).length;
      content = JSON.stringify({
        topic: "Fusion by 2040",
        positions: [{ id: "P1", label: "Unlikely", summary: "Very unlikely by 2040." }, { id: "P2", label: "Plausible", summary: "Could happen with breakthroughs." }],
        responses: Array.from({ length: n }, (_, i) => ({ id: `R${i + 1}`, kind: "answer", position: i === n - 1 ? "P2" : "P1" })),
        claims: [{ text: "No plant has delivered net electricity to the grid", responses: ["R1", "R2"] }],
      });
    } else if (sys.startsWith("You are Keplar's verifier")) {
      content = JSON.stringify({ checks: [{ kind: "unsupported", finding: "The breakthrough timeline is unsupported", models: ["x"], outcome: "kept-as-dissent", resolution: "Shown as dissent." }], disputed: [] });
    } else if (sys.startsWith("You are Keplar's final editor")) {
      content = "OK";
    } else if (sys.startsWith("You are Keplar's judge-tier synthesizer writing a DRAFT")) {
      content = "Draft: unlikely.";
    } else if (sys.startsWith("You are Keplar's judge-tier synthesizer")) {
      content = "Fusion is very unlikely to supply 1% by 2040.\n\n**Where the models disagree**\nOne model sees it as plausible.\nRESOLUTION: The build-out constraints outweigh optimistic timelines.";
    } else {
      content = `Panel answer from ${body.model}. Source: https://www.iea.org/fusion`;
      panelText[body.model] = content;
    }
    return new Response(JSON.stringify({ model: body.model, choices: [{ message: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 50, cost: 0.0001 } }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const answer = await withEnv({ ...FAKE, KEPLAR_LIVE_MODELS: "1" }, async () => {
      let a: KeplarAnswer | null = null;
      const events: string[] = [];
      for await (const e of orchestrate({ prompt: "Will nuclear fusion provide more than 1% of global electricity by 2040? Assess the evidence and give a probability.", plan: "pro", computeRemaining: 1e6 }, engineDeps()!)) {
        events.push(e.type);
        if (e.type === "answer") a = e.answer;
      }
      assert.ok(events.includes("disagreement"));
      return a!;
    });
    assert.ok(answer.consensus.responded >= 2);
    assert.notEqual(answer.consensus.level, "unscored");
    assert.ok(answer.disagreements.length === 1 && answer.disagreements[0].positions.length === 2);
    assert.match(answer.disagreements[0].resolution, /build-out constraints/);
    assert.ok(!answer.markdown.includes("RESOLUTION:"));
    assert.ok(!Object.values(panelText).includes(answer.markdown), "not a passthrough of one response");
    assert.ok(answer.sources.some((s) => s.kind === "model" && s.url === "https://www.iea.org/fusion" && /didn't open or check/.test(s.detail ?? "")));
    assert.ok(answer.verification.checks.length === 1);
  } finally {
    globalThis.fetch = realFetch;
  }
});
