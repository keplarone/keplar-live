/**
 * Keplar-One pipeline. Wires the interfaces together and emits stage events
 * as an async stream. Every dependency is an interface; tests inject mocks.
 */
import { HeuristicClassifier } from "./classifier";
import { classifierModel, ModelClassifier } from "./model-classifier";
import { EvidenceWeightedComparator } from "./comparator";
import { computeLevel, toUnits, USD_PER_UNIT } from "./compute";
import { METER_MARGIN, overRequestCap, REQUEST_TOO_BIG } from "./limits";
import { DEEP_RESEARCH_UNITS, PLAN_ALLOWANCES } from "./plans";
import { liveEnv, modelClassifierEnabled, type KeyTier } from "./config";
import { sanitizeParams } from "./pricing";
import { createRegistry, defaultProviders, FREE_BUSY_MESSAGE, liveMode } from "./providers";
import { isEmptyAnswer, noResponseEvent } from "./no-response";
import { QUALITY_FAIL_MESSAGE, UNRELIABLE_MESSAGE } from "./quality-gate";
import { sanityCheck, sanityEnabled } from "./sanity";
import { freeFallbacks, loadFreeCatalog, loadLiveCatalog } from "./catalog-sync";
import { ModelResponseClassifier } from "./extractor";
import { isBudgetAbort, LatencyBudget } from "./latency";
import { liveSpendGuard } from "./live-budget";
import { FREE_ROLES, LIVE_ROLES } from "./live-catalog";
import { ModelSynthesizer } from "./live-synthesizer";
import { CostAwareRouter, NoVisionModelError } from "./router";
import { hasMedia, NO_FREE_VISION_MESSAGE, visionPreamble } from "./media";
import { isCreatorQuestion, runCreator } from "./creator";
import { guardReply } from "./identity-guards";
import { exactCheck, exactNote } from "./exact";
import { isSmallTalk, runSmallTalk } from "./smalltalk";
import { isSupportRequest, runSupport } from "./support";
import { runPlayful } from "./playful";
import { earlyStream } from "./early-stream";
import { isGuideRequest, shapeHint } from "./answer-shape";
import { richHint } from "@/lib/rich-answer/prompt";
import { quizAsk } from "@/lib/quiz/ask";
import { QUIZ_PANEL_RULES, quizPanelHint } from "@/lib/quiz/prompt";
import { answeredAsQuestion, IMAGE_ONLY_PROMPT, imageQuestionMode, isImageOnlyPrompt, QUESTION_IMAGE_NOTE } from "./image-question";
import { systemPrompt } from "./providers/shared";
import { createRetriever, retrievalApplies, retrievalEstimateUsd } from "./retriever";
import { budgetSkipped, runSourcing, signSourcing, sourcingGate } from "./sourcing";
import { linkCitations, OFF_BUDGET, OFF_NOT_ENABLED, OFF_SENSITIVE, researchEstimateUsd, runResearch } from "./research";
import { LIVE_RESEARCH_RULES, liveResearchSummary } from "@/lib/research/live-request";
import { checkCitations } from "@/lib/research/citation-check";
import { ModelVerifier } from "./verifier";
import { MergedFreeReview } from "./free-merged";
import { sharedPool } from "./pool-governor";
import { debateCostFactor, debatePolicy, debaterSystem, runDebate, type DebateSummary } from "./debate";
import type {
  Retriever,
  Classification,
  Classifier,
  Comparator,
  GenerationParams,
  KeplarAnswer,
  KeplarEvent,
  KeplarRequest,
  ModelSpec,
  Provider,
  ProviderResult,
  ResponseClassifier,
  Router,
  ResearchStepId,
  ResearchSummary,
  RoutingPlan,
  Sourcing,
  Synthesizer,
  Verifier,
} from "./types";

/** Most time the web check of disputed claims may take before the answer goes out without it. */
const WEB_CHECK_MS = 25_000;

export type Deps = {
  classifier: Classifier;
  router: Router;
  providers: Provider[];
  comparator: Comparator;
  verifier: Verifier;
  synthesizer: Synthesizer;
  /** Optional web check of disputed claims. null = feature flag off (default). */
  retriever: Retriever | null;
  /** Optional pacing between stages (ms). Live pipelines pass 0. */
  pace: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Live only: classifies free-text responses into positions + claims before comparison. */
  responseClassifier?: ResponseClassifier | null;
  /** Free plan (live): one combined classify + review + write request replaces the separate extractor, reviewer and write-up (free-merged.ts). */
  mergedReview?: MergedFreeReview | null;
  /** Live only: one latency budget shared by the panel and the later stages. */
  budget?: LatencyBudget | null;
  /** Registry to use for panel calls (live: carries the daily spend guard). */
  registry?: ReturnType<typeof createRegistry>;
  /** Paid plans only: the model that may PROPOSE connected-app tool calls before an answer (mcp/chat.ts). null/undefined = tools off. */
  toolPlanner?: { registry: ReturnType<typeof createRegistry>; model: ModelSpec } | null;
  /** Free-only registry for small talk. undefined = use `registry`; null = small-talk routing off. */
  smallTalk?: ReturnType<typeof createRegistry> | null;
  /**
   * Filled in by the engine so the caller can still bill a run that is stopped
   * or fails after paid calls were sent. `plannedUnits` is the estimate with the
   * safety margin; `started` flips right before the panel is called; `settled`
   * when the final answer (and its real cost) was emitted. `noResponse` is set
   * when the run ended with no model answering: that run is never billed.
   * `responded` is the number of panel models that answered (set once the panel finished).
   */
  run?: { started: boolean; settled: boolean; plannedUnits: number; noResponse?: boolean; responded?: number; extraUnits?: number };
};

/**
 * Dependencies for this environment, or null when no live models are
 * configured (KEPLAR_LIVE_MODELS=1 plus a provider key). Nothing is faked:
 * callers show a "not set up yet" state instead.
 */
export function engineDeps(opts: { keyTier?: KeyTier } = {}): Deps | null {
  const keyTier = opts.keyTier ?? "paid";
  const env = liveEnv(keyTier);
  if (!liveMode(env)) return null;
  const providers = defaultProviders(keyTier);
  return providers.length ? liveDeps(providers, env) : null;
}

/** A free-only registry for small talk: `:free` models only, with fallbacks. Null when not live. */
export function smallTalkRegistry(): ReturnType<typeof createRegistry> | null {
  const env = liveEnv("free");
  if (!liveMode(env)) return null;
  const providers = defaultProviders("free");
  if (!providers.length) return null;
  const cat = loadFreeCatalog();
  return createRegistry(providers, { guard: liveSpendGuard(env.liveDailyUsdCap), freeOnly: true, pool: sharedPool(), fallbacks: freeFallbacks(cat.roster, cat.extras) });
}

/** Paid plans: when a model's answer fails the quality gate, escalate to the cheapest other primary models (never the same one). */
export function qualityFallbacksFor(roster: readonly ModelSpec[]) {
  return (m: ModelSpec): ModelSpec[] =>
    roster
      .filter((x) => x.routable && x.id !== m.id && x.role !== "judge" && x.role !== "verifier" && (x.pricing[0]?.outputPer1M ?? 99) <= 1.5)
      .sort((a, b) => Number(a.family === m.family) - Number(b.family === m.family) || (a.pricing[0]?.outputPer1M ?? 0) - (b.pricing[0]?.outputPer1M ?? 0))
      .slice(0, 3);
}

/**
 * Live dependencies (KEPLAR_LIVE_MODELS=1 + keys): the cheap live roster with
 * the latest catalog sync applied, the daily spend cap on every call, one
 * shared latency budget, the response classifier and the judge-tier synthesizer.
 */
/** Free plan: the extraction is capped at 10 s and, if the extractor is silent for 5 s, a second free model is asked too (first valid answer wins). */
function freeExtractor(c: ModelResponseClassifier, free: boolean, byId: Map<string, ModelSpec>) {
  if (free) { c.capMs = 10_000; c.hedgeMs = 4_000; c.alternate = byId.get("free:nemotron-3.5-lightning"); c.reasoningOff = true; }
  return c;
}

export function liveDeps(providers: Provider[], env: ReturnType<typeof liveEnv>, opts?: { modelClassifier?: boolean }): Deps {
  const free = env.keyTier === "free";
  // Free plan: $0 `:free` roster, hard price guard on every call, fallback to other free models.
  const freeCat = free ? loadFreeCatalog() : null;
  const roster = freeCat ? freeCat.roster : loadLiveCatalog();
  const byId = new Map(roster.map((m) => [m.id, m]));
  const registry = createRegistry(providers, freeCat
    ? { guard: liveSpendGuard(env.liveDailyUsdCap), freeOnly: true, pool: sharedPool(), fallbacks: freeFallbacks(freeCat.roster, freeCat.extras) }
    : { guard: liveSpendGuard(env.liveDailyUsdCap), qualityFallbacks: qualityFallbacksFor(roster) });
  // Free plan: once two models have answered, a straggler gets 3.5 s (not 6 s) before the answer is written from the two good ones.
  const budget = new LatencyBudget(env.latencyBudgetMs, free ? { graceMinMs: 3500, graceMaxMs: 4000 } : {});
  const roles = free ? FREE_ROLES : LIVE_ROLES;
  const extractor = (byId.get(roles.extractor) ?? roster[0])!;
  const synth = (byId.get(roles.synthesizer) ?? roster[0])!;
  const synthesizer = new ModelSynthesizer(registry, synth, budget);
  synthesizer.draftless = free;
  if (free) synthesizer.reasoningOff = true;
  const mergedReview = free && env.freeMerged ? new MergedFreeReview(registry, synth, budget) : null;
  if (mergedReview) { synthesizer.noExtraCalls = true; synthesizer.draftless = true; }
  if (free) synthesizer.synthCapMs = 12_000; // normal Free synthesis takes 4-6 s; past 12 s the best-supported model's own answer is shown instead
  const heuristic = new HeuristicClassifier();
  const useModel = opts?.modelClassifier ?? modelClassifierEnabled();
  const classifier = useModel ? new ModelClassifier({ ask: (input) => registry.generate(input), model: classifierModel(roster, free), fallback: heuristic }) : heuristic;
  return {
    classifier,
    router: new CostAwareRouter(roster),
    providers,
    comparator: new EvidenceWeightedComparator(),
    verifier: new ModelVerifier(registry),
    synthesizer,
    responseClassifier: freeExtractor(new ModelResponseClassifier(registry, extractor, budget), free, byId),
    mergedReview,
    // Web retrieval stays off in live mode unless explicitly enabled.
    retriever: createRetriever(env),
    pace: async () => {},
    budget,
    registry,
    toolPlanner: free ? null : { registry, model: extractor },
    // Small talk always uses the free roster, even on paid plans.
    smallTalk: free ? registry : smallTalkRegistry(),
  };
}

/**
 * Generation parameters per slot. Diversity comes from mixing model families
 * and alternating reasoning effort, not from temperature (several frontier
 * APIs reject it). Confidence comes from agreement plus verifier scores, so
 * logprobs are never requested. Everything is sanitised per model anyway.
 */
/** Live panel calls: cheap models, low reasoning effort, bounded output (spend + latency). */
const LIVE_PANEL_PARAMS: GenerationParams = { reasoningEffort: "low", maxOutputTokens: 1400 };
/** Reason mode: more thinking and room for the visible steps. */
const REASON_PANEL_PARAMS: GenerationParams = { reasoningEffort: "medium", maxOutputTokens: 2200 };
/** Live panel on a complex question: more thinking before answering, a little more room (simple and moderate stay cheap and fast). */
const LIVE_COMPLEX_PANEL_PARAMS: GenerationParams = { reasoningEffort: "medium", maxOutputTokens: 1800 };
/** A how-to guide (answer-shape.ts): room for every step, check and fix (a full guide runs 500 to 1,500 words), and enough thinking to get the order right. */
const GUIDE_BUDGET_MS = 120_000;
const GUIDE_PANEL_PARAMS: GenerationParams = { reasoningEffort: "medium", maxOutputTokens: 3600 };
/** Ten questions, four options, and a short explanation each. One panel call. */
const QUIZ_PANEL_PARAMS: GenerationParams = { reasoningEffort: "low", maxOutputTokens: 4800 };
export const livePanelParams = (c: Classification, reason?: boolean, guide?: boolean) => (guide ? (reason ? { ...GUIDE_PANEL_PARAMS, maxOutputTokens: 4200 } : GUIDE_PANEL_PARAMS) : reason ? REASON_PANEL_PARAMS : c.complexity === "complex" ? LIVE_COMPLEX_PANEL_PARAMS : LIVE_PANEL_PARAMS);

function paramsFor(slot: "panel" | "verifier" | "judge", index: number): GenerationParams {
  if (slot === "verifier") return { reasoningEffort: "low" };
  if (slot === "judge") return { reasoningEffort: "high" };
  return { reasoningEffort: index % 2 === 0 ? "medium" : "high" };
}

const NOT_SET_UP = "No provider configured for this model.";

const tokens = (t: string) => new Set(t.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);

/** Claims whose wording overlaps a "removed" finding (≥ 60% of the claim's words). */
/**
 * Stand-in timing (Free plan only, where a second call costs $0). Once one model has answered, a seat that is still silent
 * after `max(minMs, factor x the first answer time)` gets a second, different free model started in parallel; whichever
 * answers first fills the seat, and the answer says which model actually did. `windowMs` is how long the stand-in may run.
 */
export const hedgeTuning = { minMs: 3000, factor: 0.5, windowMs: 9000 };

export function removedClaims(results: ProviderResult[], findings: string[]) {
  const seen = new Map<string, { id: string; text: string }>();
  for (const r of results) if (r.ok) for (const c of r.claims) seen.set(c.id, c);
  const fs = findings.map(tokens);
  return [...seen.values()].filter((c) => {
    const ct = tokens(c.text);
    if (ct.size < 3) return false;
    return fs.some((f) => [...ct].filter((w) => f.has(w)).length / ct.size >= 0.6);
  });
}

/** True when this run is limited to free models (Free plan or a free-only registry). */
function freeOnlyRun(deps: { registry?: { freeOnly?: boolean } | null }, req: KeplarRequest): boolean {
  return req.plan === "free" || Boolean(deps.registry?.freeOnly);
}

/**
 * The answer to a question that is nothing but an exact calculation, or null. Only bare questions qualify: with files, images,
 * Reason, Deep Research or Debate switched on, or any wording beyond the calculation (exactCheck matches whole questions only),
 * the models still answer, with the exact result handed to them as a verified fact.
 */
export function instantExact(req: Pick<KeplarRequest, "prompt" | "attachments" | "media" | "modes">): string | null {
  if (req.attachments?.length || req.media) return null;
  if (req.modes && Object.values(req.modes).some(Boolean)) return null;
  const c = exactCheck(req.prompt);
  return c ? `${c.statement} Worked out by code, not by an AI model.` : null;
}

export async function* orchestrate(req: KeplarRequest, deps: Deps, signal?: AbortSignal): AsyncGenerator<KeplarEvent> {
  const started = Date.now();
  // "Are you human?" / "are you conscious?": fixed, code-enforced replies before anything else (identity-guards.ts). No model, no charge.
  const fixed = guardReply(req);
  if (fixed) {
    yield* runCreator(undefined, fixed);
    return;
  }
  // "Who created Keplar?": a fixed answer, no model, no charge. Every plan.
  if (isCreatorQuestion(req)) {
    yield* runCreator();
    return;
  }
  // "What is 12 times 9?", "is 97 prime?", "how many r's in strawberry?": the whole question is a calculation the exact checker
  // (exact.ts) does by code, so it is answered from that, instantly. No model, no charge. Every plan.
  const instant = instantExact(req);
  if (instant) {
    yield* runCreator(undefined, instant);
    return;
  }
  // Casual chat ("hi", "thanks"): one free model, no panel, no review, no charge. Every plan.
  if (deps.smallTalk !== null && isSmallTalk(req)) {
    const registry = deps.smallTalk ?? deps.registry;
    if (registry) {
      yield* runSmallTalk(req, { registry }, signal);
      return;
    }
  }
  // Jokes, riddles, puns, knock-knock and banter (playful.ts): one fast free model, a short funny reply, a plain card, no charge.
  if (deps.smallTalk !== null && req.understanding?.intent === "playful") {
    const registry = deps.smallTalk ?? deps.registry;
    if (registry) {
      yield* runPlayful(req, { registry }, signal);
      return;
    }
  }
  // Stress, sadness, excitement or frustration with no concrete task: a fuller, warmer reply from two free models plus a short synthesis
  // (support.ts), shown as a plain reply. No consensus card, no charge. A task with some feeling around it goes through the full engine below.
  if (deps.smallTalk !== null && isSupportRequest(req)) {
    const registry = deps.smallTalk ?? deps.registry;
    if (registry) {
      yield* runSupport(req, { registry }, signal);
      return;
    }
  }
  deps.budget?.start(started);

  // 1 · Understand
  yield { type: "stage", stage: "understand", status: "active" };
  const classification = await deps.classifier.classify(req);
  await deps.pace(650, signal);
  yield { type: "stage", stage: "understand", status: "done", detail: classification.rationale };

  // 2 · Select intelligence (cost-aware routing)
  yield { type: "stage", stage: "select", status: "active" };
  // Debate (BETA, debate.ts): a bounded panel (2 models on Free, 3 on paid plans) that argues in rounds. Not with Deep Research or images.
  const deepAsked = Boolean(req.modes?.deepResearch);
  const debateTier = req.plan === "free" || deps.registry?.freeOnly ? "free" : "paid";
  const debateAsked = Boolean(req.modes?.debate) && !deepAsked && !hasMedia(req.media);
  let debateSkip = req.modes?.debate && !debateAsked ? (deepAsked ? "Debate doesn't run together with Deep Research, so this was answered normally." : "Debate doesn't support images yet, so this was answered normally.") : "";
  const debateModels = Math.min(req.routing?.maxModels ?? debatePolicy(debateTier).models, debatePolicy(debateTier).models);
  const routeReq = debateAsked && debateModels >= 2 ? { ...req, routing: { ...req.routing, strategy: "thorough" as const, maxModels: debateModels } } : req;
  let plan: RoutingPlan;
  try {
    plan = deps.router.route(classification, routeReq);
  } catch (e) {
    // Media attached but no routable model can see it (e.g. no free vision model left): say so, send nothing.
    if (e instanceof NoVisionModelError) {
      yield { type: "error", code: "bad_request", message: e.message, retryable: false };
      return;
    }
    throw e;
  }
  // Deep Research is checked against its typical-run estimate (plans.ts) up front,
  // so a run never starts that the allowance can't cover.
  const deep = deepAsked;
  if (deep && req.plan && !PLAN_ALLOWANCES[req.plan].deepResearch) {
    yield { type: "error", code: "plan_required", message: "Deep Research is available on Plus and up.", retryable: false };
    return;
  }
  // Live Research (live-request.ts): the pages were read on the person's desktop, which also checks the answer's citations. No server search
  // runs for it (retrieval checks, Verified answers), so nothing is searched or paid for twice and no "not checked against the web" note is added.
  const liveResearch = req.liveResearch;
  // Retrieval (flag off by default) adds a conservative search estimate to the check.
  const retrieve = !liveResearch && Boolean(deps.retriever) && retrievalApplies(req, plan);
  const retrievalUnits = retrieve ? Math.ceil(retrievalEstimateUsd(plan) / USD_PER_UNIT) : 0;
  let plannedUnits = (deep ? Math.max(plan.estimate.units, DEEP_RESEARCH_UNITS) : plan.estimate.units) + retrievalUnits;

  // Verified answers (BETA, sourcing.ts): factual questions on paid plans get their key claims searched on the web after the answer is written.
  // Free never runs it (it would spend the shared request pool); a check that doesn't fit the allowance or the per-request cap is skipped, never a refusal.
  const gate: ReturnType<typeof sourcingGate> = liveResearch ? { run: false } : sourcingGate({ plan: req.plan, classification, req, hasRetriever: Boolean(deps.retriever) });
  let sourcing: Sourcing | undefined = gate.run ? undefined : gate.sourcing;
  let sourcingOn = false;
  if (gate.run) {
    const extraUsd = retrievalEstimateUsd(plan);
    const extraUnits = Math.ceil(extraUsd / USD_PER_UNIT);
    const fitsCap = !req.limits || !overRequestCap(plan.estimate.usd + extraUsd, req.limits, deep);
    const fitsAllowance = plannedUnits + extraUnits <= (req.computeRemaining ?? Infinity);
    if (fitsCap && fitsAllowance) { sourcingOn = true; plannedUnits += extraUnits; } else sourcing = budgetSkipped();
  }

  // Deep Research (research.ts): a live web research phase before the panel, when web search is on (paid plans, retriever with
  // research, not Sensitive) and its estimate fits the per-request cap and the allowance. Otherwise the run says why no pages were read.
  let researchOn = false;
  let researchOff = "";
  if (deep) {
    if (!deps.retriever?.research || !req.plan || req.plan === "free") researchOff = OFF_NOT_ENABLED;
    else if (req.routing?.tier === "sensitive") researchOff = OFF_SENSITIVE;
    else {
      const extraUsd = researchEstimateUsd(plan);
      const extraUnits = Math.ceil(extraUsd / USD_PER_UNIT);
      const fitsCap = !req.limits || !overRequestCap(plan.estimate.usd + extraUsd, req.limits, deep);
      if (fitsCap && plannedUnits + extraUnits <= (req.computeRemaining ?? Infinity)) { researchOn = true; plannedUnits += extraUnits; } else researchOff = OFF_BUDGET;
    }
  }
  const rstep = (step: ResearchStepId, status: "active" | "done" | "skipped", detail?: string): KeplarEvent[] => (deep ? [{ type: "research", research: { phase: "step", step, status, ...(detail ? { detail } : {}) } }] : []);

  // Debate: rounds re-send the panel, so the estimate grows by debateCostFactor (3 rounds = 3.5x the panel). If the full debate would pass the
  // per-request cap, try fewer rounds; if even 2 rounds don't fit (or fewer than 2 models are available), answer normally and say why.
  let debateRounds = 0;
  if (debateAsked) {
    const panelUsd = plan.estimate.breakdown.filter((b) => b.slot === "panel").reduce((a, b) => a + b.usd, 0);
    const panelUnits = Math.ceil(panelUsd / USD_PER_UNIT);
    if (plan.mode !== "consensus" || plan.panel.length < 2) {
      debateSkip = freeOnlyRun(deps, req)
        ? "Only one free model was available right now, so this was answered without a debate (and counted as a normal question)."
        : "Only one model was available for this question, so it was answered without a debate.";
    } else {
      for (let r = debatePolicy(debateTier).rounds; r >= 2 && !debateRounds; r--) {
        const extraUsd = panelUsd * (debateCostFactor(r) - 1);
        const extraUnits = Math.ceil(panelUnits * (debateCostFactor(r) - 1));
        const fitsCap = !req.limits || !overRequestCap(plan.estimate.usd + extraUsd, req.limits, deep);
        if (fitsCap && plannedUnits + extraUnits <= (req.computeRemaining ?? Infinity)) { debateRounds = r; plannedUnits += extraUnits; }
      }
      if (!debateRounds) debateSkip = "A debate wouldn't fit this question's cost limit or your remaining usage, so it was answered normally.";
    }
  }
  if (req.modes?.debate && debateSkip) yield { type: "debate", debate: { phase: "skipped", reason: debateSkip } };

  // Per-request cost cap (limits.ts): one question can never cost more than the plan allows.
  if (req.limits && overRequestCap(plan.estimate.usd, req.limits, deep)) {
    yield { type: "error", code: "bad_request", message: REQUEST_TOO_BIG, retryable: false };
    return;
  }
  // extraUnits: work a caller (Keplar Core) budgeted around this pipeline, kept so a stop mid-run still bills it.
  if (deps.run) deps.run.plannedUnits = (deps.run.extraUnits ?? 0) + Math.ceil(plannedUnits * METER_MARGIN);

  const remaining = req.computeRemaining ?? Infinity;
  if (plannedUnits > remaining) {
    await deps.pace(400, signal);
    yield { type: "limit", required: plannedUnits, remaining };
    return;
  }

  yield { type: "capabilities", items: classification.capabilities, mode: plan.mode, modelCount: plan.panel.length };
  await deps.pace(450 + classification.capabilities.length * 190, signal);
  yield {
    type: "stage",
    stage: "select",
    status: "done",
    detail: plan.mode === "single" ? "Selected one model" : `Selected ${plan.panel.length} intelligences`,
  };

  const registry = deps.registry ?? createRegistry(deps.providers);

  // Deep Research: plan → search → read, streamed. The pages and notes go to the panel and the writer as context; they cite pages as [n].
  let research: ResearchSummary | undefined;
  let researchEvidence: Map<number, string[]> | undefined;
  let researchUsd = 0;
  if (deep) {
    if (researchOn && deps.retriever?.research) {
      if (deps.run) deps.run.started = true;
      const out = yield* runResearch({ registry, retriever: deps.retriever, req, plan, classification, signal });
      researchEvidence = out.evidence;
      researchUsd = out.costUsd;
      research = out.summary;
      if (out.brief) req = { ...req, memory: out.brief + (req.memory ?? "") };
    } else {
      yield { type: "research", research: { phase: "off", reason: researchOff } };
      research = { queries: [], sources: [], cited: [], off: researchOff };
    }
    if (deps.synthesizer instanceof ModelSynthesizer) deps.synthesizer.research = research.sources.length > 0;
  } else if (liveResearch) {
    // The brief is already in req.memory (the route put it there before classifying); the writer gets the citation rules.
    research = liveResearchSummary(liveResearch);
    if (deps.synthesizer instanceof ModelSynthesizer) { deps.synthesizer.research = true; deps.synthesizer.researchRules = LIVE_RESEARCH_RULES; }
  }

  // 3 · Run the panel in parallel, reporting each model as it lands.
  const multi = plan.mode === "consensus";
  if (debateRounds) yield { type: "stage", stage: "debate", status: "active" };
  else if (multi) yield { type: "stage", stage: "compare", status: "active" };
  else yield { type: "stage", stage: "synthesize", status: "active" };

  const tier = req.routing?.tier ?? "standard";
  // Shared latency budget (live): one panel-wide abort, re-armed earlier once a quorum has answered.
  const budget = deps.budget ?? null;
  // A how-to gets a full step-by-step guide (answer-shape.ts): more words from every model, so more time (the route allows 300 s).
  const guide = !hasMedia(req.media) && classification.errorProne !== "exact" && isGuideRequest(req.prompt);
  if (guide) budget?.atLeast(GUIDE_BUDGET_MS);
  const panelCtl = budget ? new AbortController() : null;
  let panelTimer: ReturnType<typeof setTimeout> | undefined;
  const arm = (at: number) => {
    if (!panelCtl) return;
    clearTimeout(panelTimer);
    panelTimer = setTimeout(() => panelCtl.abort(), Math.max(0, at - Date.now()));
  };
  if (budget) arm(budget.panelDeadline());
  const panelSignal = panelCtl ? (signal ? AbortSignal.any([signal, panelCtl.signal]) : panelCtl.signal) : signal;
  const live = Boolean(budget);
  // Model fallbacks (Free plan) never put two seats on the same model.
  const seatModels = new Set(plan.panel.map((p) => p.model.id));
  // Media: panel seats are vision models (router); the images ride along on panel calls only.
  const media = hasMedia(req.media) ? req.media : null;
  // Question screenshots (BETA, image-question.ts): an image sent alone or with "solve this" gets the answer-first protocol; the vision
  // models decide whether it really is a question. Set here, server-side only (parseMedia never copies it from a request).
  if (media) media.question = imageQuestionMode(req) === "auto";
  // The composer's stand-in "Describe this image." is not the person's words: the models read a neutral line instead (the chat keeps the original).
  if (media?.question && isImageOnlyPrompt(req.prompt)) req = { ...req, prompt: IMAGE_ONLY_PROMPT };
  const vision = media ? { images: media.images, imagePreamble: visionPreamble(media) } : {};
  if (deps.run) deps.run.started = true;
  // A verified result for counting / arithmetic questions (computed by code), given to every model as a fact.
  const exact = exactCheck(req.prompt);
  // The shape of a good answer to a comparison, a how-to, an explanation or a piece of writing (see answer-shape.ts); nothing for quick facts, code or exact checks.
  const shape = media?.question ? "" : shapeHint(req.prompt, classification);
  // A quiz or flashcards request: the panel returns one keplar-quiz fence. No early draft (the card shows a skeleton).
  const practice = media?.question ? null : quizAsk(req.prompt);
  // Same panel call: a ranking, comparison, timeline, or how-to may append one keplar-ui block. Not a second request.
  const rich = practice || media?.question || classification.kind === "code" || classification.errorProne === "exact" ? "" : richHint(req.prompt);
  const quizNote = practice ? `\n\n${quizPanelHint(req)}` : "";
  const panelPrompt = (req.memory ?? "") + req.prompt + (exact ? exactNote(exact) : "") + (rich ? `\n\n${rich}` : "") + quizNote;
  const shapeBlock = practice ? "" : [shape, rich].filter(Boolean).join("\n\n");
  // Live Research: every panel model reads the brief and cites it, because with one model (fast depth, Free) its text is the answer itself.
  const panelSystem = practice
    ? `${systemPrompt()}\n\n${QUIZ_PANEL_RULES}`
    : liveResearch ? `${systemPrompt()}\n\n${LIVE_RESEARCH_RULES}${shapeBlock ? `\n\n${shapeBlock}` : ""}` : shapeBlock ? `${systemPrompt()}\n\n${shapeBlock}` : undefined;
  const seatParams = (model: Parameters<typeof sanitizeParams>[0], index: number) => sanitizeParams(model, practice ? QUIZ_PANEL_PARAMS : live ? livePanelParams(classification, req.modes?.reason, guide) : paramsFor("panel", index));
  // Real token streaming: the first panel model to speak is shown word by word while the rest of the panel, the review and the synthesis work.
  // Quizzes skip it: the screen says it is building the quiz, and the checked quiz replaces that, never a markdown draft.
  const liveEvents: KeplarEvent[] = [];
  let wakeLoop: (() => void) | null = null;
  let leaderModelId: string | undefined;
  const early = earlyStream((text) => { if (practice) return; liveEvents.push({ type: "delta", text }); wakeLoop?.(); }, { prompt: req.prompt });
  // Stand-in requests only while the shared Free pool is comfortable (pool-governor.ts): each one is a request against the key's limit.
  // Debate: the rounds run here, before the normal pipeline; the final round's answers become the panel results below.
  let debateResults: ProviderResult[] | null = null;
  let debateSummary: DebateSummary | undefined;
  let debateExtraUsd = 0;
  if (debateRounds) {
    const baseUnits = deps.run?.extraUnits ?? 0;
    const perRound = deps.run ? (deps.run.plannedUnits - baseUnits) / debateCostFactor(debateRounds) : 0;
    const outcome = yield* runDebate({
      registry,
      models: plan.panel.map((p) => p.model),
      question: req.prompt + (exact ? exactNote(exact) : ""),
      context: req.memory ?? "",
      system: debaterSystem(systemPrompt()),
      classification,
      rounds: debateRounds,
      tier,
      live,
      signal,
      // A stopped debate is charged for the rounds that were started, not the full plan.
      onRound: (round) => { if (deps.run) deps.run.plannedUnits = baseUnits + Math.ceil(perRound * debateCostFactor(round)); },
      estimateUsd: (id) => plan.estimate.breakdown.find((b) => b.slot === "panel" && b.modelId === id)?.usd ?? 0,
    });
    debateResults = outcome.results;
    debateSummary = outcome.summary;
    outcome.results.forEach((r, i) => {
      const served = (r as ProviderResult & { model?: RoutingPlan["panel"][number]["model"] }).model;
      if (r.ok && served && served.id !== plan.panel[i].model.id) plan.panel[i] = { ...plan.panel[i], model: served, reason: `Stood in for ${plan.panel[i].model.name}, which was busy or unavailable.` };
      // Billed cost of seats whose model isn't in the routing estimate (a substitute) would otherwise be missed below.
      if (r.ok && !plan.estimate.breakdown.some((b) => b.slot === "panel" && b.modelId === r.modelId)) debateExtraUsd += r.actualCostUsd ?? 0;
    });
    yield { type: "stage", stage: "debate", status: "done", detail: `${outcome.roundsRun} rounds · ${outcome.summary.changed} changed position` };
    yield { type: "stage", stage: "compare", status: "active" };
    // The latency budget restarts for the review and synthesis: the debate is long by design.
    budget?.start();
  }
  const hedgeOn = !debateRounds && live && multi && registry.freeOnly && !media && (registry.pool?.hedgesAllowed() ?? true);
  const hedgeStarts: Array<(() => boolean) | null> = plan.panel.map(() => null);
  const seats = (debateRounds ? [] : plan.panel).map((p, i) => new Promise<ProviderResult>((resolve, reject) => {
    let done = false;
    let hedgeEnded = false;
    let origFail: ProviderResult | null = null;
    let hedgeRunning = false;
    const origCtl = new AbortController();
    const finish = (r: ProviderResult) => { if (!done) { done = true; resolve(r); } };
    registry
      .generate({ model: p.model, prompt: panelPrompt, system: panelSystem, classification, params: seatParams(p.model, i), tier, slot: "panel", signal: AbortSignal.any([panelSignal ?? origCtl.signal, origCtl.signal]), avoid: seatModels, onToken: practice ? undefined : early.tokens(i), ...vision })
      .then((r): ProviderResult => {
        // A substitute answered (the planned model was busy or missing): show the model that actually answered.
        if (r.ok && r.fellBackFrom && r.model.id !== p.model.id && !done) {
          plan.panel[i] = { ...p, model: r.model, reason: `Stood in for ${p.model.name}, which was busy or unavailable.` };
        }
        return r;
      })
      .catch((e: unknown): ProviderResult => {
        if (budget && isBudgetAbort(e, signal)) {
          return { ok: false, modelId: p.model.id, reason: "timeout", message: "Didn't answer within the shared latency budget.", latencyMs: budget.elapsed() };
        }
        if (e instanceof DOMException && e.name === "AbortError") {
          if (origCtl.signal.aborted && !panelSignal?.aborted) return { ok: false, modelId: p.model.id, reason: "timeout", message: "Stopped: another model took this seat.", latencyMs: 0 };
          throw e;
        }
        return { ok: false, modelId: p.model.id, reason: "error", message: e instanceof Error ? e.message : "Provider error.", latencyMs: 0 };
      })
      .then((r) => {
        if (r.ok) finish(r);
        else { origFail = r; if (!hedgeRunning || hedgeEnded) finish(r); }
      }, (e) => { if (!done) { done = true; reject(e); } });
    if (!hedgeOn) return;
    // Start a stand-in for this seat (once). Returns false when there is nothing to start.
    hedgeStarts[i] = () => {
      if (done || hedgeRunning) return false;
      const alt = registry.substitute(p.model, seatModels, false);
      if (!alt) return false;
      hedgeRunning = true;
      seatModels.add(alt.id);
      registry
        .generate({ model: alt, prompt: panelPrompt, system: panelSystem, classification, params: seatParams(alt, i), tier, slot: "panel", signal: panelSignal, avoid: seatModels })
        .then((r) => {
          if (r.ok && !done) {
            plan.panel[i] = { ...p, model: r.model, reason: `Stood in for ${p.model.name}, which was slow to answer.` };
            origCtl.abort();
            finish(r);
          } else { hedgeEnded = true; if (!done && origFail) finish(origFail); }
        })
        .catch(() => { hedgeEnded = true; if (!done && origFail) finish(origFail); });
      return true;
    };
  }));
  let results: ProviderResult[] = debateResults ?? [];
  if (debateResults && multi) {
    for (const [i, r] of debateResults.entries()) {
      const m = plan.panel[i].model;
      yield r.ok ? { type: "model", modelId: m.id, name: m.name, status: "responded" } : { type: "model", modelId: m.id, name: m.name, status: r.reason === "refusal" ? "refused" : "failed", note: r.message };
    }
  }
  const queue = new Map(seats.map((pr, i) => [i, pr.then((r) => ({ i, r }))]));
  let hedgeUntil = 0;
  let hedgeTimer: ReturnType<typeof setTimeout> | undefined;
  const armPanel = (at: number) => arm(Math.max(at, hedgeUntil));
  while (queue.size) {
    while (liveEvents.length) yield liveEvents.shift()!;
    const won = await Promise.race([...queue.values(), new Promise<null>((res) => { wakeLoop = () => res(null); })]);
    wakeLoop = null;
    if (!won) continue;
    const { i, r } = won;
    queue.delete(i);
    results.push(r);
    if (r.ok) { early.complete(i, r.text); if (early.started && early.leader === i) leaderModelId = r.modelId; while (liveEvents.length) yield liveEvents.shift()!; }
    if (hedgeOn && r.ok && !hedgeTimer && queue.size && budget) {
      // First answer in: a seat still silent after a pause relative to this answer gets a stand-in model.
      const wait = Math.max(hedgeTuning.minMs, budget.elapsed() * hedgeTuning.factor);
      hedgeTimer = setTimeout(() => {
        let started = 0;
        for (const start of hedgeStarts) if (start?.()) started++;
        if (started && budget) {
          // With two answers already in, the stand-in only gets the normal straggler grace; waiting out the whole window for a third is what made 3-model answers 15-25 s.
          if (results.filter((x) => x.ok).length < 2) {
            hedgeUntil = Math.min(budget.panelDeadline(), Date.now() + hedgeTuning.windowMs);
            arm(hedgeUntil);
          }
        }
      }, wait);
    }
    if (budget && queue.size) armPanel(budget.stragglerDeadline(results.filter((x) => x.ok).length, plan.panel.length));
    const m = plan.panel[i].model;
    if (multi) {
      yield r.ok
        ? { type: "model", modelId: m.id, name: m.name, status: "responded", ...(plan.panel[i].reason?.startsWith("Stood in") ? { note: plan.panel[i].reason } : {}) }
        : { type: "model", modelId: m.id, name: m.name, status: r.reason === "refusal" ? "refused" : "failed", note: r.message };
    }
  }
  clearTimeout(hedgeTimer);
  while (liveEvents.length) yield liveEvents.shift()!;

  clearTimeout(panelTimer);

  if (deps.run) deps.run.responded = results.filter((r) => r.ok).length;
  if (results.every((r) => !r.ok)) {
    // Every seat failed, timed out, was rate-limited or came back empty: friendly message, never billed.
    if (deps.run) deps.run.noResponse = true;
    if (results.every((r) => !r.ok && r.message === NOT_SET_UP)) {
      yield { type: "error", code: "unavailable", message: "Keplar isn't connected to its models yet. Please check back soon.", retryable: false };
      return;
    }
    // Every answer that did arrive failed the quality gate (degenerate output): say so plainly instead of showing junk.
    if (results.some((r) => !r.ok && r.message === QUALITY_FAIL_MESSAGE)) {
      yield noResponseEvent(req.plan, UNRELIABLE_MESSAGE);
      return;
    }
    // Free + images and the free vision models are all busy: keep the specific vision wording.
    const visionBusy = media && registry.freeOnly && results.some((r) => !r.ok && (r.reason === "rate_limited" || r.message === FREE_BUSY_MESSAGE));
    yield noResponseEvent(req.plan, visionBusy ? NO_FREE_VISION_MESSAGE : undefined);
    return;
  }

  // Optional net for single-model answers: a different free model checks the reply is coherent; one retry on another model if not.
  if (!multi && sanityEnabled() && live) {
    const first = results.find((r) => r.ok);
    if (first && first.ok && first.text.length >= 40 && (await sanityCheck(registry, { question: req.prompt, answer: first.text, answeredBy: plan.panel[0].model.id, signal })) === "bad") {
      const again = await registry.generate({ model: plan.panel[0].model, prompt: panelPrompt, system: panelSystem, classification, params: seatParams(plan.panel[0].model, 0), tier, slot: "panel", signal, avoid: new Set([plan.panel[0].model.id, ...seatModels]) });
      const second = again.ok && again.model.id !== plan.panel[0].model.id ? await sanityCheck(registry, { question: req.prompt, answer: again.text, answeredBy: again.model.id, signal }) : "bad";
      if (again.ok && second !== "bad") {
        plan.panel[0] = { ...plan.panel[0], model: again.model, reason: "Replaced the first model after a coherence check." };
        results = [again];
      } else {
        if (deps.run) deps.run.noResponse = true;
        yield noResponseEvent(req.plan, UNRELIABLE_MESSAGE);
        return;
      }
    }
  }

  // The reviewer reads the responses themselves, so it does not have to wait for the position extraction or a written draft. On the Free plan
  // (where an extra call costs $0) it starts now, alongside the extraction: two sequential waits become one. Paid plans keep the draft-first order.
  const mergedFree = live && multi && registry.freeOnly && Boolean(deps.mergedReview) && deps.synthesizer instanceof ModelSynthesizer;
  const parallelReview = !mergedFree && live && multi && registry.freeOnly && deps.synthesizer instanceof ModelSynthesizer && deps.synthesizer.draftless && Boolean(deps.responseClassifier);
  const reviewCtl = new AbortController();
  const runVerify = async (draftText: string, cmp: Awaited<ReturnType<Comparator["compare"]>>): Promise<Awaited<ReturnType<Verifier["verify"]>>> => {
    try {
      // Free: the check may take 14 s at most, and once the extraction is done it is waited for 4 s more (below), so a slow free model cannot hold the answer.
      const reviewMs = budget ? (parallelReview ? Math.min(budget.stageMs(0.45), 14_000) : budget.stageMs(0.45)) : 0;
      const reviewSignal = budget ? AbortSignal.any([LatencyBudget.signal(reviewMs, signal), reviewCtl.signal]) : signal;
      return await deps.verifier.verify({ req, results, comparison: cmp, plan, classification, draft: draftText, signal: reviewSignal });
    } catch (e) {
      if (!budget || !isBudgetAbort(e, signal)) throw e;
      // The review ran out of time: say so, never "all clear".
      return { mode: "cross-model", checks: [], disputed: [], checked: 0, supported: 0, removed: [], notes: ["The reviewer didn't finish within the latency budget, so this answer wasn't cross-checked."] };
    }
  };
  const earlyReview = parallelReview ? runVerify("", await deps.comparator.compare(results, classification)) : null;
  earlyReview?.catch(() => { /* surfaced when awaited below */ });

  // Live: classify each free-text response into a position + claims (declines become missing votes).
  let classifyNote: string | undefined;
  let mergedVerification: Awaited<ReturnType<Verifier["verify"]>> | null = null;
  if (mergedFree && deps.mergedReview && deps.synthesizer instanceof ModelSynthesizer) {
    // Free: ONE request classifies the answers, reviews them and writes the final answer (free-merged.ts); nothing else is sent.
    const m = await deps.mergedReview.run({ req, results, classification, signal });
    results = m.results;
    mergedVerification = m.verification;
    deps.synthesizer.summaries = m.summaries;
    deps.synthesizer.topic = m.topic ?? "";
    deps.synthesizer.prewritten = m.written;
    deps.synthesizer.spentUsd += deps.mergedReview.spentUsd;
  } else if (multi && deps.responseClassifier) {
    const c = await deps.responseClassifier.classify({ req, results, classification, signal });
    results = c.results;
    classifyNote = c.note;
    if (deps.synthesizer instanceof ModelSynthesizer && deps.responseClassifier instanceof ModelResponseClassifier) {
      deps.synthesizer.summaries = deps.responseClassifier.summaries;
      deps.synthesizer.topic = deps.responseClassifier.topic;
      if (classifyNote) deps.synthesizer.notes.push(classifyNote);
    }
  }

  let comparison = await deps.comparator.compare(results, classification);

  if (multi) {
    await deps.pace(500, signal);
    yield { type: "stage", stage: "compare", status: "done", detail: `Compared ${results.filter((r) => r.ok).length} responses` };

    // 4 · Disagreement (only when present)
    if (comparison.disagree > 0) {
      yield { type: "stage", stage: "disagree", status: "active" };
      yield {
        type: "disagreement",
        summary:
          comparison.positions.length > 2
            ? `${comparison.positions.length} different positions.`
            : `${comparison.agree} agree. ${comparison.disagree} ${comparison.disagree === 1 ? "doesn't" : "don't"}.`,
      };
      await deps.pace(1100, signal);
      yield { type: "stage", stage: "disagree", status: "done", detail: "Keplar investigated why" };
    }

    // 5 · Verify (and judge, if the panel disagreed)
    yield { type: "stage", stage: "verify", status: "active" };
    yield* rstep("check", "active");
  }

  // The reviewer checks a draft synthesis against the individual responses.
  const draft = multi && !mergedVerification && deps.synthesizer.draft ? await deps.synthesizer.draft({ req, plan, results, comparison, signal }) : "";
  if (earlyReview) {
    // The extraction is done. The reviewer ran alongside it; it gets 4 s more, then the answer goes on without it (and says it was not cross-checked).
    let lateTimer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<"late">((res) => { lateTimer = setTimeout(() => res("late"), 4_000); });
    if ((await Promise.race([earlyReview.then(() => "done" as const, () => "done" as const), late])) === "late") reviewCtl.abort();
    clearTimeout(lateTimer);
  }
  let verification: Awaited<ReturnType<Verifier["verify"]>> = mergedVerification ?? (earlyReview ? await earlyReview : await runVerify(draft, comparison));

  // Live: map the reviewer's "removed" findings onto the extracted claims they concern,
  // so evidence weighting (comparator.finalize) reflects what didn't hold up.
  if (budget && verification.checks.some((c) => c.outcome === "removed")) {
    const removed = removedClaims(results, verification.checks.filter((c) => c.outcome === "removed").map((c) => `${c.finding} ${c.resolution}`));
    if (removed.length) verification = { ...verification, removed: [...verification.removed, ...removed] };
  }

  // Optional: web-check only the claims still disputed. Never runs when the flag is off.
  let retrievalUsd = 0;
  // Bounded like the sourcing stage: a slow search leaves the claims disputed rather than holding the answer (45 s × 3 retries otherwise).
  if (retrieve && deps.retriever && verification.disputed.length) {
    try {
      const guard = signal ? AbortSignal.any([signal, AbortSignal.timeout(WEB_CHECK_MS)]) : AbortSignal.timeout(WEB_CHECK_MS);
      const web = await deps.retriever.check({ req, claims: verification.disputed, plan, signal: guard });
      retrievalUsd = web.costUsd;
      verification = { ...verification, checks: [...verification.checks, ...web.checks] };
    } catch {
      if (signal?.aborted) throw new Error("aborted");
    }
  }
  comparison = deps.comparator.finalize(comparison, verification, results);

  if (multi) {
    const n = verification.checks.filter((c) => c.kind !== "web").length;
    yield {
      type: "stage",
      stage: "verify",
      status: "done",
      detail: verification.mode === "not-needed" ? "Not needed" : n ? `Reviewed the draft · ${n} ${n === 1 ? "issue" : "issues"} resolved` : "Reviewed the draft · no issues found",
    };
    yield* rstep("check", "done", verification.mode === "not-needed" ? "Not needed" : n ? `${n} ${n === 1 ? "issue" : "issues"} resolved across the models` : "The models' answers were cross-checked · no issues found");
    yield { type: "stage", stage: "synthesize", status: "active" };
  } else yield* rstep("check", "skipped", "One model answered, so there was nothing to cross-check");
  yield* rstep("write", "active");

  // 6 · Synthesize one answer, streamed.
  const deltas: string[] = [];
  let flush: (() => void) | null = null;
  const synth = deps.synthesizer
    .synthesize({ req, classification, plan, results, comparison, verification, preferredModelId: leaderModelId, signal, onDelta: (t) => { deltas.push(t); flush?.(); } })
    .finally(() => flush?.());
  let done = false;
  let answerBody: Awaited<typeof synth> | null = null;
  synth.then((a) => { answerBody = a; done = true; flush?.(); }, () => { done = true; flush?.(); });
  // Words already streamed live from the leading model are on screen; the written answer then replaces them (the final `answer` event).
  // Sending the synthesis' chunks too would append a second copy to the early text.
  while (!done || deltas.length) {
    if (!deltas.length) await new Promise<void>((r) => (flush = r));
    flush = null;
    while (deltas.length) { const d = deltas.shift()!; if (!early.started && !practice) yield { type: "delta", text: d }; }
  }
  const body = answerBody ?? (await synth);
  // Deep Research: keep only [n] markers that point at a page that was really read (none at all when no page was read).
  if (research) {
    const linked = linkCitations(body.markdown ?? "", research.sources);
    body.markdown = linked.markdown;
    research = { ...research, cited: linked.cited };
    // Server Deep Research: label each cited statement by whether its page backs it (Live Research is checked on the desktop).
    if (researchEvidence && linked.cited.length) research = { ...research, check: checkCitations(linked.markdown, research.sources, researchEvidence) };
  }
  if (research?.sources.length) {
    // Pages were really read for this answer: the "web retrieval isn't live" and "no sources cited" notes no longer hold.
    body.sources = body.sources.filter((x) => x.title !== "Web search" && x.title !== "No sources cited");
  }

  // Verified answers (BETA): search the web for the answer's key claims. A failed or slow search never blocks the answer.
  let sourcingUsd = 0;
  if (sourcingOn && deps.retriever && !signal?.aborted && (body.markdown ?? "").trim().length > 40) {
    try {
      const guard = signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000);
      const r = await runSourcing({ retriever: deps.retriever, req, plan, markdown: body.markdown, signal: guard });
      sourcing = r.sourcing;
      sourcingUsd = r.costUsd;
    } catch {
      if (signal?.aborted) throw new Error("aborted");
      sourcing = { state: "no_sources", note: "The source search didn't finish in time, so no page confirms this answer.", claims: [] };
    }
    if (sourcing && sourcing.state !== "budget") body.sources = body.sources.filter((x) => x.title !== "Web search");
  }

  // Cost: record what providers actually billed (e.g. OpenRouter usage.cost)
  // and fall back to catalog estimates only where no actual figure exists.
  // The judge only counts if it ran; failed calls count nothing.
  const usd =
    plan.estimate.breakdown
      .filter((b) => !b.conditional || verification.reviewer?.role === "judge")
      .reduce((a, b) => {
        // Review calls: billed cost when a live provider reported it, else the estimate.
        if (b.slot !== "panel") {
          if (verification.costUsd !== undefined || verification.mode === "not-needed") return a;
          // Only the reviewer that actually ran is counted.
          return b.slot === verification.reviewer?.role ? a + b.usd : a;
        }
        const r = results.find((x) => x.modelId === b.modelId);
        if (!r || !r.ok) return a;
        return a + (r.actualCostUsd ?? b.usd);
      }, 0) +
    (verification.costUsd ?? 0) +
    retrievalUsd +
    researchUsd +
    sourcingUsd +
    debateExtraUsd +
    // Live extraction and judge-tier synthesis calls (billed cost).
    (deps.responseClassifier?.spentUsd ?? 0) +
    (deps.synthesizer.spentUsd ?? 0);
  // Deep Research is metered at the plan-config estimate unless providers reported billed cost.
  const billed = results.some((r) => r.ok && r.actualCostUsd != null);
  // Charged at cost plus the safety margin (limits.ts), never less than one unit.
  const units = deep && !billed ? Math.max(toUnits(usd * METER_MARGIN), DEEP_RESEARCH_UNITS) : toUnits(usd * METER_MARGIN);
  // Final-empty path: the models answered but nothing usable came out. Say so, bill nothing.
  if (isEmptyAnswer({ markdown: body.markdown ?? "", consensus: { responded: results.filter((r) => r.ok).length } })) {
    if (deps.run) deps.run.noResponse = true;
    yield noResponseEvent(req.plan);
    return;
  }
  if (deps.run) deps.run.settled = true;

  yield { type: "stage", stage: "synthesize", status: "done" };
  yield* rstep("write", "done", research?.sources.length ? `${research.cited.length} of ${research.sources.length} pages cited` : undefined);

  // Counting / arithmetic was computed by code and given to the models as a verified fact: say so, plainly.
  // A question read from an image: say it was read by vision models (uneven), so the person checks it read the question right.
  if (media?.question && answeredAsQuestion(body.markdown ?? "")) body.sources = [QUESTION_IMAGE_NOTE, ...body.sources.filter((x) => x.title !== "No sources cited")];
  if (exact) {
    body.sources = [{ kind: "note", title: "Exact check", detail: `${exact.statement} Computed by Keplar's own code, not by a model, and given to the models.` }, ...body.sources.filter((x) => x.title !== "No sources cited")];
  }
  const answer: KeplarAnswer = {
    ...body,
    id: `ans_${started.toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    capabilities: classification.capabilities,
    // Only units and level leave the server; USD and per-model cost stay internal.
    compute: { units, level: computeLevel(units) },
    durationMs: Date.now() - started,
  };
  if (sourcing) answer.sourcing = signSourcing(answer.id, sourcing);
  if (debateSummary) answer.debate = debateSummary;
  if (research) answer.research = research;
  yield { type: "answer", answer };
}
