/**
 * The global circuit breaker's "lighter models" switch, applied to chat answers.
 *   normal   no change
 *   cheap    fast strategy (fewer models, no judge), at most 3 models
 *   no_media same, at most 2 models
 *   capped   fast strategy, ONE model (paid text keeps working on the cheapest route)
 * A user's own stricter limit (fewer models) is kept.
 */
import type { RoutingPreferences } from "./types";
import type { BreakerLevel } from "@/lib/create/platform/breaker";

const MAX: Record<BreakerLevel, number> = { normal: 6, cheap: 3, no_media: 2, capped: 1 };

export function lighterRouting(routing: RoutingPreferences | undefined, level: BreakerLevel): RoutingPreferences | undefined {
  if (level === "normal") return routing;
  return { ...(routing ?? {}), strategy: "fast", maxModels: Math.min(routing?.maxModels ?? 6, MAX[level]) };
}
