/**
 * Pre-run cost estimate. A faithful TypeScript port of
 * /workspace/research/tools/bench_budget.py (same token profiles, same mix
 * structure, same grading assumption), priced from the app catalog on the run date.
 * It deliberately ignores the panel-output reuse the harness performs, so it is
 * conservative (plan §5 lists reuse as a ≈ −30% lever).
 */
import { catalogById } from "@/lib/orchestration/catalog";
import { priceWindowAt } from "@/lib/orchestration/pricing";
import { BYOK_FAMILIES, CONTINGENCY, JUDGES, M, MIXES, OPENROUTER_FEE, PROFILES, type Arm, type Mix } from "./config";
import type { DatasetId } from "./types";

export function feeFactor(modelId: string): number {
  const m = catalogById.get(modelId);
  if (!m) throw new Error(`Unknown model ${modelId}`);
  return BYOK_FAMILIES.has(m.family) ? 1 : OPENROUTER_FEE;
}

export function prices(modelId: string, at: string): { inp: number; out: number } {
  const m = catalogById.get(modelId);
  const w = m && priceWindowAt(m, at);
  if (!w) throw new Error(`No price for ${modelId} on ${at}; refusing to guess.`);
  return { inp: w.inputPer1M, out: w.outputPer1M };
}

/** USD for one call, incl. OpenRouter fee for non-BYOK families. */
export function tokenCost(modelId: string, inputTokens: number, outputTokens: number, at: string, p = 1): number {
  const { inp, out } = prices(modelId, at);
  return ((inputTokens * inp + outputTokens * out) / 1e6) * feeFactor(modelId) * p;
}

const EXA = 0.007 * OPENROUTER_FEE;

export function singleCost(ds: DatasetId, model: string, at: string) {
  const t = PROFILES[ds];
  return tokenCost(model, t.inp, t.out + t.rsn, at);
}

export function consensusCost(ds: DatasetId, mix: Mix, at: string) {
  const t = PROFILES[ds];
  const n = mix.panel.length;
  const { inp: i, out: o, rsn: r } = t;
  let tot = tokenCost(M.luna, 600, 50, at); // classifier (bench_budget); the harness itself forces the mix, so this is conservative
  for (const m of mix.panel) tot += tokenCost(m, i, o + r, at);
  tot += tokenCost(mix.extractor, 500 + n * o, 300, at);
  tot += tokenCost(mix.verifier, 1500 + Math.floor((n * o) / 2), 600 + Math.floor(r / 2), at);
  tot += tokenCost(mix.judge, 1000 + n * o + 600, 800 + t.jrsn, at, t.pj);
  tot += tokenCost(mix.synthesizer, 1000 + n * o + 600 + 800 * t.pj, 600 + Math.floor(r / 4), at);
  return tot;
}

export function searchAddCost(ds: DatasetId, mix: Mix) {
  const t = PROFILES[ds];
  // bench_budget: verifier-tier input price for reading ~15k tokens of results.
  const vin = (mix.id === "economy" ? 0.3 : 1.25) * OPENROUTER_FEE;
  return t.pj * (4 * EXA + (15000 * vin) / 1e6);
}

export function gradeCost(at: string) {
  const [a, b] = JUDGES.primary;
  return tokenCost(a, 800, 400, at) + tokenCost(b, 800, 100, at);
}

/** Estimated USD for one question in one run of one arm (grading excluded). */
export function armQuestionCost(arm: Arm, ds: DatasetId, at: string): number {
  if (arm.kind === "single") return singleCost(ds, arm.model!, at);
  if (arm.kind === "keplar") {
    const mix = MIXES[arm.mix!];
    return consensusCost(ds, mix, at) + (arm.retrieval ? searchAddCost(ds, mix) : 0);
  }
  return 0; // majority vote and best-single reuse other arms' outputs
}

export type EstimateLine = { dataset: DatasetId; items: number; devItems: number; usd: number; grading: number };
export type Estimate = { lines: EstimateLine[]; total: number; withContingency: number; perCall: { worstCaseNote: string } };

export function estimate(
  plan: { dataset: DatasetId; items: number; devItems: number }[],
  arms: Arm[],
  runsFor: (arm: Arm) => number,
  at: string,
): Estimate {
  const g = gradeCost(at);
  const lines: EstimateLine[] = plan.map(({ dataset, items, devItems }) => {
    let usd = 0;
    let grading = 0;
    for (const arm of arms) {
      if (arm.datasets && !arm.datasets.includes(dataset)) continue;
      const runs = runsFor(arm);
      usd += items * runs * armQuestionCost(arm, dataset, at);
      if (arm.kind !== "best-single") grading += items * runs * g;
      // Dev split: single-model arms once, to choose the best single model.
      if (arm.kind === "single") {
        usd += devItems * armQuestionCost(arm, dataset, at);
        grading += devItems * g;
      }
    }
    return { dataset, items, devItems, usd: usd + grading, grading };
  });
  const total = lines.reduce((a, l) => a + l.usd, 0);
  return { lines, total, withContingency: total * CONTINGENCY, perCall: { worstCaseNote: "The live spend guard reserves each call's max_tokens worst case before sending it." } };
}
