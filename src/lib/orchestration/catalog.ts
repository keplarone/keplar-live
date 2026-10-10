/**
 * Model catalog for Keplar-One routing.
 *
 * Source of truth: catalog.json, copied verbatim from the model research of
 * 2026-09-27 (/workspace/research/ai-models-2026-09-27.{json,md}). The JSON
 * carries identity, price, context and role; the research notes add API
 * behaviour and pricing mechanics that the JSON does not encode. Those are
 * layered on below as overrides so the raw file can be refreshed untouched.
 *
 * Re-verify prices before any billing forecast: the research notes that
 * pricing churns monthly.
 */
import raw from "./catalog.json";
import { freeRoster, liveRoster } from "./live-catalog";
import type { LongContextTier, ModelCapabilities, ModelRole, ModelSpec, PriceWindow } from "./types";

type RawModel = {
  provider: string;
  model_name: string;
  api_model_id: string | null;
  release_date: string | null;
  open_weights: boolean;
  context_window_tokens: number | null;
  input_price_per_1m_usd: number | null;
  output_price_per_1m_usd: number | null;
  strengths: string[];
  suggested_role: ModelRole;
  source_url: string;
  verified: boolean;
};

type Override = {
  capabilities?: ModelCapabilities;
  /** Replaces the single JSON price with dated windows. */
  pricing?: PriceWindow[];
  longContext?: LongContextTier[];
  offPeakMultiplier?: number;
  displayName?: string;
};

/**
 * Research §4 "API constraints that matter for ensembling" and §2 notes.
 * - GPT-6 Astra rejects custom temperature, top_p and logprobs.
 * - Claude Sonnet 5 returns 400 for non-default temperature / top_p / top_k.
 * - Grok 4.20+ silently ignores logprobs (Grok 4.7 is in that line; research §1
 *   also lists "No logprobs" and encrypted reasoning for it).
 * - Anthropic never returns raw chain of thought.
 * - Opus 5.5, Fable 5.1, GLM-5.3, Kimi K3 cannot fully disable reasoning.
 * - Fable 5.x may return stop_reason "refusal" and requires 30-day retention.
 * - Gemini 3.8 Flash's intro price doubles on 2027-01-01 (0.75/3.75 → 1.50/7.50).
 * - GPT-5.6 Sol's promotional price runs "at least through Nov 21, 2026";
 *   after that the price is unknown, so the model stops being routable.
 * - Long-context surcharges: OpenAI above 272K (Astra $20/$75), xAI ≥200K
 *   (Grok 4.7 $4/$12).
 * - DeepSeek list prices are peak; off-peak is 50%.
 */
const overrides: Record<string, Override> = {
  "gpt-6-astra": {
    capabilities: { rejectsTemperature: true, rejectsTopP: true, rejectsLogprobs: true },
    longContext: [{ aboveTokens: 272_000, inputPer1M: 20, outputPer1M: 75 }],
  },
  "gpt-6-sol": { longContext: [{ aboveTokens: 272_000, inputPer1M: 4, outputPer1M: 20 }] },
  "gpt-5.6-sol": {
    displayName: "GPT-5.6 Sol",
    pricing: [
      { from: null, until: "2026-11-21", inputPer1M: 4, outputPer1M: 20, note: "Promotional price, at least through Nov 21, 2026" },
    ],
  },
  "claude-sonnet-5": {
    capabilities: { rejectsTemperature: true, rejectsTopP: true, hiddenReasoning: true },
  },
  "claude-opus-5-5": { capabilities: { alwaysReasons: true, hiddenReasoning: true } },
  "claude-fable-5-1": {
    capabilities: { alwaysReasons: true, hiddenReasoning: true, mayRefuse: true, requiresProviderRetention: true },
  },
  "claude-haiku-4-5-20251001": { capabilities: { hiddenReasoning: true } },
  "grok-4.7": {
    capabilities: { ignoresLogprobs: true, hiddenReasoning: true },
    longContext: [{ aboveTokens: 200_000, inputPer1M: 4, outputPer1M: 12 }],
  },
  "gemini-3.8-flash": {
    pricing: [
      { from: null, until: "2026-12-31", inputPer1M: 0.75, outputPer1M: 3.75, note: "Introductory price" },
      { from: "2027-01-01", inputPer1M: 1.5, outputPer1M: 7.5 },
    ],
  },
  "glm-5.3": { capabilities: { alwaysReasons: true } },
  "kimi-k3": { capabilities: { alwaysReasons: true } },
  "deepseek-flash": { displayName: "DeepSeek-V4.1-Flash", offPeakMultiplier: 0.5 },
  "deepseek-v4-pro": { displayName: "DeepSeek-V4-Pro", offPeakMultiplier: 0.5 },
  "qwen3.8-max": { displayName: "Qwen3.8-Max" },
};

const familyOf = (provider: string) => {
  const p = provider.toLowerCase();
  if (p.startsWith("xai")) return "xAI";
  if (p.startsWith("alibaba")) return "Qwen";
  if (p.startsWith("zhipu")) return "Zhipu";
  if (p.startsWith("moonshot")) return "Moonshot";
  return provider.split(" ")[0];
};

/** Strip research annotations such as "(peak price; off-peak 50%)" from display names. */
const cleanName = (name: string) => name.replace(/\s*\((?:peak|promotional|preview)[^)]*\)/i, "").trim();

function normalise(m: RawModel): ModelSpec {
  const id = m.api_model_id ?? `unlisted:${m.model_name}`;
  const o = m.api_model_id ? overrides[m.api_model_id] : undefined;
  const hasPrice = m.input_price_per_1m_usd != null && m.output_price_per_1m_usd != null;
  const pricing: PriceWindow[] =
    o?.pricing ??
    (hasPrice ? [{ from: null, inputPer1M: m.input_price_per_1m_usd!, outputPer1M: m.output_price_per_1m_usd! }] : []);
  return {
    id,
    name: o?.displayName ?? cleanName(m.model_name),
    provider: m.provider,
    family: familyOf(m.provider),
    role: m.suggested_role,
    strengths: m.strengths,
    contextWindow: m.context_window_tokens,
    openWeights: m.open_weights,
    verified: m.verified,
    releaseDate: m.release_date,
    sourceUrl: m.source_url,
    pricing,
    longContext: o?.longContext,
    offPeakMultiplier: o?.offPeakMultiplier,
    capabilities: o?.capabilities ?? {},
    routable: Boolean(m.api_model_id) && pricing.length > 0,
  };
}

export const catalog: readonly ModelSpec[] = (raw as RawModel[]).map(normalise);

/** Research catalog plus the live roster (live ids are prefixed "live:"), for name lookups. */
export const catalogById = new Map([...catalog, ...liveRoster, ...freeRoster].map((m) => [m.id, m]));

export const providerFamilies = [...new Set(catalog.filter((m) => m.routable).map((m) => m.family))];
