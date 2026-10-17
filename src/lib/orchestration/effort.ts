/**
 * Effort: the one choice the composer offers instead of separate depth / strategy / model-count knobs.
 *
 *   low     fewest credits: one model, one direct pass, light thinking, short output
 *   medium  a sensible default: a small panel (up to 3), Keplar picks the depth, normal thinking
 *   high    a lot more work: up to 5 models, a planned and checked answer, more thinking per model
 *   max     the most work Keplar does: up to 6 models, keeps checking and revising, the most thinking per model
 *
 * The preset decides the routing (depth, strategy, model cap) and how hard each panel model thinks; the person's other
 * routing choices (data tier, excluded families, open weights) are kept. Plan limits still apply on top.
 */
import type { Depth } from "@/lib/core/types";
import type { GenerationParams, RoutingPreferences, RoutingStrategy } from "./types";

export type Effort = "low" | "medium" | "high" | "max";
export const EFFORTS = ["low", "medium", "high", "max"] as const;
export const DEFAULT_EFFORT: Effort = "medium";

export const isEffort = (v: unknown): v is Effort => typeof v === "string" && (EFFORTS as readonly string[]).includes(v);

type Preset = { depth: Depth; strategy: RoutingStrategy; maxModels: number };
const PRESETS: Record<Effort, Preset> = {
  low: { depth: "quick", strategy: "fast", maxModels: 1 },
  medium: { depth: "auto", strategy: "auto", maxModels: 3 },
  high: { depth: "thorough", strategy: "thorough", maxModels: 5 },
  max: { depth: "exhaustive", strategy: "thorough", maxModels: 6 },
};

export const EFFORT_INFO: Record<Effort, { label: string; hint: string; warn: boolean }> = {
  low: { label: "Low", hint: "One model, one quick pass. Uses the fewest credits.", warn: false },
  medium: { label: "Medium", hint: "A small panel of models, checked when it matters. A balanced amount of credits.", warn: false },
  high: { label: "High", hint: "More models think longer, and the answer is planned and checked step by step. Uses a lot more credits.", warn: true },
  max: { label: "Max", hint: "Every model Keplar can use, thinking hardest, revised until it holds up. Uses the most credits by far.", warn: true },
};

/** The routing an effort stands for, keeping the person's data and provider choices. */
export function routingForEffort(effort: Effort, base: RoutingPreferences = {}): RoutingPreferences {
  const p = PRESETS[effort];
  return { ...base, effort, depth: p.depth, strategy: p.strategy, maxModels: p.maxModels };
}

/** How hard each live panel model works at this effort (medium leaves Keplar's per-question choice as it is). */
export function panelParamsForEffort(params: GenerationParams, effort: Effort | undefined): GenerationParams {
  const tokens = params.maxOutputTokens ?? 1400;
  switch (effort) {
    case "low": return { ...params, reasoningEffort: "low", maxOutputTokens: Math.min(tokens, 1000) };
    case "high": return { ...params, reasoningEffort: params.reasoningEffort === "high" ? "high" : "medium", maxOutputTokens: Math.round(tokens * 1.4) };
    case "max": return { ...params, reasoningEffort: "high", maxOutputTokens: Math.round(tokens * 1.8) };
    default: return params;
  }
}
