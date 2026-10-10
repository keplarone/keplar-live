/**
 * Evals for Core and for candidate changes. Two arms run the same benchmark items; each answer is scored by the item's
 * deterministic checker (bench.ts). Used three ways:
 *   - scripts/core-eval.mts: before/after (the plain Ask pipeline vs Core), written to docs/core-intelligence-evals.md;
 *   - the scheduled pipeline: candidate vs champion on a small rotating subset, with guard metrics (latency, calls, per-category);
 *   - failure replay: redacted failed questions from people who opted in to sharing, graded by a critic from another model family.
 */
import { clampDocs, docsBlock } from "@/lib/documents/chat-docs";
import { orchestrate } from "@/lib/orchestration/orchestrator";
import type { KeplarAnswer, KeplarRequest } from "@/lib/orchestration/types";
import { scoreItem, summarize, type BenchItem, type BenchResult } from "../bench";
import { coreCall, CoreBudget, parseJson } from "../llm";
import { assess } from "../assess";
import { coreModels } from "../models";
import { runCore } from "../run";
import type { Depth } from "../types";
import type { ArmMetrics } from "./guard";
import type { Picked } from "./variants";

type Deps = NonNullable<Parameters<typeof orchestrate>[1]>;
export type ArmRun = { answer: string; ms: number; calls: number; core?: KeplarAnswer["core"] };
export type Arm = (item: BenchItem) => Promise<ArmRun>;

/** The request the Ask route would build for this item (attached pages clamped to the plan's window, exactly as the route does). */
export function requestFor(item: BenchItem, plan: KeplarRequest["plan"], depth?: Depth): KeplarRequest {
  const free = plan === "free";
  return {
    prompt: item.prompt,
    plan,
    ...(item.docs ? { docs: item.docs, memory: `${docsBlock(clampDocs(item.docs, free))}\n\nThe question:\n` } : {}),
    ...(depth ? { routing: { depth } } : {}),
  };
}

async function drain(gen: AsyncGenerator<import("@/lib/orchestration/types").KeplarEvent>): Promise<{ answer: KeplarAnswer | null; models: number }> {
  let answer: KeplarAnswer | null = null;
  let models = 0;
  for await (const e of gen) {
    if (e.type === "model") models++;
    else if (e.type === "answer") answer = e.answer;
  }
  return { answer, models };
}

/** Before: the Ask pipeline as it was (panel → compare → verify → synthesize), no Core. */
export function baselineArm(deps: () => Deps, plan: KeplarRequest["plan"] = "free"): Arm {
  return async (item) => {
    const t = Date.now();
    const { answer, models } = await drain(orchestrate(requestFor(item, plan), deps()));
    return { answer: answer?.markdown ?? "", ms: Date.now() - t, calls: models + 2 };
  };
}

/** After: Core at the given depth (auto = what people get by default), optionally forcing specific variants. */
export function coreArm(deps: () => Deps, depth: Depth, plan: KeplarRequest["plan"] = "free", picked?: Picked): Arm {
  return async (item) => {
    const t = Date.now();
    const { answer, models } = await drain(runCore(requestFor(item, plan, depth), deps(), undefined, picked ? { forcePicked: picked } : {}));
    return { answer: answer?.markdown ?? "", ms: Date.now() - t, calls: models + 2 + (answer?.core?.use?.calls ?? 0), core: answer?.core };
  };
}

export async function runArm(items: BenchItem[], arm: Arm, opts: { concurrency?: number; onItem?: (r: BenchResult) => void } = {}): Promise<BenchResult[]> {
  const out: BenchResult[] = [];
  const queue = [...items];
  const worker = async () => {
    for (let it = queue.shift(); it; it = queue.shift()) {
      let r: ArmRun;
      try { r = await arm(it); } catch (e) { r = { answer: "", ms: 0, calls: 0 }; console.error(`[core-eval] ${it.id} failed:`, e instanceof Error ? e.message : e); }
      const s = await scoreItem(it, r.answer);
      const row: BenchResult = { id: it.id, category: it.category, score: s.score, note: s.note, ms: r.ms, calls: r.calls, ...(r.core ? { ran: `${r.core.depth}, ${r.core.rounds} round(s): ${r.core.reason}` } : {}), excerpt: r.answer.slice(0, 280) };
      out.push(row);
      opts.onItem?.(row);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency ?? 2) }, worker));
  return out.sort((a, b) => items.findIndex((i) => i.id === a.id) - items.findIndex((i) => i.id === b.id));
}

export function metricsOf(results: BenchResult[]): ArmMetrics {
  const s = summarize(results);
  const n = results.length || 1;
  return { score: s.overall, byCategory: s.byCategory, meanMs: results.reduce((a, r) => a + r.ms, 0) / n, meanCalls: results.reduce((a, r) => a + (r.calls ?? 0), 0) / n, n: results.length };
}

/** Rotating subset for the daily job: one item per category, a different one each day (or the categories a cluster points at). */
export function dailySubset(items: BenchItem[], day: number, categories?: string[]): BenchItem[] {
  const cats = [...new Set(items.map((i) => i.category))].filter((c) => !categories?.length || categories.includes(c));
  return cats.map((c) => {
    const pool = items.filter((i) => i.category === c);
    return pool[day % pool.length]!;
  });
}

/**
 * Failure replay: answer a redacted failed question again with the current champion and have a critic from another family
 * grade it (0-10). There is no reference answer, so this tracks direction over time; it never decides a promotion alone.
 */
export async function replayScore(deps: Deps, text: string): Promise<number | null> {
  const { answer } = await drain(runCore({ prompt: text, plan: "free", routing: { depth: "quick" } }, deps));
  if (!answer?.markdown || !deps.registry) return null;
  const models = coreModels(deps.registry);
  if (!models) return null;
  const budget = new CoreBudget({ calls: 1, ms: 30_000, jobMs: 0, jobCalls: 0, usd: 0, stepTokens: 400 });
  const r = await coreCall({ registry: deps.registry, budget, model: models.critic(models.writer), system: "Grade how well the answer serves the question: correct, complete, clear, honest about uncertainty. Reply with JSON {\"score\": 0-10}.", prompt: `Question:\n${text}\n\nAnswer:\n${answer.markdown.slice(0, 6000)}`, classification: assess({ prompt: text }, "quick").classification, maxTokens: 60, effort: "low", timeoutMs: 20_000 });
  const j = r.ok ? parseJson<{ score?: number }>(r.text) : null;
  return typeof j?.score === "number" ? Math.max(0, Math.min(10, j.score)) : null;
}
