/**
 * Free-plan hard guard (no fs or network; pure).
 *
 * The Free plan may ONLY call OpenRouter `:free` models priced at $0 for both
 * prompt and completion. Anything else is refused before a request is sent:
 *   - a model with any nonzero price window (or no known price)
 *   - a model whose OpenRouter slug doesn't end in `:free`
 *   - any provider other than OpenRouter (never OpenAI or NVIDIA direct)
 * The registry applies this to every Free-plan call (panel, extractor,
 * verifier, synthesizer and every fallback).
 */
import type { ModelSpec } from "./types";

export const FREE_PLAN_REFUSAL = "Refused: the Free plan can only use free ($0) models.";

/** True only for a $0 OpenRouter `:free` model. */
export function isFreeModel(model: ModelSpec): boolean {
  const slug = model.routes?.openrouter;
  if (!slug || !slug.endsWith(":free")) return false;
  // Only the OpenRouter route may exist: a direct route would be a paid path.
  if (Object.keys(model.routes ?? {}).some((r) => r !== "openrouter")) return false;
  if (!model.pricing.length) return false;
  return model.pricing.every((w) => w.inputPer1M === 0 && w.outputPer1M === 0) && (model.longContext ?? []).every((t) => t.inputPer1M === 0 && t.outputPer1M === 0);
}

/** True when this provider may serve a Free-plan call to this model. */
export function freeCallAllowed(providerName: string, model: ModelSpec): boolean {
  return providerName === "openrouter" && isFreeModel(model);
}

/** OpenRouter price strings (USD per token) → true only when both are exactly 0. */
export function isZeroPriced(pricing?: { prompt?: string; completion?: string }): boolean {
  if (!pricing || pricing.prompt == null || pricing.completion == null) return false;
  return Number(pricing.prompt) === 0 && Number(pricing.completion) === 0;
}
