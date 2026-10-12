/**
 * Server side of the Solar modes (src/lib/studio/solar-modes.ts): turns a mode into the real turn profile runStudioTurn uses, and
 * prices each mode with the same numbers a turn is charged with (catalog price via callCostUsd, METER_MARGIN, the Roblox credit
 * rate, USD_PER_UNIT and the configured charge multiplier), so "up to N credits" in the UI is the real ceiling.
 */
import { toUnits, USD_PER_UNIT } from "@/lib/create/platform/compute";
import { costConfig, featureMultiplier } from "@/lib/cost/config";
import { ledgerFeature } from "@/lib/cost/hooks";
import { catalogById } from "@/lib/orchestration/catalog";
import { METER_MARGIN } from "@/lib/orchestration/limits";
import { callCostUsd } from "@/lib/orchestration/pricing";
import { BLENDER_PROFILE } from "@/lib/blender/agent";
import { STUDIO_LIMITS, STUDIO_MODEL, STUDIO_PROFILE, type TurnProfile } from "./agent";
import { creditsForTokens, outputCreditsMax, SOLAR_MODES, solarMode, type SolarModeCredits, type SolarModeId, type SolarPricing, type SolarSurface } from "./solar-modes";

/**
 * Fresh (uncached) input the credit reserve allows for on top of a mode's full output cap. 90,000 tokens keeps Medium's reserve at
 * exactly today's 300 credits for Roblox Studio (output cap 154 + input 139 = 293, so the 300 floor applies). Long conversations
 * are mostly read from the prompt cache at a tenth of the price, so this covers far more history than 90,000 tokens in practice;
 * like today, a step with an unusually large fresh input can still cost more than the reserve.
 */
export const RESERVE_INPUT_TOKENS = 90_000;

export const SURFACE_PROFILE: Record<SolarSurface, TurnProfile> = { studio: STUDIO_PROFILE, blender: BLENDER_PROFILE };

/**
 * The prices a step is charged with right now, for a surface. Rates come from callCostUsd on the catalog entry (the fallback the
 * charge uses when OpenRouter sends no cost; when it does, it reports the provider's price for the same tokens). `chargeMultiplier`
 * is the configured multiplier chargeUnits applies for this meter (1 unless an operator set one).
 */
export async function solarPricing(surface: SolarSurface, at: string = new Date().toISOString()): Promise<SolarPricing | null> {
  const spec = catalogById.get(STUDIO_MODEL);
  if (!spec) return null;
  const inputPer1M = callCostUsd(spec, 1_000_000, 0, at);
  const outputPer1M = callCostUsd(spec, 0, 1_000_000, at);
  if (inputPer1M == null || outputPer1M == null) return null;
  const profile = SURFACE_PROFILE[surface];
  const chargeMultiplier = featureMultiplier(await costConfig(), ledgerFeature(profile.meter));
  return { inputPer1M, outputPer1M, margin: METER_MARGIN, creditRate: profile.creditRate ?? 1, usdPerCredit: USD_PER_UNIT, chargeMultiplier };
}

/** Credits a step in this mode must have available before it starts: its full output cap plus the input allowance, never below 300. */
export function reserveCreditsFor(p: SolarPricing, surface: SolarSurface, id: SolarModeId): number {
  const b = solarMode(id).budgets[surface];
  return Math.max(STUDIO_LIMITS.reserveUnits, creditsForTokens(p, RESERVE_INPUT_TOKENS, b.maxOutputTokens));
}

/** The published mode table for a surface, priced now. */
export async function solarModeTable(surface: SolarSurface, at?: string): Promise<SolarModeCredits[] | null> {
  const p = await solarPricing(surface, at);
  if (!p) return null;
  return SOLAR_MODES.map((m) => {
    const b = m.budgets[surface];
    return { id: m.id, label: m.label, description: m.description, reasoningTokens: b.reasoningTokens, maxOutputTokens: b.maxOutputTokens, outputCreditsMax: outputCreditsMax(p, b), reserveCredits: reserveCreditsFor(p, surface, m.id) };
  });
}

/**
 * The turn profile for a surface in a mode: the surface's prompt, tools policy, meter and model lock unchanged, with the mode's
 * budgets and reserve. Without pricing (no catalog entry) the reserve falls back to today's 300 and runStudioTurn reports the mode
 * as unavailable anyway.
 */
export async function profileForMode(surface: SolarSurface, id: SolarModeId): Promise<TurnProfile> {
  const base = SURFACE_PROFILE[surface];
  const b = solarMode(id).budgets[surface];
  const p = await solarPricing(surface);
  return { ...base, reasoningTokens: b.reasoningTokens, maxOutputTokens: b.maxOutputTokens, mode: id, reserveUnits: p ? reserveCreditsFor(p, surface, id) : STUDIO_LIMITS.reserveUnits };
}

/** Same arithmetic as the charge in runStudioTurn, for cross-checking creditsForTokens in tests. */
export const chargedUnitsForUsd = (usd: number, creditRate: number) => toUnits(usd * METER_MARGIN * creditRate);
