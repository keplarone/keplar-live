/** Slides cost estimates (pure, safe for client code): the figures shown before a run. A real run is charged from the provider's reported cost. */
import { creditsForUsd, estimateCallUsd, tokensOf, type ToolPlan } from "@/lib/tools/models";

/** Output tokens a deck of `count` slides needs (also the cap on the call). */
export const deckOutputTokens = (count: number) => Math.min(8000, 500 + count * 330);

/** Estimated provider USD for a deck of `count` slides from `chars` characters of input. Free is 0. */
export function estimateDeckUsd(plan: ToolPlan, chars: number, count: number): number {
  return estimateCallUsd(plan, tokensOf(chars) + 700, deckOutputTokens(count));
}

/** Estimated credits (with the 1.1 margin) for a deck; a typical run lands near it, a long source can cost more. */
export const estimateDeckCredits = (plan: ToolPlan, chars: number, count: number) => creditsForUsd(estimateDeckUsd(plan, chars, count));

/** Estimated provider USD to rewrite one slide. */
export const estimateSlideUsd = (plan: ToolPlan, deckChars: number) => estimateCallUsd(plan, tokensOf(deckChars) + 500, 900);
export const estimateSlideCredits = (plan: ToolPlan, deckChars: number) => creditsForUsd(estimateSlideUsd(plan, deckChars));
