/**
 * Live-provider configuration: one place for gateway defaults, privacy tiers
 * and environment flags. Based on the launch research of 2026-09-27
 * (/workspace/research/launch-api-options-2026-09-27.md, §0 and §5).
 *
 * Nothing here makes a network call. Providers read it when a key is present.
 */
import { siteUrl } from "@/lib/site";
import type { DataTier, ModelSpec, RoutedModel } from "./types";

/** Server-only environment flags. No key → no live provider → demo mode. */
export type KeyTier = "paid" | "free";

/**
 * `keyTier: "free"` routes Free-plan traffic to OpenRouter `:free` models
 * ($0 prompt and completion) only. It uses OPENROUTER_API_KEY_FREE when that is
 * set (optional, e.g. a separate key with a $0 credit limit) and otherwise the
 * normal OPENROUTER_API_KEY. Direct OpenAI/NVIDIA/LiteLLM keys and retrieval
 * are disabled for Free, and the registry refuses any model with a nonzero
 * price (free-guard.ts), so Free traffic can never spend.
 */
/**
 * Read an API key from the environment. Tolerates a value pasted as
 * `NAME=value` or wrapped in quotes/whitespace. Never log the result.
 */
export function readKey(env: Record<string, string | undefined>, name: string): string | null {
  let v = env[name]?.trim();
  if (!v) return null;
  if (v.startsWith(`${name}=`)) v = v.slice(name.length + 1).trim();
  v = v.replace(/^["']|["']$/g, "");
  return v || null;
}

/**
 * True when Free-plan requests are sent with provider.data_collection = "allow", i.e. the free hosts behind them MAY log and train on
 * what they receive (the default: with "deny" nearly every free endpoint is filtered out and the request fails). While this is true,
 * nothing personal may ride along on those requests: no saved memory, no attached documents' text (see privacy gate in
 * src/app/api/keplar/route.ts). KEPLAR_FREE_DATA_COLLECTION=deny makes the hosts non-training and lifts the gate.
 */
export const freeEndpointsMayTrain = (env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {}): boolean => env.KEPLAR_FREE_DATA_COLLECTION !== "deny";

/**
 * One cheap model call classifies the question instead of the regex.
 * Off unless this is exactly "1". Turning it on spends a model call per question, so it stays off until the owner says so.
 */
export function modelClassifierEnabled(env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {}): boolean {
  return env.KEPLAR_MODEL_CLASSIFIER === "1";
}

export function liveEnv(keyTier: KeyTier = "paid") {
  const env = typeof process !== "undefined" ? process.env : ({} as Record<string, string | undefined>);
  const free = keyTier === "free";
  const num = (v: string | undefined, d: number) => (v != null && v !== "" && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
  return {
    keyTier,
    /**
     * Live models run only when this is exactly "1" AND the relevant keys exist.
     * Otherwise every answer is the demo mock, even with keys present.
     */
    liveModels: env.KEPLAR_LIVE_MODELS === "1",
    openRouterKey: free ? readKey(env, "OPENROUTER_API_KEY_FREE") ?? readKey(env, "OPENROUTER_API_KEY") : readKey(env, "OPENROUTER_API_KEY"),
    /**
     * Free plan only. Most OpenRouter free endpoints (e.g. NVIDIA's) are listed
     * as "may train on prompts", so a `data_collection: "deny"` filter leaves
     * few or none routable. Default "allow" for $0 models (disclosed on the
     * pricing page); set KEPLAR_FREE_DATA_COLLECTION=deny to exclude them.
     * Paid plans always send "deny".
     */
    freeDataCollection: (freeEndpointsMayTrain(env) ? "allow" : "deny") as "allow" | "deny",
    /** Free plan: one combined classify+review+write request after the panel (free-merged.ts). KEPLAR_FREE_MERGED=0 restores the separate extractor, reviewer and write-up (more requests). */
    freeMerged: env.KEPLAR_FREE_MERGED !== "0",
    openRouterBase: env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
    /** Sent as HTTP-Referer / X-Title for OpenRouter attribution. */
    appUrl: env.KEPLAR_APP_URL || siteUrl,
    direct: {
      openai: free ? null : readKey(env, "OPENAI_API_KEY"),
      anthropic: free ? null : readKey(env, "ANTHROPIC_API_KEY"),
      google: free ? null : readKey(env, "GOOGLE_API_KEY"),
      xai: free ? null : readKey(env, "XAI_API_KEY"),
    },
    /** NVIDIA API catalog (OpenAI-compatible). */
    nvidiaKey: free ? null : readKey(env, "NVIDIA_API_KEY"),
    nvidiaBase: env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1",
    openAiBase: env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    /** Hard cap on provider USD across ALL live calls per UTC day (every provider, every plan). */
    liveDailyUsdCap: num(env.KEPLAR_LIVE_DAILY_USD_CAP, 5),
    /** One latency budget shared by the whole live run (panel first, then review and synthesis). */
    latencyBudgetMs: num(env.KEPLAR_LATENCY_BUDGET_MS, 60_000),
    /** Force the mock even when keys exist (local dev, screenshots). */
    forceMock: env.KEPLAR_FORCE_MOCK === "1",
    /** Optional LiteLLM proxy (OpenAI-compatible) used as the direct path for every family. */
    liteLlmBase: free ? null : env.LITELLM_BASE_URL || null,
    liteLlmKey: free ? null : env.LITELLM_API_KEY || null,
    /**
     * Optional Retriever (web checks of disputed claims). OFF unless exactly "true".
     * Engine is always pinned; anything other than "parallel" means "exa".
     */
    retrievalEnabled: !free && env.KEPLAR_RETRIEVAL_ENABLED === "true",
    searchEngine: (env.KEPLAR_SEARCH_ENGINE === "parallel" ? "parallel" : "exa") as SearchEngine,
  };
}

/**
 * Web search via OpenRouter's web plugin. The engine is ALWAYS set: without it
 * OpenRouter uses the model maker's native search for OpenAI, Anthropic,
 * Google, Perplexity and xAI models, billed at 1.4–2× (research: search-providers
 * 2026-09-27 §1). Brave, Tavily and Serper are deliberately not used.
 */
export type SearchEngine = "exa" | "parallel";

/** Per-search price via OpenRouter incl. the 5.5% credit fee (estimates; billed cost wins). */
export const SEARCH_PRICE_USD: Record<SearchEngine, number> = { exa: 0.00739, parallel: 0.00528 };

export const RETRIEVAL = {
  /** Disputed claims checked per question, at most. One search each. */
  maxClaims: 3,
  /** Results per search. Exa's price includes text/highlights for up to 10. */
  maxResults: 4,
} as const;

/**
 * OpenRouter `provider` routing object, applied to every request.
 * - data_collection "deny": never route to endpoints that may train.
 * - ignore first-party DeepSeek: flagged "may train", data stored in the PRC.
 *   DeepSeek weights are still reachable through US hosts.
 * - quantizations fp8/bf16: host precision variance looks like disagreement.
 * - require_parameters: don't route to hosts that silently drop
 *   reasoning effort, tools or response_format.
 */
export const OPENROUTER_PROVIDER_DEFAULTS = {
  data_collection: "deny",
  require_parameters: true,
  allow_fallbacks: true,
  ignore: ["deepseek"],
  quantizations: ["fp8", "bf16"],
} as const;

/**
 * Open-weight models whose only OpenRouter endpoints are the vendor's own and
 * report quantization "unknown", so an fp8/bf16 filter matches no endpoint (404).
 * Checked via GET /api/v1/models/{slug}/endpoints on 2026-09-28.
 */
export const QUANTIZATION_EXEMPT = new Set<string>(["mistral-medium-3.5"]);

/**
 * OpenRouter `provider` object for Free-plan ($0 `:free`) calls. No
 * quantization pin (free hosts report fp4/nvfp4/unknown, so an fp8/bf16 filter
 * would match nothing) and no judge host pinning. Price safety comes from the
 * `:free` slug plus the registry's hard guard (free-guard.ts).
 */
export function freeOpenRouterProviderOptions(dataCollection: "allow" | "deny" = "allow", tier: DataTier = "standard") {
  const base: Record<string, unknown> = {
    data_collection: dataCollection,
    require_parameters: true,
    allow_fallbacks: true,
    ignore: [...OPENROUTER_PROVIDER_DEFAULTS.ignore],
  };
  if (tier === "sensitive") base.zdr = true;
  return base;
}

/** Judge calls pin an ordered host list for consistency (research §5). */
export const JUDGE_PROVIDER_ORDER: Record<string, string[]> = {
  Anthropic: ["anthropic", "amazon-bedrock", "google-vertex"],
  OpenAI: ["openai", "azure"],
  Google: ["google-vertex", "google-ai-studio"],
};

export function openRouterProviderOptions(model: ModelSpec, tier: DataTier = "standard", slot?: RoutedModel["slot"]) {
  const base: Record<string, unknown> = { ...OPENROUTER_PROVIDER_DEFAULTS, ignore: [...OPENROUTER_PROVIDER_DEFAULTS.ignore], quantizations: [...OPENROUTER_PROVIDER_DEFAULTS.quantizations] };
  // Quantization pinning only applies to open-weight models served by third-party hosts;
  // closed models and first-party-only listings (quantization reported "unknown") have one precision.
  if (!model.openWeights || QUANTIZATION_EXEMPT.has(model.id)) delete base.quantizations;
  // Sensitive tier: zero-data-retention endpoints only. Narrows GPT-6 to Azure,
  // Claude to Bedrock/Vertex; Fable 5.x can't satisfy it (router excludes it).
  if (tier === "sensitive") base.zdr = true;
  if (slot === "judge" && JUDGE_PROVIDER_ORDER[model.family]) base.order = JUDGE_PROVIDER_ORDER[model.family];
  return base;
}

/**
 * OpenRouter model slugs. The catalog's api ids are first-party ids; the
 * gateway namespaces them by vendor. Verify each slug against
 * GET /api/v1/models before going live.
 */
const OPENROUTER_VENDOR: Record<string, string> = {
  OpenAI: "openai",
  Anthropic: "anthropic",
  Google: "google",
  xAI: "x-ai",
  Meta: "meta",
  DeepSeek: "deepseek",
  Qwen: "qwen",
  Moonshot: "moonshotai",
  Zhipu: "z-ai",
  Mistral: "mistralai",
  Cohere: "cohere",
  Amazon: "amazon",
  NVIDIA: "nvidia",
};

/**
 * Catalog ids whose OpenRouter slug differs from `${vendor}/${id}`.
 * Verified against GET https://openrouter.ai/api/v1/models on 2026-09-28.
 * `null` = no OpenRouter listing (never routed through the gateway).
 */
export const OPENROUTER_SLUG_OVERRIDES: Record<string, string | null> = {
  "claude-opus-5-5": "anthropic/claude-opus-5.5",
  "claude-fable-5-1": "anthropic/claude-fable-5.1",
  "claude-haiku-4-5-20251001": "anthropic/claude-haiku-4.5",
  "deepseek-flash": "deepseek/deepseek-v4.1-flash",
  "qwen3.8-max": "qwen/qwen3.8-max-0902",
  "mistral-medium-3.5": "mistralai/mistral-medium-3-5",
  "command-a-plus-05-2026": "cohere/command-a-plus",
  "amazon.nova-2-lite-v1:0": "amazon/nova-2-lite-v1",
  "MAI-Thinking-1": null,
  "internlm/Intern-Decision-4B": null,
};

export function openRouterSlug(model: ModelSpec): string | null {
  // Live roster: the route table is authoritative (no route → not on OpenRouter).
  if (model.routes) return model.routes.openrouter ?? null;
  if (model.id in OPENROUTER_SLUG_OVERRIDES) return OPENROUTER_SLUG_OVERRIDES[model.id];
  // Ids that already carry a vendor namespace (e.g. "nvidia/…", live-synced models) are used as-is.
  if (model.id.includes("/") && !model.id.startsWith("unlisted:")) return model.id;
  const vendor = OPENROUTER_VENDOR[model.family];
  if (!vendor || model.id.startsWith("unlisted:")) return null;
  return `${vendor}/${model.id}`;
}

/** Retry policy for 429/5xx before falling back to the next provider. */
export const RETRY = { attempts: 3, baseMs: 400, maxMs: 4000, timeoutMs: 45_000 } as const;

/**
 * Free `:free` models: 429s are upstream free-tier limits that don't clear in
 * seconds, so don't retry the same model; the registry moves straight to the
 * next free model (retrying just burns the shared latency budget).
 */
export const FREE_RETRY = { attempts: 1, maxMs: 0 } as const;
