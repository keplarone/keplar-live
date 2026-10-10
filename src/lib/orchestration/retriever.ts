/**
 * Optional Retriever: checks claims the comparator/verifier left DISPUTED
 * against web sources. OFF by default (KEPLAR_RETRIEVAL_ENABLED must be
 * exactly "true").
 *
 * - Runs only on disputed claims (at most RETRIEVAL.maxClaims, one search each).
 * - Uses OpenRouter's web plugin with `engine` ALWAYS pinned ("exa" by default,
 *   "parallel" via KEPLAR_SEARCH_ENGINE). An unpinned engine would fall back to
 *   the model maker's native search, so the engine is never omitted.
 * - Skipped for the Sensitive tier: OpenRouter's ZDR doesn't cover plugins.
 * - Cost (search + the checking call) goes into the Keplar Usage meter.
 * - Brave, Tavily and Serper are deliberately not used (terms / training / scraping risk).
 *
 * Research: /workspace/research/search-providers-2026-09-27.md.
 */
import { liveEnv, openRouterSlug, RETRIEVAL, SEARCH_PRICE_USD, type SearchEngine } from "./config";
import { postJson } from "./http";
import { callCostUsd } from "./pricing";
import { RESEARCH, RESEARCH_SYSTEM } from "./research";
import type { Claim, KeplarRequest, Retriever, RoutingPlan, VerificationCheck } from "./types";

type CheckInput = Parameters<Retriever["check"]>[0];

export const RETRIEVER_SYSTEM_PROMPT = `You check one disputed claim against the web search results provided to you.
Return ONLY JSON: {"outcome":"supported"|"contradicted"|"inconclusive","finding":string,"resolution":string}
Base the outcome only on the search results. If they don't clearly settle it, answer "inconclusive". One sentence per field.`;

/** Whether retrieval should run for this request. */
export function retrievalApplies(req: KeplarRequest, plan: RoutingPlan, env = liveEnv()): boolean {
  return env.retrievalEnabled && plan.mode === "consensus" && req.routing?.tier !== "sensitive";
}

/** Conservative estimate for the pre-run compute check: one search + one short check call per claim. */
export function retrievalEstimateUsd(plan: RoutingPlan, env = liveEnv()): number {
  const checker = plan.verifier?.model;
  // Search results add roughly 3K input tokens to each short checking call.
  const callUsd = (checker && callCostUsd(checker, 3000, 200, new Date().toISOString().slice(0, 10))) ?? 0.002;
  return RETRIEVAL.maxClaims * (SEARCH_PRICE_USD[env.searchEngine] + callUsd);
}

type Annotated = {
  choices?: { message?: { content?: string | null; annotations?: { type?: string; url_citation?: { url?: string; title?: string; content?: string } }[] } }[];
  usage?: { cost?: number };
};

/** Live: OpenRouter chat call on the verifier model with the web plugin, engine pinned. */
export class OpenRouterRetriever implements Retriever {
  readonly name: string;
  readonly live = true;
  constructor(private readonly env = liveEnv()) {
    this.name = `openrouter-web:${env.searchEngine}`;
  }

  static available(env = liveEnv()) {
    return Boolean(env.openRouterKey) && !env.forceMock;
  }

  private async one(claim: Claim, plan: RoutingPlan, engine: SearchEngine, signal?: AbortSignal): Promise<{ check: VerificationCheck; costUsd: number }> {
    const model = plan.verifier?.model ?? plan.panel[0].model;
    const slug = openRouterSlug(model);
    const estimate = SEARCH_PRICE_USD[engine];
    if (!slug) return { check: inconclusive(claim, "No gateway route for the checking model."), costUsd: 0 };
    const body = {
      model: slug,
      messages: [
        { role: "system", content: RETRIEVER_SYSTEM_PROMPT },
        { role: "user", content: `Claim: ${claim.text}` },
      ],
      max_tokens: 300,
      // The engine is always explicit. Never omit it, and never use ":online" or
      // web_search_options, which can trigger the model maker's native search.
      plugins: [{ id: "web", engine, max_results: RETRIEVAL.maxResults }],
      provider: { data_collection: "deny" },
      usage: { include: true },
    };
    try {
      const res = await postJson<Annotated>(`${this.env.openRouterBase}/chat/completions`, body, {
        Authorization: `Bearer ${this.env.openRouterKey}`,
        "HTTP-Referer": this.env.appUrl,
        "X-Title": "Keplar",
      }, signal);
      const msg = res.choices?.[0]?.message;
      const sources = (msg?.annotations ?? [])
        .filter((a) => a.type === "url_citation" && a.url_citation?.url && /^https?:\/\//.test(a.url_citation.url))
        .map((a) => ({ url: a.url_citation!.url!, title: a.url_citation!.title || new URL(a.url_citation!.url!).hostname }))
        .slice(0, RETRIEVAL.maxResults);
      const parsed = parseOutcome(msg?.content ?? "");
      const costUsd = typeof res.usage?.cost === "number" ? res.usage.cost : estimate;
      if (!parsed) return { check: { ...inconclusive(claim, "The check's output couldn't be read."), sources }, costUsd };
      return {
        check: { kind: "web", finding: parsed.finding || claim.text, models: [], outcome: sources.length ? parsed.outcome : "inconclusive", resolution: parsed.resolution, sources },
        costUsd,
      };
    } catch (e) {
      if (signal?.aborted) throw e;
      return { check: inconclusive(claim, "The web check failed, so this claim stays disputed."), costUsd: 0 };
    }
  }

  /** Deep Research: one search for one planned query; a model reads the returned pages and writes notes citing their URLs. */
  async research({ query, plan, signal }: { query: string; plan: RoutingPlan; signal?: AbortSignal }) {
    const model = plan.verifier?.model ?? plan.panel[0].model;
    const slug = openRouterSlug(model);
    const engine = this.env.searchEngine;
    if (!slug) return { sources: [], notes: "", costUsd: 0 };
    const body = {
      model: slug,
      messages: [
        { role: "system", content: RESEARCH_SYSTEM },
        { role: "user", content: `Search query: ${query}` },
      ],
      max_tokens: 600,
      plugins: [{ id: "web", engine, max_results: RESEARCH.maxResults }],
      provider: { data_collection: "deny" },
      usage: { include: true },
    };
    try {
      const res = await postJson<Annotated>(`${this.env.openRouterBase}/chat/completions`, body, {
        Authorization: `Bearer ${this.env.openRouterKey}`,
        "HTTP-Referer": this.env.appUrl,
        "X-Title": "Keplar",
      }, signal);
      const msg = res.choices?.[0]?.message;
      const sources = (msg?.annotations ?? [])
        .filter((a) => a.type === "url_citation" && a.url_citation?.url && /^https?:\/\//.test(a.url_citation.url))
        .map((a) => ({ url: a.url_citation!.url!, title: a.url_citation!.title || new URL(a.url_citation!.url!).hostname, ...(a.url_citation!.content ? { snippet: a.url_citation!.content } : {}) }))
        .slice(0, RESEARCH.maxResults);
      return { sources, notes: sources.length ? (msg?.content ?? "").slice(0, 4000) : "", costUsd: typeof res.usage?.cost === "number" ? res.usage.cost : SEARCH_PRICE_USD[engine] };
    } catch (e) {
      if (signal?.aborted) throw e;
      return { sources: [], notes: "", costUsd: 0 };
    }
  }

  async check({ claims, plan, signal }: CheckInput) {
    const picked = claims.slice(0, RETRIEVAL.maxClaims);
    const out = await Promise.all(picked.map((c) => this.one(c, plan, this.env.searchEngine, signal)));
    return { checks: out.map((o) => o.check), costUsd: out.reduce((a, o) => a + o.costUsd, 0) };
  }
}

function inconclusive(claim: Claim, resolution: string): VerificationCheck {
  return { kind: "web", finding: claim.text, models: [], outcome: "inconclusive", resolution, sources: [] };
}

function parseOutcome(text: string): { outcome: "supported" | "contradicted" | "inconclusive"; finding: string; resolution: string } | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as Record<string, unknown>;
    const outcome = j.outcome === "supported" || j.outcome === "contradicted" ? j.outcome : "inconclusive";
    return { outcome, finding: typeof j.finding === "string" ? j.finding.slice(0, 400) : "", resolution: typeof j.resolution === "string" ? j.resolution.slice(0, 400) : "" };
  } catch {
    return null;
  }
}

/** The retriever for this environment, or null when the feature flag is off. */
export function createRetriever(env = liveEnv()): Retriever | null {
  if (!env.retrievalEnabled) return null;
  return OpenRouterRetriever.available(env) ? new OpenRouterRetriever(env) : null;
}

