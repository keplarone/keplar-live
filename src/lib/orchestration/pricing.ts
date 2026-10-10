import type { GenerationParams, ModelSpec, PriceWindow } from "./types";

const day = (iso: string) => iso.slice(0, 10);

/** The price window in force on `at` (ISO date or datetime), or null if unknown. */
export function priceWindowAt(model: ModelSpec, at: string): PriceWindow | null {
  const d = day(at);
  return (
    model.pricing.find((w) => (w.from == null || d >= w.from) && (w.until == null || d <= w.until)) ?? null
  );
}

/**
 * Estimated USD for one call. Applies dated pricing and long-context tiers.
 * Returns null when the model has no known price on that date (never guess).
 */
export function callCostUsd(
  model: ModelSpec,
  inputTokens: number,
  outputTokens: number,
  at: string,
): number | null {
  const w = priceWindowAt(model, at);
  if (!w) return null;
  let inRate = w.inputPer1M;
  let outRate = w.outputPer1M;
  for (const tier of model.longContext ?? []) {
    if (inputTokens > tier.aboveTokens) {
      inRate = tier.inputPer1M;
      outRate = tier.outputPer1M;
    }
  }
  return (inputTokens * inRate + outputTokens * outRate) / 1_000_000;
}

/** Blended price used for ranking (assumes a 3:1 input:output mix). */
export function blendedPrice(model: ModelSpec, at: string): number | null {
  const w = priceWindowAt(model, at);
  return w ? (w.inputPer1M * 3 + w.outputPer1M) / 4 : null;
}

/**
 * Remove parameters the provider rejects or ignores. Confidence must come from
 * agreement and verifier scores, never from logprobs, so they are dropped for
 * models that ignore them too.
 */
export function sanitizeParams(model: ModelSpec, params: GenerationParams): GenerationParams {
  const c = model.capabilities;
  const out: GenerationParams = { ...params };
  if (c.rejectsTemperature) delete out.temperature;
  if (c.rejectsTopP) delete out.topP;
  if (c.rejectsLogprobs || c.ignoresLogprobs) delete out.logprobs;
  return out;
}

/**
 * What one provider call cost: the billed figure when the provider reported
 * one (OpenRouter `usage.cost`), otherwise the token-priced estimate from the
 * catalog. Never zero for a priced model just because a provider stayed quiet.
 */
export function spentUsd(model: ModelSpec, r: { actualCostUsd?: number; usage?: { inputTokens: number; outputTokens: number } }, at = new Date().toISOString()): number {
  if (typeof r.actualCostUsd === "number") return r.actualCostUsd;
  if (!r.usage) return 0;
  return callCostUsd(model, r.usage.inputTokens, r.usage.outputTokens, at) ?? 0;
}
