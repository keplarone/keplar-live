/**
 * Model choice and cost estimates for Slides and Study (pure: no fs, no network, safe for client code).
 *
 * - Free: only the $0 `:free` roster (enforced again by the registry's hard guard, free-guard.ts).
 * - Plus: the cheap live roster, Gemini 3.1 Flash-Lite first.
 * - Pro (and Business/admin): the judge-tier Gemini 3.8 Flash first, with the Plus models as fallbacks.
 * Prices come from the roster seeds (OpenRouter list prices); a real run is charged from the cost the
 * provider reports, and these figures are only the estimate shown before the run.
 */
import { liveRoster } from "@/lib/orchestration/live-catalog";
import { callCostUsd } from "@/lib/orchestration/pricing";
import { METER_MARGIN } from "@/lib/orchestration/limits";
import { USD_PER_UNIT } from "@/lib/orchestration/compute";

export type ToolPlan = "free" | "lite" | "plus" | "pro" | "business";

/** Free models for tool calls, most available first (same order the chat engine falls back in). */
export const FREE_TOOL_IDS = ["free:nemotron-3-super", "free:dots-3-note", "free:nemotron-3.5-lightning", "free:qwen3.8-27b", "free:gemma-4-31b"] as const;

export const PAID_TOOL_IDS: Record<Exclude<ToolPlan, "free">, readonly string[]> = {
  lite: ["live:gemini-3.1-flash-lite", "live:qwen3.8-flash", "live:deepseek-v4-flash"],
  plus: ["live:gemini-3.1-flash-lite", "live:qwen3.8-flash", "live:deepseek-v4-flash"],
  pro: ["live:gemini-3.8-flash", "live:gemini-3.1-flash-lite", "live:qwen3.8-flash"],
  business: ["live:gemini-3.8-flash", "live:gemini-3.1-flash-lite", "live:qwen3.8-flash"],
};

export const toolModelIds = (plan: ToolPlan): readonly string[] => (plan === "free" ? FREE_TOOL_IDS : PAID_TOOL_IDS[plan]);

/** ~3.5 characters per token, the same rule the spend guard uses. */
export const tokensOf = (chars: number) => Math.ceil(chars / 3.5) + 40;

/** Estimated provider USD for one call on the plan's first-choice model (Free: always 0). */
export function estimateCallUsd(plan: ToolPlan, inputTokens: number, outputTokens: number): number {
  if (plan === "free") return 0;
  const id = PAID_TOOL_IDS[plan][0];
  const model = liveRoster.find((m) => m.id === id);
  return model ? (callCostUsd(model, inputTokens, outputTokens, new Date().toISOString()) ?? 0) : 0;
}

/** Credits for a provider cost, with the safety margin (1 credit = $0.002). At least 1 for any paid cost. */
export function creditsForUsd(usd: number): number {
  if (!(usd > 0)) return 0;
  return Math.max(1, Math.ceil((usd * METER_MARGIN) / USD_PER_UNIT));
}
