/**
 * Keplar Usage: the usage abstraction the product shows instead of tokens.
 *
 * Internally every request is metered in provider USD and converted to units
 * here. Plan allowances and the Deep Research estimate live in ./plans.ts.
 */
import type { ComputeEstimate, ComputeLevel } from "./types";

/** Internal: provider USD represented by one Keplar Usage unit. */
export const USD_PER_UNIT = 0.002;

/** Every request carries a small fixed cost (classification, routing, synthesis overhead). */
export const BASE_UNITS = 1;

export function toUnits(usd: number): number {
  return Math.max(BASE_UNITS, Math.ceil(usd / USD_PER_UNIT) + BASE_UNITS);
}

export function computeLevel(units: number): ComputeLevel {
  if (units <= 8) return "low";
  if (units <= 60) return "moderate";
  if (units <= 180) return "high";
  return "very-high";
}

export const computeLevelLabel: Record<ComputeLevel, string> = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
  "very-high": "Very high",
};

export function emptyEstimate(): ComputeEstimate {
  return { usd: 0, units: BASE_UNITS, breakdown: [] };
}
