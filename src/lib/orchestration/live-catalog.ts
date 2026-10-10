/**
 * Live model roster: the cheap models Keplar calls when live mode is on
 * (KEPLAR_LIVE_MODELS=1 + keys). Separate from catalog.json (the research
 * catalog used by the demo and the benchmark), because the live accounts are on
 * free / low-limit plans: every model here is cheap (blended ≤ $1.50 / 1M).
 *
 * Picked on 2026-09-28 from each provider's live /models list:
 *   - OpenRouter GET /api/v1/models (primary route, one family per panel seat)
 *   - OpenAI     GET /v1/models
 *   - NVIDIA     GET https://integrate.api.nvidia.com/v1/models (diverse families)
 * Prices are OpenRouter list prices per 1M tokens on that date. NVIDIA-hosted
 * calls are metered at the same price (conservative; the NVIDIA API is credit-based).
 * `npm run catalog:sync` refreshes availability and prices (catalog-sync.ts).
 *
 * No fs or network here: this file is safe to import from client code.
 */
import type { ModelSpec } from "./types";

type LiveSeed = {
  id: string;
  name: string;
  provider: string;
  family: string;
  role: ModelSpec["role"];
  strengths: string[];
  contextWindow: number;
  openWeights: boolean;
  inputPer1M: number;
  outputPer1M: number;
  routes: NonNullable<ModelSpec["routes"]>;
  /** OpenRouter `architecture.input_modalities` on the pick date (refreshed by catalog sync). */
  input: string[];
};

// Input modalities from GET https://openrouter.ai/api/v1/models (architecture.input_modalities), 2026-09-28.
const TEXT = ["text"];
const VISION = ["text", "image"];
const VISION_VIDEO = ["text", "image", "video"];
const MULTI = ["text", "image", "video", "file", "audio"];

const SEEDS: LiveSeed[] = [
  // ── OpenRouter (primary, multi-family) ──
  { id: "live:gemini-3.1-flash-lite", name: "Gemini 3.1 Flash-Lite", provider: "Google", family: "Google", role: "primary", strengths: ["speed", "cost", "long-context", "multimodal"], contextWindow: 1_048_576, openWeights: false, inputPer1M: 0.25, outputPer1M: 1.5, routes: { openrouter: "google/gemini-3.1-flash-lite" }, input: MULTI },
  { id: "live:deepseek-v4-flash", name: "DeepSeek V4 Flash", provider: "DeepSeek", family: "DeepSeek", role: "primary", strengths: ["reasoning", "coding", "cost"], contextWindow: 1_048_576, openWeights: true, inputPer1M: 0.05, outputPer1M: 0.1, routes: { openrouter: "deepseek/deepseek-v4-flash" }, input: TEXT },
  { id: "live:qwen3.8-flash", name: "Qwen3.8 Flash", provider: "Alibaba Qwen", family: "Qwen", role: "primary", strengths: ["reasoning", "multilingual", "cost"], contextWindow: 1_000_000, openWeights: false, inputPer1M: 0.15, outputPer1M: 0.47, routes: { openrouter: "qwen/qwen3.8-flash" }, input: VISION_VIDEO },
  { id: "live:mistral-small-2603", name: "Mistral Small (2603)", provider: "Mistral", family: "Mistral", role: "primary", strengths: ["writing", "multilingual", "sovereign-eu"], contextWindow: 262_144, openWeights: false, inputPer1M: 0.15, outputPer1M: 0.6, routes: { openrouter: "mistralai/mistral-small-2603" }, input: VISION },
  // Judge tier: synthesis, draft and (complex questions) the judge review. Still cheap.
  { id: "live:gemini-3.8-flash", name: "Gemini 3.8 Flash", provider: "Google", family: "Google", role: "judge", strengths: ["reasoning", "knowledge-work", "long-context"], contextWindow: 1_048_576, openWeights: false, inputPer1M: 0.75, outputPer1M: 3.75, routes: { openrouter: "google/gemini-3.8-flash" }, input: MULTI },
  // ── OpenAI (direct; OpenRouter as fallback) ──
  { id: "live:gpt-6-luna", name: "GPT-6 Luna", provider: "OpenAI", family: "OpenAI", role: "primary", strengths: ["reasoning", "speed", "cost", "long-context"], contextWindow: 1_050_000, openWeights: false, inputPer1M: 0.1, outputPer1M: 0.5, routes: { openai: "gpt-6-luna", openrouter: "openai/gpt-6-luna" }, input: ["text", "image", "file"] },
  { id: "live:gpt-5-nano", name: "GPT-5 nano", provider: "OpenAI", family: "OpenAI", role: "fast-cheap", strengths: ["speed", "cost"], contextWindow: 400_000, openWeights: false, inputPer1M: 0.05, outputPer1M: 0.4, routes: { openai: "gpt-5-nano", openrouter: "openai/gpt-5-nano" }, input: ["text", "image", "file"] },
  // ── NVIDIA (integrate.api.nvidia.com; diverse families; OpenRouter as fallback) ──
  { id: "live:nemotron-3-super", name: "Nemotron 3 Super 120B", provider: "NVIDIA", family: "NVIDIA", role: "primary", strengths: ["reasoning", "agentic"], contextWindow: 262_144, openWeights: true, inputPer1M: 0.08, outputPer1M: 0.45, routes: { nvidia: "nvidia/nemotron-3-super-120b-a12b", openrouter: "nvidia/nemotron-3-super-120b-a12b" }, input: TEXT },
  { id: "live:glm-5.3-flash", name: "GLM-5.3 Flash", provider: "Zhipu / Z.ai", family: "Zhipu", role: "verifier", strengths: ["reasoning", "cost", "speed"], contextWindow: 1_310_720, openWeights: true, inputPer1M: 0.15, outputPer1M: 0.5, routes: { nvidia: "z-ai/glm-5.3-flash", openrouter: "z-ai/glm-5.3-flash" }, input: VISION_VIDEO },
  { id: "live:gemma-4-31b", name: "Gemma 4 31B", provider: "Google", family: "Gemma", role: "primary", strengths: ["multilingual", "cost"], contextWindow: 262_144, openWeights: true, inputPer1M: 0.09, outputPer1M: 0.34, routes: { nvidia: "google/gemma-4-31b-it", openrouter: "google/gemma-4-31b-it" }, input: VISION_VIDEO },
  { id: "live:gpt-oss-20b", name: "gpt-oss-20b", provider: "OpenAI (open weights)", family: "gpt-oss", role: "fast-cheap", strengths: ["speed", "cost", "reasoning"], contextWindow: 131_072, openWeights: true, inputPer1M: 0.02, outputPer1M: 0.09, routes: { nvidia: "openai/gpt-oss-20b", openrouter: "openai/gpt-oss-20b" }, input: TEXT },
];

const SOURCE: Record<string, string> = {
  openrouter: "https://openrouter.ai/api/v1/models",
  openai: "https://api.openai.com/v1/models",
  nvidia: "https://integrate.api.nvidia.com/v1/models",
};

export function liveSpec(s: LiveSeed): ModelSpec {
  return {
    id: s.id,
    name: s.name,
    provider: s.provider,
    family: s.family,
    role: s.role,
    strengths: s.strengths,
    contextWindow: s.contextWindow,
    openWeights: s.openWeights,
    verified: true,
    releaseDate: null,
    sourceUrl: SOURCE[Object.keys(s.routes)[0]] ?? SOURCE.openrouter,
    pricing: [{ from: null, inputPer1M: s.inputPer1M, outputPer1M: s.outputPer1M, note: "OpenRouter list price, 2026-09-28" }],
    capabilities: {},
    routable: true,
    routes: { ...s.routes },
    inputModalities: [...s.input],
  };
}

export const LIVE_SEEDS: readonly LiveSeed[] = SEEDS;
export type { LiveSeed };

/** Static live roster (before any catalog-sync snapshot is applied). */
export const liveRoster: readonly ModelSpec[] = SEEDS.map(liveSpec);

/** Fixed live roles outside the router's panel choice. */
export const LIVE_ROLES = {
  /** Classifies panel responses into positions and claims (cheap, fast, structured output). */
  extractor: "live:gpt-6-luna",
  /** Judge-tier draft + final synthesis. */
  synthesizer: "live:gemini-3.8-flash",
} as const;

/** Blended ceiling for anything the sync job may add or re-price into the live roster. */
export const LIVE_MAX_BLENDED_USD_PER_M = 1.5;

/* ─────────────────────────── Free plan: $0 models only ─────────────────────────── */

/**
 * Free-plan roster: ONLY OpenRouter `:free` models with $0 prompt and $0
 * completion pricing, called through OpenRouter (never OpenAI or NVIDIA direct).
 * Picked on 2026-09-28 from GET https://openrouter.ai/api/v1/models, checked
 * against /api/v1/models/{slug}/endpoints (uptime) and a $0 test call each:
 *   panel (4 families): Nemotron 3 Super (NVIDIA), Gemma 4 31B (Google),
 *                       Qwen3.8 27B (Qwen), Dots3-Note Preview (Dots Studio)
 *   verifier:           Gemma 4 26B A4B (Google)
 *   single-model:       Nemotron 3.5 Lightning (NVIDIA, fast, 1M context)
 *   extractor:          Dots3-Note Preview (structured output, fastest reliable free host)
 *   judge/synthesizer:  Nemotron 3 Ultra 550B (NVIDIA)
 *   vision fallback:    Nemotron 3 Nano Omni (NVIDIA; images/video frames)
 * Image input (media questions): Gemma 4 31B, Qwen3.8 27B, Dots3-Note, Gemma 4
 * 26B and Nemotron 3 Nano Omni accept images; the Nemotron Super/Lightning/Ultra
 * models are text-only and are skipped for the panel on media questions.
 * Not used: Inkling / Inkling Small (OpenRouter serves them to agent harnesses
 * only, HTTP 403), content-safety and coding-only models, the anonymous
 * "stealth" listing and the random `openrouter/free` router (unknown model).
 * Free endpoints are rate-limited upstream (HTTP 429 is common): the registry
 * falls back to the other free models (FREE_FALLBACK_ORDER, then any other
 * `:free` model the catalog sync found at $0), never to a paid model.
 * `npm run catalog:sync` re-checks that each is still listed at $0.
 */
const FREE_SEEDS: LiveSeed[] = [
  { id: "free:nemotron-3-super", name: "Nemotron 3 Super (free)", provider: "NVIDIA", family: "NVIDIA", role: "primary", strengths: ["reasoning", "agentic", "long-context"], contextWindow: 262_144, openWeights: true, inputPer1M: 0, outputPer1M: 0, routes: { openrouter: "nvidia/nemotron-3-super-120b-a12b:free" }, input: TEXT },
  { id: "free:gemma-4-31b", name: "Gemma 4 31B (free)", provider: "Google", family: "Gemma", role: "primary", strengths: ["multilingual", "writing", "long-context"], contextWindow: 262_144, openWeights: true, inputPer1M: 0, outputPer1M: 0, routes: { openrouter: "google/gemma-4-31b-it:free" }, input: VISION_VIDEO },
  { id: "free:qwen3.8-27b", name: "Qwen3.8 27B (free)", provider: "Alibaba Qwen", family: "Qwen", role: "primary", strengths: ["reasoning", "coding", "multilingual"], contextWindow: 262_144, openWeights: true, inputPer1M: 0, outputPer1M: 0, routes: { openrouter: "qwen/qwen3.8-27b:free" }, input: VISION_VIDEO },
  { id: "free:dots-3-note", name: "Dots3-Note Preview (free)", provider: "Dots Studio", family: "Dots", role: "primary", strengths: ["reasoning", "knowledge-work", "long-context"], contextWindow: 512_000, openWeights: true, inputPer1M: 0, outputPer1M: 0, routes: { openrouter: "dots-studio/dots-3-note-preview:free" }, input: VISION },
  { id: "free:gemma-4-26b-a4b", name: "Gemma 4 26B A4B (free)", provider: "Google", family: "Gemma", role: "verifier", strengths: ["speed", "multilingual"], contextWindow: 262_144, openWeights: true, inputPer1M: 0, outputPer1M: 0, routes: { openrouter: "google/gemma-4-26b-a4b-it:free" }, input: VISION_VIDEO },
  { id: "free:nemotron-3.5-lightning", name: "Nemotron 3.5 Lightning (free)", provider: "NVIDIA", family: "NVIDIA", role: "fast-cheap", strengths: ["speed", "agentic", "long-context"], contextWindow: 1_000_000, openWeights: true, inputPer1M: 0, outputPer1M: 0, routes: { openrouter: "nvidia/nemotron-3.5-lightning:free" }, input: TEXT },
  { id: "free:nemotron-3-ultra", name: "Nemotron 3 Ultra (free)", provider: "NVIDIA", family: "NVIDIA", role: "judge", strengths: ["reasoning", "knowledge-work", "long-context"], contextWindow: 1_000_000, openWeights: true, inputPer1M: 0, outputPer1M: 0, routes: { openrouter: "nvidia/nemotron-3-ultra-550b-a55b:free" }, input: TEXT },
  // Vision fallback (images + video frames) for media questions when the Gemma/Qwen/Dots hosts are busy.
  { id: "free:nemotron-3-nano-omni", name: "Nemotron 3 Nano Omni (free)", provider: "NVIDIA", family: "NVIDIA", role: "fast-cheap", strengths: ["multimodal", "speed"], contextWindow: 256_000, openWeights: true, inputPer1M: 0, outputPer1M: 0, routes: { openrouter: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free" }, input: ["text", "image", "video", "audio"] },
];

function freeSpec(s: LiveSeed): ModelSpec {
  const m = liveSpec(s);
  return { ...m, sourceUrl: SOURCE.openrouter, pricing: [{ from: null, inputPer1M: 0, outputPer1M: 0, note: "OpenRouter :free model, $0 prompt and completion (2026-09-28)" }] };
}

export const FREE_LIVE_SEEDS: readonly LiveSeed[] = FREE_SEEDS;

/** Static Free-plan roster (before any catalog-sync snapshot is applied). */
export const freeRoster: readonly ModelSpec[] = FREE_SEEDS.map(freeSpec);

/** Fixed Free-plan roles (all $0 models). */
export const FREE_ROLES = {
  // Measured on OpenRouter (3 calls each, same prompt): with thinking off Nemotron 3 Super wrote the position JSON in 2.4-4.2 s (3 of 3 valid)
  // and the final answer in 1.5-1.9 s; Dots3-Note returned an empty reply after 15-17 s (3 of 3) and Nemotron 3 Ultra needed 14-18 s to write.
  // On the real extractor prompt Lightning needed 5+ s (so Super is the first choice and Lightning the 4 s stand-in); Super with thinking off: 2.4-4.2 s.
  extractor: "free:nemotron-3-super",
  synthesizer: "free:nemotron-3-super",
} as const;

/**
 * Order in which other free models are tried when a free model is rate-limited,
 * missing or erroring. The failed model's own family is tried last.
 */
export const FREE_FALLBACK_ORDER: readonly string[] = [
  // Cleanest and fastest first (benchmark 2026-10-03, scripts/free-bench.mts: Super 0.75 s, Qwen 0.5 s, Dots 1.2 s, all clean).
  "free:nemotron-3-super",
  "free:qwen3.8-27b",
  "free:dots-3-note",
  "free:gemma-4-31b",
  "free:gemma-4-26b-a4b",
  // Demoted: Lightning timed out on 2 of 4 probes (20-70 s stalls); Nano Omni hits "worker limit 16/16" on its shared host.
  "free:nemotron-3.5-lightning",
  "free:nemotron-3-nano-omni",
  // Slowest (550B): last, so a stand-in panel seat rarely misses the latency budget.
  "free:nemotron-3-ultra",
];

/** Free plan, single-model answers (simple requests): benchmarked-clean models in preference order. */
export const FREE_SINGLE_PICK: readonly string[] = ["free:nemotron-3-super", "free:qwen3.8-27b", "free:dots-3-note"];

/**
 * `:free` models the sync job must never add as fallbacks: agent-harness-only
 * listings (403 for apps), guardrail/safety classifiers, coding-only models and
 * anonymous or random routers.
 */
export const FREE_FALLBACK_EXCLUDE: readonly RegExp[] = [/^thinkingmachines\/inkling/, /content-safety/, /code/, /^poolside\//, /^stealth\//, /^openrouter\//, /sante/];

/** Build a fallback spec for a synced `:free` model that isn't in FREE_SEEDS. */
export function syncedFreeSpec(slug: string, contextWindow: number | null, inputModalities?: string[]): ModelSpec {
  const vendor = slug.split("/")[0];
  return {
    id: `free:${slug.replace(/:free$/, "")}`,
    name: `${slug.split("/")[1]?.replace(/:free$/, "") ?? slug} (free)`,
    provider: vendor,
    family: vendor,
    role: "fast-cheap",
    strengths: [],
    contextWindow,
    openWeights: true,
    verified: false,
    releaseDate: null,
    sourceUrl: SOURCE.openrouter,
    pricing: [{ from: null, inputPer1M: 0, outputPer1M: 0, note: "OpenRouter :free model found by catalog sync" }],
    capabilities: {},
    routable: true,
    routes: { openrouter: slug },
    ...(inputModalities ? { inputModalities: [...inputModalities] } : {}),
  };
}
