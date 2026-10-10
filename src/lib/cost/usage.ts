/**
 * Pure provider-call parsing for the cost meter: which provider a URL is, which model a request asks for, and what a
 * response says it used and cost. Actual cost precedence: the provider's own figure (OpenRouter `usage.cost`) >
 * price table × reported tokens > per-unit price table (images, video seconds, audio minutes) > 0 for $0 models.
 * `costSource` records which one was used so the dashboard can label estimates as estimates.
 */
import { LIVE_SEEDS, FREE_LIVE_SEEDS } from "@/lib/orchestration/live-catalog";
import { HF_MODELS } from "@/lib/higgsfield/catalog";

export type ProviderId = "openrouter" | "openai" | "anthropic" | "google" | "xai" | "nvidia" | "litellm" | "higgsfield";
export type CostSource = "provider" | "tokens" | "unit_price" | "free" | "none";

/** Hosts the meter wraps. The bypass test (tests/cost-meter-coverage.test.ts) fails if src/ calls a provider host not listed here. */
export const METERED_HOSTS: Record<string, ProviderId> = {
  "openrouter.ai": "openrouter",
  "api.openai.com": "openai",
  "api.anthropic.com": "anthropic",
  "generativelanguage.googleapis.com": "google",
  "api.x.ai": "xai",
  "integrate.api.nvidia.com": "nvidia",
  "api.higgsfield.ai": "higgsfield",
};

/** Extra hosts from env (custom OpenRouter base, LiteLLM proxy). */
export function envHosts(env: Record<string, string | undefined> = process.env): Record<string, ProviderId> {
  const out: Record<string, ProviderId> = {};
  const add = (v: string | undefined, p: ProviderId) => {
    try {
      if (v) out[new URL(v).hostname] = p;
    } catch {
      /* not a URL */
    }
  };
  add(env.OPENROUTER_BASE_URL, "openrouter");
  add(env.KEPLAR_OPENROUTER_BASE, "openrouter");
  add(env.LITELLM_BASE_URL, "litellm");
  add(env.KEPLAR_LITELLM_BASE, "litellm");
  return out;
}

export function providerOf(url: URL, extra: Record<string, ProviderId> = {}): ProviderId | null {
  return METERED_HOSTS[url.hostname] ?? extra[url.hostname] ?? null;
}

export type EndpointKind = "chat" | "embeddings" | "image" | "video" | "audio" | "moderation" | "media_job" | "meta";

/** Billable endpoint kind, or "meta" for free metadata/polling calls (models list, credits, key, generation lookups, GET polls). */
export function endpointOf(provider: ProviderId, url: URL, method: string): EndpointKind {
  const p = url.pathname;
  const m = method.toUpperCase();
  if (provider === "higgsfield") return m === "POST" && !/\/(requests|uploads?|files)\b/.test(p) ? "media_job" : "meta";
  if (m !== "POST") return "meta";
  if (/\/chat\/completions$|\/completions$|\/messages$|\/responses$|:generateContent$|:streamGenerateContent$/.test(p)) return "chat";
  if (/\/embeddings$/.test(p)) return "embeddings";
  if (/\/images(\/generations|\/edits)?$/.test(p)) return "image";
  if (/\/videos$/.test(p)) return "video";
  if (/\/audio\//.test(p)) return "audio";
  if (/\/moderations$/.test(p)) return "moderation";
  return "meta";
}

/* ── price table ─────────────────────────────────────────────────────── */

export type TokenPrice = { inPer1M: number; outPer1M: number };

/** Direct-API list prices (USD per 1M tokens) for models not in the live roster. Estimates; checked 2026-10. */
const STATIC_PRICES: Record<string, TokenPrice> = {
  "gpt-5-nano": { inPer1M: 0.05, outPer1M: 0.4 },
  "gpt-5-mini": { inPer1M: 0.25, outPer1M: 2 },
  "gpt-5": { inPer1M: 1.25, outPer1M: 10 },
  "gpt-4o-mini": { inPer1M: 0.15, outPer1M: 0.6 },
  "gpt-4o-mini-transcribe": { inPer1M: 1.25, outPer1M: 5 },
  "gpt-image-1-mini": { inPer1M: 2.5, outPer1M: 8 },
  "gpt-image-1": { inPer1M: 10, outPer1M: 40 },
  "claude-haiku-4-5": { inPer1M: 1, outPer1M: 5 },
  "claude-sonnet-4-5": { inPer1M: 3, outPer1M: 15 },
  "gemini-2.5-flash": { inPer1M: 0.3, outPer1M: 2.5 },
  "grok-4-fast": { inPer1M: 0.2, outPer1M: 0.5 },
};
/** Unknown paid model: priced conservatively high so an unknown never looks free. */
export const UNKNOWN_PRICE: TokenPrice = { inPer1M: 3, outPer1M: 15 };

let table: Map<string, TokenPrice> | null = null;
function priceTable(): Map<string, TokenPrice> {
  if (table) return table;
  table = new Map(Object.entries(STATIC_PRICES));
  for (const s of LIVE_SEEDS) {
    const p = { inPer1M: s.inputPer1M, outPer1M: s.outputPer1M };
    for (const slug of Object.values(s.routes ?? {})) if (slug) table.set(String(slug).toLowerCase(), p);
  }
  for (const s of FREE_LIVE_SEEDS) for (const slug of Object.values(s.routes ?? {})) if (slug) table.set(String(slug).toLowerCase(), { inPer1M: 0, outPer1M: 0 });
  return table;
}

/** True for $0 models (OpenRouter `:free` slugs, OpenRouter's free router). */
export const isFreeModelId = (model: string | null | undefined): boolean => !!model && (/:free$/i.test(model) || model === "openrouter/free");

export function tokenPrice(model: string | null | undefined): { price: TokenPrice; known: boolean } {
  if (!model) return { price: UNKNOWN_PRICE, known: false };
  if (isFreeModelId(model)) return { price: { inPer1M: 0, outPer1M: 0 }, known: true };
  const t = priceTable();
  const m = model.toLowerCase();
  const hit = t.get(m) ?? t.get(m.replace(/^[a-z0-9-]+\//, "")) ?? [...t.entries()].find(([k]) => m.startsWith(k) || m.endsWith(`/${k}`))?.[1];
  return hit ? { price: hit, known: true } : { price: UNKNOWN_PRICE, known: false };
}

/** Per-unit prices (estimates): images per image, video per second, audio per minute. */
export const UNIT_PRICES = {
  imageDefaultUsd: 0.0135,
  imageByModel: { "openai/gpt-image-2": 0.0135, "black-forest-labs/flux.2-pro": 0.03, "recraft/recraft-v4.1-vector": 0.08, "google/gemini-3-pro-image": 0.134, "gpt-image-1-mini": 0.011 } as Record<string, number>,
  videoPerSecondDefaultUsd: 0.1,
  videoPerSecondByModel: { "alibaba/wan-2.7": 0.05, "kling/kling-2.5-turbo-pro": 0.07, "google/veo-3.1-fast": 0.15, "google/veo-3.1": 0.4 } as Record<string, number>,
  audioPerMinuteUsd: 0.006,
  /** Bytes of compressed audio per minute assumed when only the upload size is known (~128 kbps). */
  audioBytesPerMinute: 960_000,
};

/* ── request + response parsing ──────────────────────────────────────── */

export type ProviderRequest = { model: string | null; models: string[]; stream: boolean; n: number; seconds: number | null; json: Record<string, unknown> | null; bytes: number };

export function parseRequestBody(body: unknown): ProviderRequest {
  let bytes = 0;
  let json: Record<string, unknown> | null = null;
  if (typeof body === "string") {
    bytes = body.length;
    if (body.length < 5_000_000 && (body.startsWith("{") || body.startsWith("["))) {
      try {
        const v = JSON.parse(body);
        if (v && typeof v === "object" && !Array.isArray(v)) json = v as Record<string, unknown>;
      } catch {
        /* not JSON */
      }
    }
  } else if (body instanceof Uint8Array) bytes = body.byteLength;
  else if (body instanceof ArrayBuffer) bytes = body.byteLength;
  else if (typeof Blob !== "undefined" && body instanceof Blob) bytes = body.size;
  else if (typeof FormData !== "undefined" && body instanceof FormData) {
    for (const [k, v] of body.entries()) {
      if (typeof v === "string") {
        if (k === "model") json = { ...(json ?? {}), model: v };
      } else bytes += v.size;
    }
  }
  const list = Array.isArray(json?.models) ? (json.models as unknown[]).filter((m): m is string => typeof m === "string") : [];
  // OpenRouter `models` fallback list: the call is only as free as its most expensive candidate.
  const model = typeof json?.model === "string" ? json.model : list[0] ?? null;
  const models = [...new Set([...(typeof json?.model === "string" ? [json.model] : []), ...list])];
  const n = Number(json?.n);
  const dur = Number(json?.duration ?? json?.duration_seconds ?? json?.seconds);
  return { model, models, stream: json?.stream === true, n: Number.isFinite(n) && n > 0 ? Math.min(n, 16) : 1, seconds: Number.isFinite(dur) && dur > 0 ? dur : null, json, bytes };
}

export type UsageInfo = { tokensIn: number; tokensOut: number; providerUsd: number | null; model: string | null };

const n0 = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);

/** Usage from a provider JSON body (OpenAI/OpenRouter chat, Anthropic messages, OpenAI images, Gemini). */
export function usageFromJson(j: unknown): UsageInfo | null {
  if (!j || typeof j !== "object") return null;
  const o = j as Record<string, unknown>;
  const u = (o.usage ?? o.usageMetadata) as Record<string, unknown> | undefined;
  const model = typeof o.model === "string" ? o.model : null;
  if (!u || typeof u !== "object") return model ? { tokensIn: 0, tokensOut: 0, providerUsd: null, model } : null;
  const tokensIn = n0(u.prompt_tokens ?? u.input_tokens ?? u.promptTokenCount) + n0(u.cache_read_input_tokens) + n0(u.cache_creation_input_tokens);
  const tokensOut = n0(u.completion_tokens ?? u.output_tokens ?? u.candidatesTokenCount);
  const cost = Number(u.cost);
  return { tokensIn, tokensOut, providerUsd: u.cost !== undefined && u.cost !== null && Number.isFinite(cost) && cost >= 0 ? cost : null, model };
}

/**
 * Incremental SSE scanner: feed decoded text chunks; it keeps only the last usage object seen (OpenRouter sends it in the
 * final chunk; Anthropic splits input/output across message_start and message_delta). Memory stays bounded.
 */
export class SseUsageScanner {
  private buf = "";
  private tokensIn = 0;
  private tokensOut = 0;
  private cost: number | null = null;
  model: string | null = null;
  sawUsage = false;
  outChars = 0;
  push(text: string) {
    this.buf += text;
    let i: number;
    while ((i = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, i).trim();
      this.buf = this.buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      if (!data.includes("usage") && !data.includes("\"model\"")) {
        this.outChars += data.length > 200 ? data.length - 120 : 0;
        continue;
      }
      try {
        const j = JSON.parse(data) as Record<string, unknown>;
        if (typeof j.model === "string") this.model = j.model;
        const msg = j.message as Record<string, unknown> | undefined; // Anthropic message_start
        const usageObj = (j.usage ?? msg?.usage) as Record<string, unknown> | undefined;
        if (usageObj && typeof usageObj === "object") {
          const u = usageFromJson({ usage: usageObj });
          if (u) {
            this.sawUsage = true;
            if (u.tokensIn) this.tokensIn = u.tokensIn;
            if (u.tokensOut) this.tokensOut = u.tokensOut;
            if (u.providerUsd !== null) this.cost = u.providerUsd;
          }
        }
      } catch {
        /* partial or non-JSON line */
      }
    }
    if (this.buf.length > 64_000) this.buf = this.buf.slice(-16_000);
  }
  result(): UsageInfo {
    return { tokensIn: this.tokensIn, tokensOut: this.tokensOut || (this.sawUsage ? 0 : Math.ceil(this.outChars / 4)), providerUsd: this.cost, model: this.model };
  }
}

export type CostResult = { usd: number; source: CostSource };

/** Actual cost of one call from what is known about it. */
export function costOf(i: { provider: ProviderId; endpoint: EndpointKind; model: string | null; usage: UsageInfo | null; req: ProviderRequest; ok: boolean; path?: string }): CostResult {
  const u = i.usage;
  if (u?.providerUsd !== null && u?.providerUsd !== undefined) return { usd: u.providerUsd, source: "provider" };
  if (!i.ok) return { usd: 0, source: "none" };
  const model = u?.model ?? i.model;
  if (i.endpoint === "moderation" || i.endpoint === "meta") return { usd: 0, source: "free" };
  if (isFreeModelId(model)) return { usd: 0, source: "free" };
  if (i.endpoint === "media_job") {
    const ep = (i.path ?? "").replace(/^\/+/, "");
    const m = HF_MODELS.find((x) => ep.endsWith(x.endpoint));
    const per = m?.listUsd ?? null;
    if (per === null) return { usd: UNIT_PRICES.videoPerSecondDefaultUsd * 5, source: "unit_price" };
    return { usd: m?.unit === "second" ? per * (i.req.seconds ?? 5) : per * i.req.n, source: "unit_price" };
  }
  if ((u?.tokensIn || u?.tokensOut) && i.endpoint !== "video") {
    const { price } = tokenPrice(model);
    return { usd: ((u?.tokensIn ?? 0) * price.inPer1M + (u?.tokensOut ?? 0) * price.outPer1M) / 1e6, source: "tokens" };
  }
  if (i.endpoint === "image") return { usd: (UNIT_PRICES.imageByModel[model ?? ""] ?? UNIT_PRICES.imageDefaultUsd) * i.req.n, source: "unit_price" };
  if (i.endpoint === "video") return { usd: (UNIT_PRICES.videoPerSecondByModel[model ?? ""] ?? UNIT_PRICES.videoPerSecondDefaultUsd) * (i.req.seconds ?? 5), source: "unit_price" };
  if (i.endpoint === "audio") return { usd: Math.max(0.0005, (i.req.bytes / UNIT_PRICES.audioBytesPerMinute) * UNIT_PRICES.audioPerMinuteUsd), source: "unit_price" };
  if (i.endpoint === "chat" || i.endpoint === "embeddings") {
    // No usage reported: estimate from the request size (≈4 chars per token) as input only.
    const { price } = tokenPrice(model);
    return { usd: (Math.ceil(i.req.bytes / 4) * price.inPer1M) / 1e6, source: "tokens" };
  }
  return { usd: 0, source: "none" };
}

/** Rounds to micro-dollars. */
export const micro = (usd: number) => Math.round(Math.max(0, usd) * 1e6) / 1e6;
