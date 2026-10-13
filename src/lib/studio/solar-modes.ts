/**
 * Solar 5.8 execution modes: Light, Medium, High, Max and Ultimate+.
 *
 * Client-safe on purpose (no server imports): the Studio and Blender screens read the ordered list, labels, descriptions and the
 * real per-step budgets from here, and the server (src/lib/studio/solar-modes-server.ts, src/lib/studio/agent.ts) runs every turn
 * with exactly these numbers. Nothing here is a separate model. Every mode runs the same foundation model.
 *
 * - `reasoningTokens`: the thinking budget sent as OpenRouter's `reasoning.max_tokens` for that step.
 * - `maxOutputTokens`: the step's `max_tokens` cap. Thinking counts toward it, so the room left for the visible reply and the
 *   tool call (a whole build script) is `maxOutputTokens - reasoningTokens`.
 *
 * How the numbers were chosen (Solar 5.8 5.5: 1M context, 128K output cap, $4 / $20 per million input / output tokens):
 *
 * 1. Medium is today's behaviour exactly (Studio: 3,000 / 20,000; Blender: 1,500 / 8,000), so nobody sees a change by default.
 * 2. Thinking must stay below `max_tokens` (OpenRouter and Anthropic reject or truncate otherwise), and every mode keeps at least as
 *    much room for the reply as Light: a tool call cut off by the cap is a broken step, so deeper modes add thinking on top of
 *    the reply room instead of taking from it. Light starts at 1,024, Anthropic's documented minimum for a thinking budget.
 * 3. Every request is non-streaming and bounded by the route's `maxDuration` (300 s) through `STUDIO_LIMITS.timeoutMs`
 *    (270 s, the same for every mode). The timeout is not raised: 300 s is the ceiling every long route in this app is deployed
 *    with. The caps are ceilings, not targets: a step is one reply plus at most one tool call and usually stops well short of
 *    them. The largest step (Ultimate+, 38,000 tokens) stays far below Solar 5.8 128K output cap; a step that would still be
 *    generating at 270 s is aborted, fails with an error and is not charged (the same as in Medium today).
 * 4. Solar 5.8 itself controls thinking with an effort setting, not a token budget (Anthropic's API rejects a fixed
 *    thinking budget for this model). Keplar sends the budget as OpenRouter's `reasoning.max_tokens`, as it always has for
 *    Medium, and OpenRouter decides how that request is applied to the model. So `reasoningTokens` is a requested budget, not a
 *    guaranteed amount of thinking; `maxOutputTokens` is a hard cap. Check `usage.reasoningTokens` per mode in production.
 * 5. Output is the expensive side ($20 per million), so the budgets grow in steps the credit reserve can still cover: the server
 *    requires `reserveCredits` before a step starts, computed from the real price for the full output cap plus a fixed allowance
 *    of fresh input (see solar-modes-server.ts), never less than today's 300.
 */

export type SolarModeId = "low" | "medium" | "high" | "max" | "ultracode";

/** Which co-builder a turn is for. Blender has always run smaller budgets than Roblox Studio, and keeps them per mode. */
export type SolarSurface = "studio" | "blender";

/** The real per-step configuration a mode sends to the model. */
export type SolarBudget = {
  /** OpenRouter `reasoning.max_tokens`: thinking before the step (billed as output). */
  reasoningTokens: number;
  /** OpenRouter `max_tokens`: everything the step may generate, thinking included. Always greater than `reasoningTokens`. */
  maxOutputTokens: number;
};

export type SolarMode = {
  id: SolarModeId;
  /** Product name shown in the UI. */
  label: string;
  /** One line, truthful: what changes, not how good the result will be. */
  description: string;
  budgets: Record<SolarSurface, SolarBudget>;
};

/** The default for a request without a mode: today's behaviour. */
export const DEFAULT_SOLAR_MODE: SolarModeId = "medium";

/** Ordered from least to most thinking per step. */
export const SOLAR_MODES: readonly SolarMode[] = [
  {
    id: "low",
    label: "Light",
    description: "Requests the least thinking per step and has a smaller output cap. The lowest credit ceiling per step.",
    budgets: { studio: { reasoningTokens: 1_024, maxOutputTokens: 16_000 }, blender: { reasoningTokens: 1_024, maxOutputTokens: 6_000 } },
  },
  {
    id: "medium",
    label: "Medium",
    description: "The standard configuration: a moderate thinking budget per step. The default.",
    budgets: { studio: { reasoningTokens: 3_000, maxOutputTokens: 20_000 }, blender: { reasoningTokens: 1_500, maxOutputTokens: 8_000 } },
  },
  {
    id: "high",
    label: "High",
    description: "Requests about twice Medium's thinking budget per step, with a larger output cap to keep room for the reply.",
    budgets: { studio: { reasoningTokens: 6_000, maxOutputTokens: 24_000 }, blender: { reasoningTokens: 3_000, maxOutputTokens: 10_000 } },
  },
  {
    id: "max",
    label: "Max",
    description: "Requests about four times Medium's thinking budget per step, with a larger output cap. Can use more credits per step.",
    budgets: { studio: { reasoningTokens: 12_000, maxOutputTokens: 30_000 }, blender: { reasoningTokens: 6_000, maxOutputTokens: 14_000 } },
  },
  {
    id: "ultracode",
    label: "Ultimate+",
    description: "The deepest configuration: the largest requested thinking budget and output cap per step. Can use the most credits per step.",
    budgets: { studio: { reasoningTokens: 20_000, maxOutputTokens: 38_000 }, blender: { reasoningTokens: 10_000, maxOutputTokens: 18_000 } },
  },
];

export const SOLAR_MODE_IDS: readonly SolarModeId[] = SOLAR_MODES.map((m) => m.id);

const BY_ID = new Map<string, SolarMode>(SOLAR_MODES.map((m) => [m.id, m]));

export const isSolarModeId = (v: unknown): v is SolarModeId => typeof v === "string" && BY_ID.has(v);

/** The mode for an id. Throws on an unknown id (callers validate first with `parseSolarMode` or `isSolarModeId`). */
export function solarMode(id: SolarModeId): SolarMode {
  const m = BY_ID.get(id);
  if (!m) throw new Error(`Unknown Solar mode: ${String(id)}`);
  return m;
}

/**
 * Strict request parsing: a missing mode (undefined or null) is Medium; one of the five ids is that mode; anything else
 * (labels like "Light", other casing, numbers, objects) is `null`, which the routes answer with a 400.
 */
export function parseSolarMode(raw: unknown): SolarModeId | null {
  if (raw === undefined || raw === null) return DEFAULT_SOLAR_MODE;
  return isSolarModeId(raw) ? raw : null;
}

/** The price inputs a credit estimate needs. The server fills these from the same values it charges with. */
export type SolarPricing = {
  /** USD per million input tokens (uncached). */
  inputPer1M: number;
  /** USD per million output tokens (thinking included). */
  outputPer1M: number;
  /** Safety margin on metered cost (METER_MARGIN). */
  margin: number;
  /** Share of the metered cost charged as credits (Roblox building: ROBLOX_CREDIT_RATE; Blender: 1). */
  creditRate: number;
  /** USD of metered cost per credit (USD_PER_UNIT). */
  usdPerCredit: number;
  /** Configured charge multiplier for this meter at the time of the estimate (1 = none). */
  chargeMultiplier: number;
};

/**
 * Credits charged for a step with these token counts, using the same arithmetic as the charge in runStudioTurn
 * (`toUnits(usd * margin * creditRate)`, at least 1, then the configured multiplier, rounded up). Input is priced uncached:
 * cached reads cost less, so this is an upper bound for the given counts. Zero tokens cost nothing (nothing is charged).
 */
export function creditsForTokens(p: SolarPricing, promptTokens: number, outputTokens: number): number {
  const usd = (Math.max(0, promptTokens) * p.inputPer1M + Math.max(0, outputTokens) * p.outputPer1M) / 1_000_000;
  if (!(usd > 0)) return 0;
  const units = Math.max(1, Math.ceil((usd * p.margin * p.creditRate) / p.usdPerCredit));
  return p.chargeMultiplier === 1 ? units : Math.ceil(units * p.chargeMultiplier);
}

/**
 * The most a step can cost for what the model generates: the mode's whole `max_tokens` cap billed as output. This part is a hard
 * ceiling. Input is not included because it depends on the conversation's length (see `creditsForTokens` for a given size).
 */
export const outputCreditsMax = (p: SolarPricing, budget: SolarBudget): number => creditsForTokens(p, 0, budget.maxOutputTokens);

/** One row of the mode table the server publishes (GET /api/studio/modes), with credits computed from the real prices. */
export type SolarModeCredits = {
  id: SolarModeId;
  label: string;
  description: string;
  reasoningTokens: number;
  maxOutputTokens: number;
  /** Hard ceiling, in credits, for the model's output in one step (thinking included). */
  outputCreditsMax: number;
  /** Credits that must be available before a step starts in this mode (covers the output cap plus an input allowance). */
  reserveCredits: number;
};

/** Accurate provider disclosure for the UI's technical-details section. */
export const SOLAR_TECHNICAL_DETAILS = {
  product: "Solar 5.8",
  foundationModel: "Solar 5.8",
  developer: "Keplar One",
  servedThrough: "Keplar",
  openRouterModelId: "keplarone/keplar-solar 5.8",
  summary:
    "Solar 5.8 runs on Solar 5.8, a model developed by Anthropic, served through OpenRouter. Light, Medium, High, Max and Ultimate+ are execution configurations of that one model: each sets the thinking budget Keplar requests and the cap on what the model may write in each step. They are not separately trained models.",
  modes:
    "A mode sets two numbers per step: the requested thinking budget (OpenRouter reasoning.max_tokens) and the output cap (max_tokens, which includes thinking). Solar 5.8 controls its thinking with an effort setting rather than a token budget, so how the requested budget is applied is decided by OpenRouter; the output cap is always enforced. The model often uses less than either. Deeper modes can use more credits per step.",
  studioModelLock:
    "Roblox Studio mode only runs on Solar 5.8: an answer reported by any other model is discarded and not charged, and Studio pauses instead of switching models.",
  blenderModel:
    "Blender mode requests Solar 5.8 through OpenRouter for every step but is not model-locked: when Keplar's cost safeguards are active, a step can be answered by another model. The model that answered is reported with each step's usage.",
  billing:
    "Each step is charged from the provider's reported cost for the tokens actually used, with Keplar's normal margin. The output cap is a ceiling, not an estimate.",
} as const;
