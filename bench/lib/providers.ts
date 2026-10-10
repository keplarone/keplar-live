/**
 * Providers for the harness.
 *
 * - FakeProvider (default): deterministic, offline, never touches the network.
 *   Output is synthetic and only exercises the pipeline, grading and report code.
 * - OpenRouterBenchProvider: live calls through OpenRouter, only constructed by
 *   run.ts when --live, OPENROUTER_API_KEY and --max-usd are all present. Every
 *   call first reserves its worst case with the SpendGuard.
 */
import { catalogById } from "@/lib/orchestration/catalog";
import { openRouterProviderOptions, openRouterSlug } from "@/lib/orchestration/config";
import { EXA_PER_SEARCH_USD, M, OFFICIAL_HLE_DIAMOND, PROFILES } from "./config";
import { tokenCost } from "./estimate";
import { normalizeAnswer } from "./parse";
import { seeded } from "./rng";
import { CapExceededError, SpendGuard } from "./spend";
import type { BenchProvider, CallRequest, CallResult, DatasetId, Item } from "./types";

/* ─────────────────────────── fake provider ─────────────────────────── */

/**
 * Synthetic per-model skill (probability of a correct answer on an average item).
 * HLE-Diamond uses the official no-tools scores where they exist; everything
 * else is an invented placeholder so the mock report has plausible shape.
 * NONE of these numbers are results.
 */
const MOCK_SKILL: Record<DatasetId, Record<string, number>> = {
  "hle-diamond": { ...OFFICIAL_HLE_DIAMOND, [M.sonnet]: 0.3, [M.dsFlash]: 0.18, [M.gemPro]: 0.4 },
  "simpleqa-verified": { [M.astra]: 0.6, [M.opus]: 0.55, [M.sol]: 0.45, [M.sonnet]: 0.42, [M.gemFlash]: 0.44, [M.grok]: 0.4, [M.dsFlash]: 0.3, [M.gemPro]: 0.5, [M.muse]: 0.35 },
  frames: { [M.astra]: 0.72, [M.opus]: 0.68, [M.sol]: 0.6, [M.sonnet]: 0.58, [M.gemFlash]: 0.55, [M.grok]: 0.55, [M.dsFlash]: 0.45, [M.gemPro]: 0.62, [M.muse]: 0.5 },
  "gpqa-diamond": { [M.astra]: 0.88, [M.opus]: 0.85, [M.sol]: 0.8, [M.sonnet]: 0.78, [M.gemFlash]: 0.76, [M.grok]: 0.75, [M.dsFlash]: 0.7, [M.gemPro]: 0.82, [M.muse]: 0.7 },
  fresh: { [M.astra]: 0.35, [M.opus]: 0.33, [M.sol]: 0.3, [M.sonnet]: 0.3, [M.gemFlash]: 0.3, [M.grok]: 0.32, [M.dsFlash]: 0.25, [M.gemPro]: 0.3, [M.muse]: 0.25 },
};
const MOCK_DECLINE: Record<DatasetId, number> = { "hle-diamond": 0.03, "simpleqa-verified": 0.3, frames: 0.12, "gpqa-diamond": 0.01, fresh: 0.35 };

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function mockAnswerFor(model: string, item: Item, run: number): { answer: string | null; correct: boolean; confidence: number } {
  const easiness = seeded("easy", item.dataset, item.id)();
  const r = seeded("ans", model, item.id, run);
  const skill = MOCK_SKILL[item.dataset][model] ?? 0.3;
  const p = clamp(skill + 1.1 * (easiness - 0.5), 0.02, 0.98);
  const u = r();
  if (u < p) return { answer: item.answer, correct: true, confidence: clamp(0.5 + 0.45 * r() + 0.1 * easiness, 0, 1) };
  if (r() < MOCK_DECLINE[item.dataset]) return { answer: null, correct: false, confidence: 0.1 + 0.2 * r() };
  // Wrong answers cluster on a few "popular" distractors, so wrong models sometimes agree.
  const v = r();
  const k = v < 0.5 ? 1 : v < 0.8 ? 2 : 3;
  let answer: string;
  if (item.answerType === "mc") {
    const opts = item.dataset === "gpqa-diamond" ? "ABCD" : "ABCDE";
    const others = [...opts].filter((c) => c !== item.answer);
    answer = others[(k - 1) % others.length];
  } else answer = `Distractor ${k} (${item.id})`;
  return { answer, correct: false, confidence: clamp(0.35 + 0.5 * r(), 0, 1) };
}

const fmt = (answer: string | null, conf: number, item: Item) =>
  `Explanation: synthetic mock output.\n${item.dataset === "hle-diamond" && item.answerType !== "mc" ? "Exact Answer" : "Answer"}: ${answer ?? "I don't know"}\nConfidence: ${Math.round(conf * 100)}%`;

function mockTokens(req: CallRequest): { inp: number; out: number } {
  const t = PROFILES[req.mock.item.dataset];
  switch (req.role) {
    case "answer": return { inp: t.inp, out: t.out + t.rsn };
    case "extract": return { inp: 500 + 4 * t.out, out: 300 };
    case "verify": return { inp: 1500 + 2 * t.out, out: 600 + Math.floor(t.rsn / 2) };
    case "judge": return { inp: 1600 + 4 * t.out, out: 800 + t.jrsn };
    case "retrieve": return { inp: 3000, out: 200 };
    case "synthesize": return { inp: 1600 + 4 * t.out, out: 600 + Math.floor(t.rsn / 4) };
    case "grade": return { inp: 800, out: 100 };
  }
}

export class FakeProvider implements BenchProvider {
  readonly live = false;
  readonly name = "fake (offline mock)";
  constructor(private readonly at: string) {}

  async call(req: CallRequest): Promise<CallResult> {
    const { item, run } = req.mock;
    const r = seeded("mock", req.role, req.modelId, item.id, run, req.prompt.length);
    let text = "";
    const citations: string[] = [];
    switch (req.role) {
      case "answer": {
        const a = mockAnswerFor(req.modelId, item, run);
        text = fmt(a.answer, a.confidence, item);
        break;
      }
      case "extract": {
        text = JSON.stringify({ positions: (req.mock.positions ?? []).map((p) => ({ answer: p.answer, responses: p.models.map(Number) })) });
        break;
      }
      case "verify": {
        const positions = req.mock.positions ?? [];
        const disputed = positions.length > 1 ? positions.slice(0, 3).map((p) => `The answer is ${p.answer}`) : [];
        text = JSON.stringify({ verdict: "held", answer: req.mock.draft ?? "", support: req.mock.support ?? 0.5, disputed });
        break;
      }
      case "judge": {
        const positions = req.mock.positions ?? [];
        const gold = positions.find((p) => normalizeAnswer(p.answer) === normalizeAnswer(item.answer));
        const top = positions[0];
        // A judge that is somewhat better than chance at picking the right position when it is present.
        const pick = gold && r() < 0.55 ? gold : top;
        const conf = pick ? clamp(0.35 + 0.4 * r(), 0, 1) : 0.1;
        text = JSON.stringify({ answer: pick ? pick.answer : "I don't know", confidence: conf, rationale: "mock" });
        break;
      }
      case "retrieve": {
        const claim = req.mock.claim ?? "";
        const supports = normalizeAnswer(claim).includes(normalizeAnswer(item.answer));
        const outcome = supports ? (r() < 0.8 ? "supported" : "inconclusive") : r() < 0.6 ? "contradicted" : "inconclusive";
        citations.push(`https://example.org/mock/${encodeURIComponent(item.id)}/${Math.floor(r() * 1000)}`);
        if (r() < 0.05) citations.push(`https://huggingface.co/datasets/mock-leak/${encodeURIComponent(item.id)}`);
        text = JSON.stringify({ outcome, finding: claim, resolution: "mock" });
        break;
      }
      case "synthesize": {
        text = fmt(req.mock.chosen ?? null, req.mock.support ?? 0.5, item);
        break;
      }
      case "grade": {
        const pred = req.mock.predicted;
        let ok = pred != null && (item.answerType === "mc" ? pred.trim().toUpperCase() === item.answer : normalizeAnswer(pred) === normalizeAnswer(item.answer));
        if (r() < 0.03) ok = !ok; // judge noise, exercises the tie-break path
        if (req.mock.template === "hle") text = `extracted_final_answer: ${pred ?? "None"}\nreasoning: mock\ncorrect: ${ok ? "yes" : "no"}\nconfidence: 100`;
        else text = pred == null ? "C" : ok ? "A" : "B";
        break;
      }
    }
    const tok = mockTokens(req);
    const cost = tokenCost(req.modelId, tok.inp, Math.min(tok.out, req.maxTokens), this.at) + (req.web ? EXA_PER_SEARCH_USD : 0);
    const latencyMs = Math.round(300 + (Math.min(tok.out, req.maxTokens) / 90) * 1000 * (0.7 + 0.6 * r()));
    return { ok: true, text, inputTokens: tok.inp, outputTokens: tok.out, costUsd: cost, latencyMs, citations };
  }
}

/* ─────────────────────────── live provider (OpenRouter) ─────────────────────────── */

type ORResponse = {
  model?: string;
  provider?: string;
  choices?: {
    message?: { content?: string | null; refusal?: string | null; annotations?: { type?: string; url_citation?: { url?: string } }[] };
    finish_reason?: string | null;
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number; is_byok?: boolean; cost_details?: { upstream_inference_cost?: number | null } };
};

export const LIVE_TIMEOUT_MS = 600_000;
const RETRIES = 3;

const estimateTokens = (s: string) => Math.ceil(s.length / 3.5) + 50;

export class OpenRouterBenchProvider implements BenchProvider {
  readonly live = true;
  readonly name = "openrouter (live)";

  constructor(
    private key: string,
    private readonly guard: SpendGuard,
    private readonly at: string,
    private readonly base = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
  ) {
    if (!key) throw new Error("OPENROUTER_API_KEY is required for a live run");
    // Tolerate a mis-set env value of the form "OPENROUTER_API_KEY=sk-or-…" (never logged).
    this.key = key.replace(/^OPENROUTER_API_KEY=/, "");
  }

  async call(req: CallRequest): Promise<CallResult> {
    const model = catalogById.get(req.modelId);
    const slug = model && openRouterSlug(model);
    if (!model || !slug) return { ok: false, text: "", inputTokens: 0, outputTokens: 0, costUsd: 0, latencyMs: 0, citations: [], error: `No OpenRouter route for ${req.modelId}` };
    const estIn = estimateTokens(req.system + req.prompt) + (req.web ? 6000 : 0);
    const worst = this.guard.worstCase(req.modelId, estIn, req.maxTokens, req.web ? 1 : 0, EXA_PER_SEARCH_USD);
    const release = this.guard.reserve(worst, `${req.role} ${req.modelId}`); // throws CapExceededError before sending

    const body: Record<string, unknown> = {
      model: slug,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.prompt },
      ],
      max_tokens: req.maxTokens,
      provider: openRouterProviderOptions(model, "standard", req.role === "grade" || req.role === "judge" ? "judge" : undefined),
      usage: { include: true },
    };
    if (req.reasoningEffort) body.reasoning = { effort: req.reasoningEffort };
    if (req.temperature !== undefined && !model.capabilities.rejectsTemperature) body.temperature = req.temperature;
    if (req.web) {
      // Engine always pinned (never native search); benchmark-hosting domains excluded (plan §4.7).
      body.plugins = [{ id: "web", engine: req.web.engine, max_results: req.web.maxResults, exclude_domains: req.web.excludeDomains }];
    }

    const started = Date.now();
    let lastErr = "";
    try {
      for (let attempt = 0; attempt < RETRIES; attempt++) {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), LIVE_TIMEOUT_MS);
        let status = 0;
        try {
          const res = await fetch(`${this.base}/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.key}`, "X-Title": "Keplar benchmark" },
            body: JSON.stringify(body),
            signal: ctl.signal,
          });
          status = res.status;
          if (!res.ok) {
            lastErr = `HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`;
            if (res.status === 429 || res.status >= 500) {
              await new Promise((r) => setTimeout(r, Math.min(8000, 1000 * 2 ** attempt)));
              continue;
            }
            break;
          }
          const j = (await res.json()) as ORResponse;
          const choice = j.choices?.[0];
          const text = choice?.message?.content ?? "";
          const inTok = j.usage?.prompt_tokens ?? estIn;
          const outTok = j.usage?.completion_tokens ?? req.maxTokens;
          const billed = typeof j.usage?.cost === "number" ? j.usage.cost : undefined;
          // Only BYOK splits the bill: there `cost` is OpenRouter's fee and the provider bill is upstream_inference_cost.
          // Without BYOK, `cost` already includes the upstream figure (adding it would double-count).
          const upstream = j.usage?.is_byok ? (j.usage?.cost_details?.upstream_inference_cost ?? 0) : 0;
          const est = tokenCost(req.modelId, inTok, outTok, this.at) + (req.web ? EXA_PER_SEARCH_USD : 0);
          const cost = Math.max((billed ?? 0) + (upstream ?? 0), est);
          this.guard.commit(cost);
          const citations = (choice?.message?.annotations ?? []).filter((a) => a.type === "url_citation" && a.url_citation?.url).map((a) => a.url_citation!.url!);
          const refusal = Boolean(choice?.message?.refusal) || choice?.finish_reason === "refusal" || choice?.finish_reason === "content_filter";
          return { ok: !refusal && text.trim() !== "", text, inputTokens: inTok, outputTokens: outTok, costUsd: cost, billedUsd: billed, latencyMs: Date.now() - started, citations, refusal, servedBy: j.provider, error: refusal ? "refusal" : text.trim() ? undefined : "empty response" };
        } catch (e) {
          if (e instanceof CapExceededError) throw e;
          // Timeout or network error: the request may still have been billed. Count the worst case and don't retry.
          lastErr = status ? `HTTP ${status}` : e instanceof Error ? e.message : String(e);
          this.guard.commit(worst);
          return { ok: false, text: "", inputTokens: 0, outputTokens: 0, costUsd: worst, latencyMs: Date.now() - started, citations: [], error: `network/timeout: ${lastErr} (worst case counted)` };
        } finally {
          clearTimeout(timer);
        }
      }
      return { ok: false, text: "", inputTokens: 0, outputTokens: 0, costUsd: 0, latencyMs: Date.now() - started, citations: [], error: lastErr || "failed" };
    } finally {
      release();
    }
  }
}
