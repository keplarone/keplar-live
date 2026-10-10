/**
 * Live response classification (position + claim extraction).
 *
 * One cheap extractor call reads every panel response and returns:
 *   - per response: answered / declined / off-topic, and which position it takes
 *   - positions: a short label and a one-sentence summary each
 *   - claims: the load-bearing claims, with the responses that make each one
 * Responses become ProviderResults with a real `stance` and `claims`, so the
 * existing EvidenceWeightedComparator can score agreement. Declines and
 * off-topic answers become missing votes (never dissent). If the extractor
 * fails or its JSON can't be read, responses stay `unclassified` and the
 * answer shows agreement as "not scored": nothing is guessed.
 */
import { catalogById } from "./catalog";
import { UNCLASSIFIED } from "./comparator";
import { isBudgetAbort, LatencyBudget } from "./latency";
import { spentUsd } from "./pricing";
import { textOnlyMediaNote } from "./media";
import type { createRegistry } from "./providers";
import type { Claim, ModelSpec, ProviderResult, ResponseClassifier } from "./types";

type Ok = Extract<ProviderResult, { ok: true }>;

export const EXTRACTOR_SYSTEM_PROMPT = `You are Keplar's response classifier. You get a user question and several independent model responses labeled R1, R2, ...
Group the responses by their BOTTOM-LINE position: responses that would lead the user to the same answer or conclusion share a position even if worded differently; responses that give a different answer, number, recommendation or conclusion take different positions. Minor extra detail is not a different position. Use as FEW positions as the responses allow: estimates in the same qualitative band (e.g. "unlikely, 2%" and "unlikely, 10%") share a position; split only when the bottom line differs (yes vs no, likely vs unlikely, a different factual answer, a different recommendation).
Return ONLY JSON:
{"topic":string,"positions":[{"id":"P1","label":string,"summary":string}],"responses":[{"id":"R1","kind":"answer"|"declined"|"off-topic","position":"P1"|null}],"claims":[{"text":string,"responses":["R1"]}]}
- label: at most 8 words, the position itself (e.g. "Yes, botanically a fruit").
- summary: one sentence.
- declined: the response refuses or says it can't answer. off-topic: doesn't address the question. Both get position null.
- claims: at most 8 load-bearing factual or reasoning claims, each listing every response that makes or clearly implies it.
- Use only what the responses say. Do not add knowledge or judge who is right.`;

type Raw = {
  topic?: unknown;
  positions?: { id?: unknown; label?: unknown; summary?: unknown }[];
  responses?: { id?: unknown; kind?: unknown; position?: unknown }[];
  claims?: { text?: unknown; responses?: unknown }[];
};

export type Extraction = {
  topic: string;
  positions: { id: string; label: string; summary: string }[];
  responses: Map<string, { kind: "answer" | "declined" | "off-topic"; position: string | null }>;
  claims: { text: string; responses: string[] }[];
};

/** Lenient parse; malformed entries are dropped, never guessed. Null if unusable. */
export function parseExtraction(text: string, responseIds: string[]): Extraction | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let raw: Raw;
  try {
    raw = JSON.parse(m[0]) as Raw;
  } catch {
    return null;
  }
  const positions = (raw.positions ?? [])
    .filter((p) => p && typeof p.id === "string" && typeof p.label === "string" && p.label.trim())
    .slice(0, 6)
    .map((p) => ({ id: String(p.id), label: String(p.label).trim().slice(0, 80), summary: typeof p.summary === "string" ? p.summary.trim().slice(0, 400) : "" }));
  const pids = new Set(positions.map((p) => p.id));
  const valid = new Set(responseIds);
  const responses = new Map<string, { kind: "answer" | "declined" | "off-topic"; position: string | null }>();
  for (const r of raw.responses ?? []) {
    if (!r || typeof r.id !== "string" || !valid.has(r.id)) continue;
    const kind = r.kind === "declined" || r.kind === "off-topic" ? r.kind : "answer";
    const position = typeof r.position === "string" && pids.has(r.position) ? r.position : null;
    if (kind === "answer" && !position) continue; // an answer without a known position is unusable
    responses.set(r.id, { kind, position: kind === "answer" ? position : null });
  }
  // Every responding model must be classified, or agreement would be scored on a partial picture.
  if (!positions.length || responseIds.some((id) => !responses.has(id))) return null;
  const claims = (raw.claims ?? [])
    .filter((c) => c && typeof c.text === "string" && c.text.trim() && Array.isArray(c.responses))
    .slice(0, 8)
    .map((c) => ({ text: String(c.text).trim().slice(0, 300), responses: (c.responses as unknown[]).map(String).filter((x) => valid.has(x)) }))
    .filter((c) => c.responses.length);
  return { topic: typeof raw.topic === "string" ? raw.topic.trim().slice(0, 120) : "", positions, responses, claims };
}

/** Apply an extraction to the panel results: stances, claims, and declines as missing votes. */
export function applyExtraction(results: ProviderResult[], ids: Map<string, string>, ex: Extraction): { results: ProviderResult[]; summaries: Record<string, string> } {
  const labelOf = new Map(ex.positions.map((p) => [p.id, p.label]));
  const summaries: Record<string, string> = {};
  for (const p of ex.positions) summaries[p.label] = p.summary;
  const out = results.map((r) => {
    if (!r.ok) return r;
    const rid = ids.get(r.modelId);
    const cls = rid ? ex.responses.get(rid) : undefined;
    if (!rid || !cls) return r;
    if (cls.kind !== "answer") {
      return { ok: false as const, modelId: r.modelId, reason: "refusal" as const, message: cls.kind === "declined" ? "Declined to answer. Counted as a missing vote." : "Didn't address the question. Counted as a missing vote.", latencyMs: r.latencyMs };
    }
    const claims: Claim[] = ex.claims.flatMap((c, i) => (c.responses.includes(rid) ? [{ id: `claim-${i}`, text: c.text }] : []));
    return { ...r, stance: labelOf.get(cls.position!)!, claims } satisfies Ok;
  });
  return { results: out, summaries };
}

export class ModelResponseClassifier implements ResponseClassifier {
  spentUsd = 0;
  /** Position label → one-sentence summary from the last run. */
  summaries: Record<string, string> = {};
  topic = "";
  /** Free plan: the longest the extraction may take, and a second model asked if the first is silent after `hedgeMs` (the first valid answer wins). */
  capMs?: number;
  /** Free: ask the model not to think first. */
  reasoningOff = false;
  alternate?: ModelSpec;
  hedgeMs?: number;

  constructor(
    private readonly registry: ReturnType<typeof createRegistry>,
    private readonly model: ModelSpec,
    private readonly budget?: LatencyBudget,
  ) {}

  async classify({ req, results, classification, signal }: Parameters<ResponseClassifier["classify"]>[0]) {
    const ok = results.filter((r): r is Ok => r.ok && r.stance === UNCLASSIFIED);
    if (ok.length < 2) return { results };
    const ids = new Map(ok.map((r, i) => [r.modelId, `R${i + 1}`]));
    const body = ok.map((r) => `### ${ids.get(r.modelId)}\n${r.text.slice(0, 4000)}`).join("\n\n");
    const stage = this.budget ? this.budget.stageMs(0.3) : undefined;
    const callSignal = stage !== undefined ? LatencyBudget.signal(this.capMs ? Math.min(this.capMs, stage) : stage, signal) : signal;
    const call = (model: ModelSpec, sig: AbortSignal | undefined) =>
      this.registry.generate({
        model,
        prompt: `Question:\n${req.prompt}${textOnlyMediaNote(req.media)}\n\nResponses:\n${body}`,
        classification,
        params: this.reasoningOff ? { reasoningOff: true, maxOutputTokens: 1400 } : { reasoningEffort: "low", maxOutputTokens: 1400 },
        tier: req.routing?.tier,
        slot: "verifier",
        system: EXTRACTOR_SYSTEM_PROMPT,
        signal: sig,
      });
    let r: ProviderResult;
    try {
      r = this.alternate && this.hedgeMs ? await hedged(() => call(this.model, callSignal), (sig) => call(this.alternate!, sig), this.hedgeMs, callSignal) : await call(this.model, callSignal);
    } catch (e) {
      if (!isBudgetAbort(e, signal)) throw e;
      return { results, note: "Positions couldn't be extracted within the latency budget, so agreement isn't scored." };
    }
    if (r.ok) this.spentUsd += spentUsd(this.model, r);
    const ex = r.ok ? parseExtraction(r.text, [...ids.values()]) : null;
    if (!ex) return { results, note: r.ok ? "The position extractor's output couldn't be read, so agreement isn't scored." : "The position extractor didn't respond, so agreement isn't scored." };
    const applied = applyExtraction(results, ids, ex);
    this.summaries = applied.summaries;
    this.topic = ex.topic;
    return { results: applied.results, topic: ex.topic };
  }
}

export const extractorName = (id: string) => catalogById.get(id)?.name ?? id;

/**
 * Run `first`; if it has not answered after `afterMs`, also run `second` (with its own abort signal). The first reply that is ok wins and the
 * other is cancelled; if none is ok, the first reply that came back is returned, and if both end in an abort the abort is thrown.
 */
export function hedged(first: () => Promise<ProviderResult>, second: (signal: AbortSignal) => Promise<ProviderResult>, afterMs: number, parent?: AbortSignal): Promise<ProviderResult> {
  return new Promise<ProviderResult>((resolve, reject) => {
    const loser = new AbortController();
    let pending = 1;
    let started = false;
    let settled = false;
    let lastBad: ProviderResult | null = null;
    let lastErr: unknown;
    const end = () => {
      if (settled || --pending > 0) return;
      settled = true;
      if (lastBad) resolve(lastBad); else reject(lastErr ?? new DOMException("timed out", "TimeoutError"));
    };
    const take = (p: Promise<ProviderResult>, isSecond: boolean) =>
      p.then(
        (v) => {
          if (settled) return;
          if (v.ok) { settled = true; clearTimeout(timer); if (isSecond) { /* first keeps running until its own signal ends */ } else loser.abort(); resolve(v); } else { lastBad ??= v; end(); }
        },
        (e) => { lastErr = e; end(); },
      );
    const timer = setTimeout(() => {
      if (settled || parent?.aborted) return;
      started = true;
      pending++;
      take(second(parent ? AbortSignal.any([parent, loser.signal]) : loser.signal), true);
    }, afterMs);
    take(first(), false);
    void started;
  });
}
