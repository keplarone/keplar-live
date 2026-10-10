/**
 * Arm runners: single model, majority vote and the Keplar pipeline
 * (panel → position extraction → agreement → verifier → judge if disputed →
 * optional retrieval on disputed claims → synthesis + confidence).
 *
 * Reuse (plan §5 savings lever): every call is cached by (role, model, item, run, input),
 * so a panel model's answer in the Keplar pipeline IS that model's single-model answer
 * (same prompt), the majority-vote arm reuses the panel, and the +Exa arm shares the
 * panel/verifier/judge stages with its no-search twin (a paired design that isolates search).
 * Each arm's reported cost still includes every call it depends on.
 */
import {
  ANSWER_MAX_TOKENS,
  BLOCKED_DOMAINS,
  HELPER_TEMPERATURE,
  LEVEL_THRESHOLDS,
  MIXES,
  REASONING_EFFORT,
  RETRIEVAL_LIMITS,
  ROLE_MAX_TOKENS,
  type Arm,
  type Mix,
} from "./config";
import { groupByNormalized, isDecline, normalizeAnswer, num01, parseAnswer, parseJsonObject } from "./parse";
import * as P from "./prompts";
import { hashStr } from "./rng";
import type { Agreement, ArmResult, BenchProvider, CallRequest, CallResult, Item, MockHint, Position, Role } from "./types";

export type CallLog = { key: string; role: Role; model: string; itemId: string; run: number; costUsd: number; inputTokens: number; outputTokens: number; latencyMs: number; ok: boolean; error?: string; servedBy?: string };

export class Ctx {
  readonly cache = new Map<string, Promise<CallResult>>();
  readonly calls: CallLog[] = [];
  private readonly cores = new Map<string, Promise<KeplarCore>>();
  constructor(readonly provider: BenchProvider, readonly abstainBelow: number) {}

  call(req: CallRequest, key: string): Promise<CallResult> {
    const k = `${req.role}|${req.modelId}|${req.mock.item.dataset}|${req.mock.item.id}|${req.run}|${key}`;
    let p = this.cache.get(k);
    if (!p) {
      p = this.provider.call(req).then((r) => {
        this.calls.push({ key: k, role: req.role, model: req.modelId, itemId: req.mock.item.id, run: req.run, costUsd: r.costUsd, inputTokens: r.inputTokens, outputTokens: r.outputTokens, latencyMs: r.latencyMs, ok: r.ok, error: r.error, servedBy: r.servedBy });
        return r;
      });
      // A failed promise (e.g. the spend cap) must not be cached as a success; keep it so the error propagates once.
      this.cache.set(k, p);
    }
    return p;
  }

  core(mix: Mix, item: Item, run: number): Promise<KeplarCore> {
    const k = `${mix.id}|${item.dataset}|${item.id}|${run}`;
    let p = this.cores.get(k);
    if (!p) {
      p = keplarCore(this, mix, item, run);
      this.cores.set(k, p);
    }
    return p;
  }
}

const h = (s: string) => hashStr(s).toString(36);

type Stage = { cost: number; latency: number };
const sumCost = (xs: { costUsd: number }[]) => xs.reduce((a, x) => a + x.costUsd, 0);

/* ─────────────────────────── single model ─────────────────────────── */

export type PanelAnswer = { model: string; res: CallResult; answer: string | null; declined: boolean; confidence: number | null };

export async function answerCall(ctx: Ctx, model: string, item: Item, run: number): Promise<PanelAnswer> {
  const system = P.answerSystem(item);
  const prompt = P.answerPrompt(item);
  const res = await ctx.call(
    { modelId: model, role: "answer", system, prompt, maxTokens: ANSWER_MAX_TOKENS[item.dataset], reasoningEffort: REASONING_EFFORT.answer, run, mock: { item, run } },
    h(system + prompt),
  );
  if (!res.ok) return { model, res, answer: null, declined: true, confidence: null };
  const parsed = parseAnswer(res.text, item);
  return { model, res, answer: parsed.answer, declined: parsed.declined, confidence: parsed.confidence };
}

export async function runSingle(ctx: Ctx, arm: Arm, item: Item, run: number): Promise<ArmResult> {
  const a = await answerCall(ctx, arm.model!, item, run);
  return {
    arm: arm.id, itemId: item.id, dataset: item.dataset, run,
    text: a.res.text, answer: a.declined ? null : a.answer, declined: a.declined,
    confidence: a.confidence, confidenceSource: a.confidence == null ? null : "verbalized",
    costUsd: a.res.costUsd, latencyMs: a.res.latencyMs,
    error: a.res.ok ? undefined : a.res.error,
  };
}

/* ─────────────────────────── Keplar core (shared by keplar ± Exa and majority) ─────────────────────────── */

export type KeplarCore = {
  mix: Mix;
  panel: PanelAnswer[];
  positions: Position[];
  agreement: Agreement;
  panelStage: Stage;
  extractStage: Stage;
  review: { verdict: string; answer: string | null; support: number | null; disputed: string[]; readable: boolean };
  verifyStage: Stage;
  judge: { ran: boolean; answer: string | null; confidence: number | null; rationale: string };
  judgeStage: Stage;
};

const sameAnswer = (item: Item, a: string, b: string) => (item.answerType === "mc" ? a.trim().toUpperCase() === b.trim().toUpperCase() : normalizeAnswer(a) === normalizeAnswer(b));

/** Sort by votes desc; ties by the earliest panel member holding the position (pre-registered tie rule). */
function sortPositions(positions: Position[], panelOrder: string[]): Position[] {
  const first = (p: Position) => Math.min(...p.models.map((m) => panelOrder.indexOf(m)));
  return [...positions].sort((a, b) => b.models.length - a.models.length || first(a) - first(b));
}

async function extractPositions(ctx: Ctx, mix: Mix, item: Item, run: number, panel: PanelAnswer[]): Promise<{ positions: Position[]; stage: Stage }> {
  const votes = panel.map((p) => ({ model: p.model, answer: p.declined ? null : p.answer }));
  const simple = groupByNormalized(votes);
  const order = panel.map((p) => p.model);
  // Multiple choice, unanimous or ≤ 1 answer: deterministic grouping, no call.
  if (item.answerType === "mc" || simple.length <= 1) return { positions: sortPositions(simple, order), stage: { cost: 0, latency: 0 } };

  const finals = panel.map((p) => (p.declined ? null : p.answer));
  const hintPositions = groupByNormalized(votes.map((v, i) => ({ model: String(i + 1), answer: v.answer })));
  const prompt = P.extractPrompt(item, finals);
  const res = await ctx.call(
    { modelId: mix.extractor, role: "extract", system: P.EXTRACT_SYSTEM, prompt, maxTokens: ROLE_MAX_TOKENS.extract, reasoningEffort: REASONING_EFFORT.extract, temperature: HELPER_TEMPERATURE, run, mock: { item, run, positions: hintPositions } },
    h(prompt),
  );
  const stage = { cost: res.costUsd, latency: res.latencyMs };
  const j = res.ok ? parseJsonObject(res.text) : null;
  const raw = Array.isArray(j?.positions) ? (j!.positions as unknown[]) : null;
  if (!raw) return { positions: sortPositions(simple, order), stage };
  const used = new Set<number>();
  const out: Position[] = [];
  for (const r of raw) {
    const o = r as { answer?: unknown; responses?: unknown };
    const idxs = (Array.isArray(o.responses) ? o.responses : []).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= panel.length && finals[n - 1] != null && !used.has(n));
    if (!idxs.length) continue;
    idxs.forEach((n) => used.add(n));
    out.push({ answer: finals[idxs[0] - 1]!, models: idxs.map((n) => panel[n - 1].model) });
  }
  // Anything the extractor dropped keeps its own normalised position (never silently lost).
  const leftovers = groupByNormalized(votes.filter((_, i) => !used.has(i + 1)));
  for (const l of leftovers) {
    const hit = out.find((p) => sameAnswer(item, p.answer, l.answer));
    if (hit) hit.models.push(...l.models);
    else out.push(l);
  }
  return { positions: sortPositions(out, order), stage };
}

export function agreementOf(positions: Position[], responded: number): Agreement {
  const top = positions[0]?.models.length ?? 0;
  const support = responded ? top / responded : 0;
  const pct = support * 100;
  const level: Agreement["level"] = responded === 0 ? "none" : pct >= LEVEL_THRESHOLDS.consensus ? "consensus" : pct >= LEVEL_THRESHOLDS.partial ? "partial" : "none";
  return { level, support, disagreed: positions.length > 1, responded, positions: positions.length };
}

async function keplarCore(ctx: Ctx, mix: Mix, item: Item, run: number): Promise<KeplarCore> {
  const panel = await Promise.all(mix.panel.map((m) => answerCall(ctx, m, item, run)));
  const panelStage = { cost: sumCost(panel.map((p) => p.res)), latency: Math.max(...panel.map((p) => p.res.latencyMs)) };
  const { positions, stage: extractStage } = await extractPositions(ctx, mix, item, run, panel);
  const responded = panel.filter((p) => !p.declined && p.answer != null).length;
  const agreement = agreementOf(positions, responded);
  const texts = panel.filter((p) => p.res.ok).map((p) => p.res.text);
  const draft = positions[0]?.answer ?? "I don't know";

  let review: KeplarCore["review"] = { verdict: "skipped", answer: null, support: null, disputed: [], readable: false };
  let verifyStage: Stage = { cost: 0, latency: 0 };
  if (texts.length) {
    const prompt = P.verifyPrompt(item, texts, draft);
    const res = await ctx.call(
      { modelId: mix.verifier, role: "verify", system: P.VERIFY_SYSTEM, prompt, maxTokens: ROLE_MAX_TOKENS.verify, reasoningEffort: REASONING_EFFORT.verify, run, mock: { item, run, draft, support: agreement.support, positions } },
      h(prompt),
    );
    verifyStage = { cost: res.costUsd, latency: res.latencyMs };
    const j = res.ok ? parseJsonObject(res.text) : null;
    review = j
      ? {
          verdict: j.verdict === "revised" ? "revised" : "held",
          answer: typeof j.answer === "string" && j.answer.trim() ? j.answer.trim() : null,
          support: num01(j.support),
          disputed: (Array.isArray(j.disputed) ? j.disputed : []).filter((d): d is string => typeof d === "string" && d.trim() !== "").slice(0, RETRIEVAL_LIMITS.maxClaims),
          readable: true,
        }
      : { verdict: "unreadable", answer: null, support: null, disputed: [], readable: false };
  }

  let judge: KeplarCore["judge"] = { ran: false, answer: null, confidence: null, rationale: "" };
  let judgeStage: Stage = { cost: 0, latency: 0 };
  if (agreement.disagreed) {
    const reviewText = review.readable ? `Verdict: ${review.verdict}; best supported: ${review.answer ?? "n/a"}; disputed: ${review.disputed.join(" | ") || "none"}` : "Review unavailable.";
    const prompt = P.judgePrompt(item, texts, positions, reviewText);
    const res = await ctx.call(
      { modelId: mix.judge, role: "judge", system: P.JUDGE_SYSTEM, prompt, maxTokens: ROLE_MAX_TOKENS.judge, reasoningEffort: REASONING_EFFORT.judge, run, mock: { item, run, positions } },
      h(prompt),
    );
    judgeStage = { cost: res.costUsd, latency: res.latencyMs };
    const j = res.ok ? parseJsonObject(res.text) : null;
    const ans = j && typeof j.answer === "string" ? j.answer.trim() : null;
    judge = { ran: true, answer: ans && !isDecline(ans) ? ans : null, confidence: j ? num01(j.confidence) : null, rationale: j && typeof j.rationale === "string" ? j.rationale.slice(0, 500) : res.ok ? "unreadable" : `failed: ${res.error}` };
  }
  return { mix, panel, positions, agreement, panelStage, extractStage, review, verifyStage, judge, judgeStage };
}

/* ─────────────────────────── majority vote ─────────────────────────── */

export async function runMajority(ctx: Ctx, arm: Arm, item: Item, run: number): Promise<ArmResult> {
  const c = await ctx.core(MIXES[arm.mix!], item, run);
  const top = c.positions[0];
  return {
    arm: arm.id, itemId: item.id, dataset: item.dataset, run,
    text: top ? `Answer: ${top.answer}` : "Answer: I don't know",
    answer: top?.answer ?? null, declined: !top,
    confidence: top ? c.agreement.support : null, confidenceSource: top ? "vote-share" : null,
    agreement: c.agreement,
    costUsd: c.panelStage.cost + c.extractStage.cost,
    latencyMs: c.panelStage.latency + c.extractStage.latency,
    stages: { positions: c.positions.map((p) => `${p.answer} ×${p.models.length}`).join(" | ") },
  };
}

/* ─────────────────────────── Keplar pipeline ─────────────────────────── */

export function blockedUrl(url: string): boolean {
  let host: string;
  let path: string;
  try {
    const u = new URL(url);
    host = u.hostname.toLowerCase().replace(/^www\./, "");
    path = u.pathname.toLowerCase();
  } catch {
    return false;
  }
  return BLOCKED_DOMAINS.some((d) => {
    const [dh, ...rest] = d.split("/");
    const dp = rest.length ? `/${rest.join("/")}` : "";
    const hostMatch = host === dh || host.endsWith(`.${dh}`);
    return hostMatch && (!dp || path === dp || path.startsWith(`${dp}/`));
  });
}

/** Host-level domains for Exa's exclude list (path entries are enforced by post-filtering). */
export const EXCLUDE_HOSTS = [...new Set(BLOCKED_DOMAINS.filter((d) => !d.includes("/")))];

/**
 * Keplar confidence (pre-registered, deterministic, same inputs as the app's comparator):
 *   s = share of responding panel models whose position equals the final answer
 *   judge ran → c = (s + judgeConfidence) / 2, else c = s
 *   verifier support v → c = 0.8·c + 0.2·v
 *   retrieval on the final answer: supported +0.15, contradicted −0.25
 *   clamped to [0.01, 0.99]
 */
export function keplarConfidence(input: { share: number; judgeConf: number | null; verifierSupport: number | null; retrieval: "supported" | "contradicted" | null }): number {
  let c = input.judgeConf != null ? (input.share + input.judgeConf) / 2 : input.share;
  if (input.verifierSupport != null) c = 0.8 * c + 0.2 * input.verifierSupport;
  if (input.retrieval === "supported") c += 0.15;
  if (input.retrieval === "contradicted") c -= 0.25;
  return Math.min(0.99, Math.max(0.01, c));
}

export async function runKeplar(ctx: Ctx, arm: Arm, item: Item, run: number): Promise<ArmResult> {
  const mix = MIXES[arm.mix!];
  const c = await ctx.core(mix, item, run);
  const texts = c.panel.filter((p) => p.res.ok).map((p) => p.res.text);

  // Rule-based pick: judge (if it ran and answered) > verifier revision matching a position > leading position.
  let chosen: string | null = c.positions[0]?.answer ?? null;
  if (c.review.verdict === "revised" && c.review.answer) {
    const hit = c.positions.find((p) => sameAnswer(item, p.answer, c.review.answer!));
    if (hit) chosen = hit.answer;
  }
  if (c.judge.ran) chosen = c.judge.answer;

  // Optional retrieval: only on disputed claims, only when the panel disagreed.
  let retrieval: ArmResult["retrieval"];
  let retrievalStage: Stage = { cost: 0, latency: 0 };
  const outcomes: { claim: string; outcome: string }[] = [];
  if (arm.retrieval && c.agreement.disagreed && c.review.disputed.length) {
    const urls: string[] = [];
    const blocked: string[] = [];
    const results = await Promise.all(
      c.review.disputed.slice(0, RETRIEVAL_LIMITS.maxClaims).map((claim) =>
        ctx.call(
          {
            modelId: mix.verifier, role: "retrieve", system: P.RETRIEVE_SYSTEM, prompt: P.retrievePrompt(claim), maxTokens: ROLE_MAX_TOKENS.retrieve, reasoningEffort: REASONING_EFFORT.retrieve, run,
            web: { engine: "exa", maxResults: RETRIEVAL_LIMITS.maxResults, excludeDomains: EXCLUDE_HOSTS },
            mock: { item, run, claim },
          },
          h(claim),
        ).then((res) => ({ claim, res })),
      ),
    );
    for (const { claim, res } of results) {
      const good = res.citations.filter((u) => !blockedUrl(u));
      const bad = res.citations.filter((u) => blockedUrl(u));
      urls.push(...good);
      blocked.push(...bad);
      const j = res.ok ? parseJsonObject(res.text) : null;
      let outcome = j?.outcome === "supported" || j?.outcome === "contradicted" ? String(j.outcome) : "inconclusive";
      // No usable source, or evidence from a benchmark-hosting domain → the check doesn't count.
      if (!good.length || bad.length) outcome = "inconclusive";
      outcomes.push({ claim, outcome });
    }
    retrievalStage = { cost: sumCost(results.map((r) => r.res)), latency: Math.max(...results.map((r) => r.res.latencyMs)) };
    retrieval = { searches: results.length, urls, blocked, outcomes: outcomes.map((o) => `${o.outcome}: ${o.claim}`), leaked: blocked.length > 0 };
    // Rule: if the chosen answer's claim was contradicted and exactly one other position's claim was supported, switch.
    const claimFor = (ans: string) => outcomes.find((o) => normalizeAnswer(o.claim).includes(normalizeAnswer(ans)));
    const chosenCheck = chosen ? claimFor(chosen) : undefined;
    const supported = c.positions.filter((p) => claimFor(p.answer)?.outcome === "supported");
    if ((!chosen || chosenCheck?.outcome === "contradicted") && supported.length === 1) chosen = supported[0].answer;
  }

  const share = chosen ? (c.positions.find((p) => sameAnswer(item, p.answer, chosen!))?.models.length ?? 0) / Math.max(1, c.agreement.responded) : 0;
  const retrievalOnChosen = chosen ? (outcomes.find((o) => normalizeAnswer(o.claim).includes(normalizeAnswer(chosen!)))?.outcome ?? null) : null;
  const ruleConfidence = keplarConfidence({
    share,
    judgeConf: c.judge.ran ? c.judge.confidence : null,
    verifierSupport: c.review.support,
    retrieval: retrievalOnChosen === "supported" || retrievalOnChosen === "contradicted" ? retrievalOnChosen : null,
  });

  // Synthesis: the synthesizer writes the final answer from all evidence.
  const notes = [
    `Panel agreement: ${c.agreement.level} (${Math.round(c.agreement.support * 100)}% of ${c.agreement.responded} responding).`,
    c.review.readable ? `Reviewer: ${c.review.verdict}; best supported: ${c.review.answer ?? "n/a"}.` : "Reviewer output unavailable.",
    c.judge.ran ? `Judge: ${c.judge.answer ?? "no answer"} (confidence ${c.judge.confidence ?? "n/a"}). ${c.judge.rationale}` : "",
    ...outcomes.map((o) => `Web check (${o.outcome}): ${o.claim}`),
  ].filter(Boolean);
  const prompt = P.synthesizePrompt(item, texts, c.positions, notes);
  const syn = await ctx.call(
    { modelId: mix.synthesizer, role: "synthesize", system: P.synthesizeSystem(item), prompt, maxTokens: ROLE_MAX_TOKENS.synthesize, reasoningEffort: REASONING_EFFORT.synthesize, run, mock: { item, run, chosen, support: ruleConfidence } as MockHint },
    h(prompt + arm.id),
  );
  let answer: string | null = chosen;
  let declined = !chosen;
  if (syn.ok) {
    const parsed = parseAnswer(syn.text, item);
    answer = parsed.declined ? null : parsed.answer;
    declined = parsed.declined;
  }
  // Recompute the share for the synthesizer's actual answer (it may differ from the rule pick).
  let confidence = ruleConfidence;
  if (answer && chosen && !sameAnswer(item, answer, chosen)) {
    const s2 = (c.positions.find((p) => sameAnswer(item, p.answer, answer!))?.models.length ?? 0) / Math.max(1, c.agreement.responded);
    confidence = keplarConfidence({ share: s2, judgeConf: null, verifierSupport: c.review.support, retrieval: null });
  }
  let abstained = false;
  if (!declined && item.answerType !== "mc" && confidence < ctx.abstainBelow) {
    declined = true;
    abstained = true;
  }

  const stages = [c.panelStage, c.extractStage, c.verifyStage, c.judgeStage, retrievalStage, { cost: syn.costUsd, latency: syn.latencyMs }];
  return {
    arm: arm.id, itemId: item.id, dataset: item.dataset, run,
    text: syn.ok ? syn.text : `Answer: ${chosen ?? "I don't know"}`,
    answer: declined ? null : answer, declined,
    confidence, confidenceSource: "keplar",
    agreement: c.agreement,
    costUsd: stages.reduce((a, s) => a + s.cost, 0),
    latencyMs: stages.reduce((a, s) => a + s.latency, 0),
    retrieval,
    stages: {
      positions: c.positions.map((p) => `${p.answer} ×${p.models.length}`).join(" | "),
      review: c.review.verdict,
      judge: c.judge.ran ? (c.judge.answer ?? "declined") : "not run",
      ...(abstained ? { abstained: `confidence ${confidence.toFixed(2)} < ${ctx.abstainBelow}` } : {}),
      ...(syn.ok ? {} : { synthesizer: `failed (${syn.error}); rule pick used` }),
    },
  };
}

export async function runArm(ctx: Ctx, arm: Arm, item: Item, run: number): Promise<ArmResult> {
  switch (arm.kind) {
    case "single": return runSingle(ctx, arm, item, run);
    case "majority": return runMajority(ctx, arm, item, run);
    case "keplar": return runKeplar(ctx, arm, item, run);
    case "best-single": throw new Error("best-single is resolved from the dev split, not run directly");
  }
}
