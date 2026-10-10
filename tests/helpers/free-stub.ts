import { engineDeps, orchestrate } from "@/lib/orchestration/orchestrator";
import { newScope, runInCostScope } from "@/lib/ops/request-cost";
import type { KeplarAnswer } from "@/lib/orchestration/types";

/**
 * A stubbed OpenRouter for Free-plan engine tests: counts every outbound request (the unit OpenRouter's free pool limits),
 * tells the pipeline stages apart by their system prompt, and answers each with plausible, valid output. No network.
 */
export type StubStats = { total: number; byStage: Record<string, number>; models: string[]; bodies: Record<string, unknown>[] };

const stageOf = (system: string): string => {
  if (/combined reviewer/i.test(system)) return "merged";
  if (/response classifier/i.test(system)) return "extractor";
  if (/Keplar's verifier/i.test(system)) return "verifier";
  if (/judge-tier synthesizer writing a DRAFT/i.test(system)) return "draft";
  if (/judge-tier synthesizer/i.test(system)) return "synth";
  if (/coherence|coherent/i.test(system)) return "sanity";
  return "panel";
};

export type StubOptions = {
  /** "agree": every panel model gives the same answer. "split": the second model disagrees. */
  panel?: "agree" | "split";
  /** Models answering 429. */
  busy?: (model: string) => boolean;
  /** What the combined review/write request returns: normal, unreadable text, or JSON without the written answer. */
  merged?: "garbage" | "no-answer";
  /** Answer text for the panel (default a two-sentence answer). */
  answer?: (n: number) => string;
};

export function stubOpenRouter(opts: StubOptions = {}) {
  const real = globalThis.fetch;
  const stats: StubStats = { total: 0, byStage: {}, models: [], bodies: [] };
  let panelN = 0;
  globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { model: string; messages: { role: string; content: unknown }[] };
    const system = String(body.messages.find((m) => m.role === "system")?.content ?? "");
    const user = String(body.messages.find((m) => m.role === "user")?.content ?? "");
    const stage = stageOf(system);
    stats.total++;
    stats.byStage[stage] = (stats.byStage[stage] ?? 0) + 1;
    stats.models.push(body.model);
    stats.bodies.push(body as unknown as Record<string, unknown>);
    if (opts.busy?.(body.model)) return new Response(JSON.stringify({ error: { code: 429 } }), { status: 429 });
    const rids = [...user.matchAll(/### (R\d+)/g)].map((m) => m[1]);
    const split = opts.panel === "split";
    let content: string;
    if (stage === "panel") {
      const n = panelN++;
      content = opts.answer?.(n) ?? (split && n % 2 === 1
        ? "No, a four-day week is a poor fit for a small bakery. Opening hours drive its sales, so closing a day loses revenue it cannot recover."
        : "Yes, a four-day week can work for a small bakery. Keep the busiest days open and move the closed day to the slowest weekday.");
    } else if (stage === "extractor" || stage === "merged") {
      const positions = split ? [{ id: "P1", label: "Yes, it can work", summary: "Keep busy days." }, { id: "P2", label: "No, poor fit", summary: "Hours drive sales." }] : [{ id: "P1", label: "Yes, it can work", summary: "Keep busy days." }];
      const json = JSON.stringify({ topic: "Four-day week", positions, responses: rids.map((id, i) => ({ id, kind: "answer", position: split ? `P${(i % 2) + 1}` : "P1" })), claims: [{ text: "Closing the slowest weekday costs the least.", responses: rids.slice(0, 1) }], checks: [], disputed: [] });
      if (stage === "merged" && opts.merged === "garbage") return new Response(JSON.stringify({ model: body.model, choices: [{ message: { content: "Sorry, here is some prose and no JSON at all." }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0 } }), { status: 200 });
      content = stage === "merged" && opts.merged === "no-answer" ? json : stage === "merged" ? `${json}\n=====ANSWER=====\nA four-day week can work if you close on your slowest weekday and keep the busiest days open.\nRESOLUTION: ${split ? "Weighed hours against revenue." : "No disagreement."}` : json;
    } else if (stage === "verifier") content = JSON.stringify({ checks: [], disputed: [] });
    else if (stage === "draft") content = "Draft: a four-day week can work if the slowest weekday is the closed one.";
    else if (stage === "sanity") content = "ok";
    else content = "A four-day week can work for a small bakery if you close on the slowest weekday.\nRESOLUTION: No disagreement.";
    return new Response(JSON.stringify({ model: body.model, choices: [{ message: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0 } }), { status: 200 });
  }) as typeof fetch;
  return { stats, restore: () => { globalThis.fetch = real; } };
}

export const QUESTION = "Should a small bakery switch to a four-day week? Weigh the trade-offs.";

/** Runs one Free question through the real engine against the stubbed OpenRouter and reports what was sent. */
export async function askFree(opts: StubOptions = {}, prompt = QUESTION) {
  const prev = { k: process.env.OPENROUTER_API_KEY, l: process.env.KEPLAR_LIVE_MODELS };
  process.env.OPENROUTER_API_KEY = "sk-or-test";
  process.env.KEPLAR_LIVE_MODELS = "1";
  const stub = stubOpenRouter(opts);
  const scope = newScope();
  let answer: KeplarAnswer | null = null;
  let error: string | null = null;
  try {
    await runInCostScope(scope, async () => {
      for await (const e of orchestrate({ prompt, plan: "free", computeRemaining: 1e6 }, engineDeps({ keyTier: "free" })!)) {
        if (e.type === "answer") answer = e.answer;
        if (e.type === "error") error = e.message;
      }
    });
  } finally {
    stub.restore();
    if (prev.k === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = prev.k;
    if (prev.l === undefined) delete process.env.KEPLAR_LIVE_MODELS; else process.env.KEPLAR_LIVE_MODELS = prev.l;
  }
  return { stats: stub.stats, scope, answer: answer as KeplarAnswer | null, error: error as string | null };
}

