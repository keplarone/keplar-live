/**
 * Fixed questions for the classifier and router lock.
 * The roster is the static live and Free seeds (not a catalog-sync snapshot),
 * the date is pinned, and the learning boost is 1, so CI does not move when a
 * snapshot file or a learning weight changes.
 */
import { HeuristicClassifier } from "@/lib/orchestration/classifier";
import { freeRoster, liveRoster } from "@/lib/orchestration/live-catalog";
import { CostAwareRouter } from "@/lib/orchestration/router";
import type { ComposerModes } from "@/lib/orchestration/types";

export const ROUTE_AT = "2026-10-19T00:00:00.000Z";

export type GoldenCase = {
  id: string;
  plan: "free" | "plus";
  prompt: string;
  modes?: Partial<ComposerModes>;
};

export type LockedRoute = {
  kind: string;
  complexity: string;
  errorProne: "exact" | "fact" | null;
  capabilities: string[];
  needsWeb: boolean;
  mode: "single" | "consensus";
  panel: string[];
  verifier: string | null;
  judge: string | null;
};

const STRATEGY =
  "Should we expand into Japan next year? First compare the market and the competitors, then the regulatory and tax risk, and finally the cash the launch would need. " +
  "Our revenue is concentrated in Europe, the margin is thin, and a market entry would compete with two local incumbents. " +
  "I need a decision, the downsides, and a roadmap for the first year of the expansion, including what would make us stop.";

export const GOLDEN_CASES: readonly GoldenCase[] = [
  { id: "paid-factual", plan: "plus", prompt: "What is the capital of France?" },
  { id: "free-factual", plan: "free", prompt: "What is the capital of France?" },
  { id: "paid-counting", plan: "plus", prompt: "How many letters are in the word strawberry?" },
  { id: "free-counting", plan: "free", prompt: "How many letters are in the word strawberry?" },
  { id: "paid-code", plan: "plus", prompt: "Write a TypeScript function that reverses a string and handles an empty input." },
  { id: "free-code", plan: "free", prompt: "Write a TypeScript function that reverses a string and handles an empty input." },
  { id: "paid-strategy", plan: "plus", prompt: STRATEGY },
  { id: "free-strategy", plan: "free", prompt: STRATEGY },
  { id: "paid-deep", plan: "plus", prompt: "Compare the evidence on remote work productivity.", modes: { deepResearch: true } },
  { id: "free-deep", plan: "free", prompt: "Compare the evidence on remote work productivity.", modes: { deepResearch: true } },
  { id: "paid-writing", plan: "plus", prompt: "Rewrite this announcement so the tone is warmer and shorter." },
  { id: "free-writing", plan: "free", prompt: "Rewrite this announcement so the tone is warmer and shorter." },
  { id: "paid-forecast", plan: "plus", prompt: "Will commercial fusion power exist by 2040?" },
  { id: "free-forecast", plan: "free", prompt: "Will commercial fusion power exist by 2040?" },
  { id: "paid-exact-fact", plan: "plus", prompt: "What year was the Treaty of Westphalia signed?" },
  { id: "free-exact-fact", plan: "free", prompt: "What year was the Treaty of Westphalia signed?" },
];

/** The route HeuristicClassifier and CostAwareRouter pick for one locked question. */
export function lockRoute(c: GoldenCase): LockedRoute {
  const req = {
    prompt: c.prompt,
    plan: c.plan,
    at: ROUTE_AT,
    ...(c.modes ? { modes: c.modes } : {}),
  };
  const cls = new HeuristicClassifier().classify(req);
  const roster = c.plan === "free" ? freeRoster : liveRoster;
  const plan = new CostAwareRouter(roster, () => 1).route(cls, req);
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
