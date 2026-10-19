/**
 * Keplar Core in the Ask pipeline. Wraps the existing engine (orchestrate) without changing it:
 *
 *   quick       the existing fast path, byte for byte (plus a CPU-only long-context block for very long threads). When
 *               "auto" picked quick but the answer comes back low-confidence (the models disagreed, or the reviewer removed
 *               claims), Core escalates: it critiques and revises that answer before showing it.
 *   thorough /  plan → specialist steps with tools → check each step (by running code or an independent model) → revise
 *   exhaustive  until it passes → re-plan around failures → the normal multi-model answer, written from the verified notes →
 *               final critique and revision until it passes → proactive next steps. Only the plan's explicit budget, the
 *               request's time limit (then it can keep working in the background), the Free pool or the person stopping
 *               it end the loop early.
 */
import { orchestrate, type Deps } from "@/lib/orchestration/orchestrator";
import { isSmallTalk } from "@/lib/orchestration/smalltalk";
import { isSupportRequest } from "@/lib/orchestration/support";
import { toUnits, computeLevel, USD_PER_UNIT } from "@/lib/orchestration/compute";
import { METER_MARGIN } from "@/lib/orchestration/limits";
import type { KeplarAnswer, KeplarEvent, KeplarRequest } from "@/lib/orchestration/types";
import { assess, coreApplies, depthOf, type Assessment } from "./assess";
import { budgetFor, coreDisabledByEnv, passScore } from "./config";
import { confidence } from "./confidence";
import { insights, publicStep, refine, solve, type EngineCtx, type PlannedStep } from "./engine";
import { CoreBudget } from "./llm";
import { coreModels } from "./models";
import { workedNotes } from "./prompts";
import { groundingFor } from "./retrieval";
import { activeSafe, peekKilled, pick, type Picked } from "./selfdev/variants";
import type { CoreCheck, CoreEvent, CoreSummary, ResolvedDepth, StopReason } from "./types";

export type CoreRunOpts = {
  workspaceId?: string;
  anonymous?: boolean;
  /** Keep work running after the response (next/server `after`). */
  defer?: (p: Promise<unknown>) => void;
  /** Called once with the turn's outcome, for the learning loop. */
  onTurn?: (t: CoreTurn) => void;
  /** Signed in: save paused work so it can continue in the background. Returns the job id. */
  saveJob?: (j: PausedWork) => Promise<string | null>;
  /** Per-person preference learned from feedback: -1 shorter .. 1 more detail. Read only on the deep path (never delays quick answers). */
  brevity?: () => Promise<number>;
  /** Evals: run with these variants instead of the live champion/canary pick. */
  forcePicked?: Picked;
};

export type CoreTurn = { answer: KeplarAnswer; assessment: Assessment; depth: ResolvedDepth; escalated: boolean; picked: Picked; criticScore: number | null; calls: number; stoppedBy: StopReason; checksFailed: number; latencyMs: number };

export type PausedWork = { prompt: string; context: string; depth: ResolvedDepth; plan: string | undefined; steps: PlannedStep[]; markdown: string; answerId: string; usedCalls: number; usedMs: number; needs: { math: boolean; code: boolean }; kind: string };

/** A low-confidence answer that "auto" should check before showing (only facts from the run, never guesses). */
export function needsEscalation(a: KeplarAnswer): boolean {
  if (a.smalltalk || !a.markdown || a.markdown.length < 80) return false;
  if (a.consensus.level === "none") return true;
  const removed = a.verification.checks.filter((c) => c.outcome === "removed" || c.outcome === "contradicted").length;
  return removed >= 2 || (a.consensus.level === "partial" && removed >= 1);
}

/** Async queue so the engine's callback events can be yielded while its promise runs. */
function channel<T>() {
  const items: T[] = [];
  let wake: (() => void) | null = null;
  return {
    push(x: T) { items.push(x); wake?.(); },
    async *drain<R>(p: Promise<R>): AsyncGenerator<T, R> {
      let done = false;
      let value: R | undefined;
      let error: unknown;
      p.then((v) => { value = v; done = true; wake?.(); }, (e) => { error = e; done = true; wake?.(); });
      while (!done || items.length) {
        if (!items.length) await new Promise<void>((r) => { wake = r; });
        wake = null;
        while (items.length) yield items.shift()!;
      }
      if (error) throw error;
      return value as R;
    },
  };
}

const coreEvent = (core: CoreEvent): KeplarEvent => ({ type: "core", core });

function lightSummary(a: Assessment, answer: KeplarAnswer, extra: Partial<CoreSummary> = {}): CoreSummary {
  const conf = confidence({ consensus: answer.consensus, verification: answer.verification, checks: extra.checks ?? [], criticScore: null, stepsFailed: 0, stoppedBy: "not-needed" });
  return { depth: "quick", asked: a.asked, reason: a.reason, steps: [], rounds: 0, checks: [], confidence: conf, use: { calls: 0, callLimit: 0, ms: 0, msLimit: 0 }, stoppedBy: "not-needed", ...extra };
}

function addUnits(answer: KeplarAnswer, usd: number, free: boolean): KeplarAnswer {
  if (free || usd <= 0) return answer;
  const units = answer.compute.units + Math.max(0, toUnits(usd * METER_MARGIN) - 1);
  return { ...answer, compute: { units, level: computeLevel(units) } };
}

export async function* runCore(req: KeplarRequest, deps: Deps, signal?: AbortSignal, opts: CoreRunOpts = {}): AsyncGenerator<KeplarEvent> {
  const started = Date.now();
  const registry = deps.registry;
  if (coreDisabledByEnv() || peekKilled() || !registry || !coreApplies(req) || isSmallTalk(req) || isSupportRequest(req) || req.understanding?.intent === "playful") {
    yield* orchestrate(req, deps, signal);
    return;
  }
  const asked = depthOf((req.routing as { depth?: unknown } | undefined)?.depth);
  const a = assess(req, asked);
  const free = req.plan === "free" || Boolean(registry.freeOnly);

  // Long threads and long documents: bring back the passages that matter (CPU only, no model, so the fast path stays fast).
  let grounding: CoreSummary["grounding"];
  try {
    // Free requests may carry only public pages and transcripts; file text never goes to free hosts.
    const docs = free ? req.docs?.filter((d) => d.source === "link" || d.source === "transcript") : req.docs;
    const g = await groundingFor({ prompt: req.prompt, history: req.history, docs, budgetChars: 12_000 });
    if (g.block) { req = { ...req, memory: g.block + (req.memory ?? "The question:\n") }; grounding = { passages: g.passages, summarized: g.summarized }; }
  } catch { /* grounding is optional */ }

  let depth: ResolvedDepth = a.depth;
  let reason = a.reason;
  // Media questions keep the vision panel; Core's steps can't see pixels. A deep request still gets the final review below.
  const media = Boolean(req.media?.images?.length);
  // Free: every request comes out of one shared key. Deep work only while that pool is comfortable; otherwise answer directly and say why.
  if (depth !== "quick" && free) {
    try {
      const pool = (registry as { pool?: { planFor(n: number): Promise<{ mode: string; status: { level: string } }> } | null }).pool;
      const pp = pool ? await pool.planFor(budgetFor(req.plan, depth).calls) : null;
      if (pp && (pp.mode !== "full" || pp.status.level !== "normal")) { depth = "quick"; reason = "Free capacity is limited right now, so this was answered directly instead of step by step. Try Thorough again in a few minutes."; }
    } catch { /* pool status unavailable: carry on */ }
  }
  const set = depth === "quick" ? null : await activeSafe();
  if (set?.state.killed) { yield* orchestrate(req, deps, signal); return; }
  const picked = opts.forcePicked ?? pick(set, `${started}:${req.prompt.length}:${req.prompt.slice(0, 40)}`);
  const models = coreModels(registry);

  /* ─────────────── quick: the existing pipeline, unchanged ─────────────── */
  if (depth === "quick" || !models) {
    let held: KeplarAnswer | null = null;
    for await (const ev of orchestrate(req, deps, signal)) {
      if (ev.type !== "answer") { yield ev; continue; }
      held = ev.answer;
      if (held.smalltalk) { yield ev; return; }
      if (asked === "auto" && models && needsEscalation(held) && !media) break; // escalate below
      const answer = { ...held, core: lightSummary(a, held, { reason, ...(grounding ? { grounding } : {}) }) };
      yield { type: "answer", answer };
      opts.onTurn?.({ answer, assessment: a, depth: "quick", escalated: false, picked, criticScore: null, calls: 0, stoppedBy: "not-needed", checksFailed: 0, latencyMs: Date.now() - started });
      // Paid plans, non-trivial questions: proactive next steps arrive after the answer (they never delay it).
      if (!free && models && a.difficulty >= 0.2 && !signal?.aborted) {
        const budget = new CoreBudget({ ...budgetFor(req.plan, "thorough"), calls: 1, ms: 20_000 });
        const ctx = engineCtx(req, deps, models, budget, a, picked, () => undefined, signal, 600);
        const ins = await insights(ctx, answer.markdown).catch((): { nextSteps: string[]; clarify?: string } => ({ nextSteps: [] }));
        if (ins.nextSteps.length || ins.clarify) yield coreEvent({ phase: "insight", nextSteps: ins.nextSteps, ...(ins.clarify ? { clarify: ins.clarify } : {}) });
      }
      return;
    }
    if (!held || !models) return;
    // Escalation: the quick answer came back low-confidence, so it is critiqued and revised before it is shown.
    depth = "thorough";
    const budget = new CoreBudget(budgetFor(req.plan, "thorough"), extraUsdCap(req));
    // The panel's answer is held back, not delivered: a stop during the revision still bills the panel plus the revision budget.
    if (!free) holdForCore(deps, coreUnits(budget));
    yield coreEvent({ phase: "route", depth, asked, reason: "The models didn't agree on this, so Keplar checked and revised the answer before showing it.", escalated: true });
    const ch = channel<KeplarEvent>();
    const ctx = engineCtx(req, deps, models, budget, a, picked, (e) => ch.push(coreEvent(e)), signal);
    const r = yield* ch.drain(refine(ctx, held.markdown, [], picked.params.passScore ?? passScore()));
    yield* finish({ req, deps, a, picked, ctx, budget, base: held, markdown: r.markdown, steps: [], checks: r.checks, criticScore: r.score, rounds: r.rounds, depth, escalated: true, reason: "The models didn't agree on this, so Keplar checked and revised the answer before showing it.", started, free, grounding, opts, complete: true });
    return;
  }

  /* ─────────────── thorough / exhaustive ─────────────── */
  const budget = new CoreBudget(budgetFor(req.plan, depth), extraUsdCap(req));
  // Core's own steps are paid calls before the pipeline runs: a stop during them bills the planned Core budget.
  if (!free && deps.run) { const units = coreUnits(budget); deps.run.extraUnits = units; deps.run.plannedUnits += units; if (!media) deps.run.started = true; }
  yield coreEvent({ phase: "route", depth, asked, reason, ...(asked === "auto" ? { escalated: true } : {}) });
  const brevity = opts.brevity ? await opts.brevity().catch(() => 0) : 0;
  if (brevity <= -0.3 || brevity >= 0.3) req = { ...req, memory: `${brevity < 0 ? "This person has preferred shorter answers: keep it tight." : "This person has liked fuller, detailed answers."}\n\n${req.memory ?? "The question:\n"}` };
  const ch = channel<KeplarEvent>();
  const ctx = engineCtx(req, deps, models, budget, a, picked, (e) => ch.push(coreEvent(e)), signal);
  const solved = media ? { steps: [] as PlannedStep[], checks: [] as CoreCheck[], rounds: 0, complete: true } : yield* ch.drain(solve(ctx, a.needs));
  // The normal multi-model answer, written from the verified working notes.
  const notes = workedNotes(solved.steps);
  const req2: KeplarRequest = { ...req, memory: notes + (req.memory ?? "The question:\n"), ...(depth === "exhaustive" && (req.routing?.maxModels ?? 6) > 1 ? { routing: { ...req.routing, strategy: "thorough" as const } } : {}) };
  let held: KeplarAnswer | null = null;
  for await (const ev of orchestrate(req2, deps, signal)) {
    if (ev.type === "answer") { held = ev.answer; break; }
    yield ev;
  }
  if (!held) return; // an error / limit / no-response event was already passed through
  if (!free) holdForCore(deps, 0);
  let markdown = held.markdown;
  let checks = solved.checks;
  let criticScore: number | null = null;
  let rounds = solved.rounds;
  if (!held.smalltalk && budget.canSpend(10_000)) {
    const r = yield* ch.drain(refine({ ...ctx, req: req2, context: req2.memory + req2.prompt }, markdown, solved.steps, picked.params.passScore ?? passScore()));
    markdown = r.markdown;
    checks = [...checks, ...r.checks];
    criticScore = r.score;
    rounds += r.rounds;
  }
  yield* finish({ req: req2, deps, a, picked, ctx, budget, base: held, markdown, steps: solved.steps, checks, criticScore, rounds, depth, escalated: asked === "auto", reason, started, free, grounding, opts, complete: solved.complete });
}

const coreUnits = (budget: CoreBudget) => Math.ceil((budget.limit.usd || 0) / USD_PER_UNIT);

/**
 * orchestrate() marks the run settled when its answer is ready, but Core holds that answer back to revise it, so nothing has been
 * billed yet: reopen settlement (the route then bills the planned units on a stop or crash) and add any further Core budget.
 */
function holdForCore(deps: Deps, units: number): void {
  if (!deps.run) return;
  deps.run.settled = false;
  deps.run.started = true;
  deps.run.plannedUnits += units;
}

function extraUsdCap(req: KeplarRequest): number {
  const remaining = req.computeRemaining;
  const byAllowance = typeof remaining === "number" && Number.isFinite(remaining) ? Math.max(0, (remaining - 60) * USD_PER_UNIT) : Infinity;
  const byRequest = req.limits ? Math.max(0, req.limits.maxRequestUsd * 0.6) : Infinity;
  return Math.min(byAllowance, byRequest);
}

function engineCtx(req: KeplarRequest, deps: Deps, models: NonNullable<ReturnType<typeof coreModels>>, budget: CoreBudget, a: Assessment, picked: Picked, emit: (e: CoreEvent) => void, signal?: AbortSignal, stepTokens?: number): EngineCtx {
  let routingPlan = null;
  try { routingPlan = deps.retriever?.research ? deps.router.route(a.classification, req) : null; } catch { routingPlan = null; }
  return { req, context: (req.memory ?? "") + req.prompt, registry: deps.registry!, models, budget, classification: a.classification, picked, retriever: deps.retriever, routingPlan, emit, signal, stepTokens: stepTokens ?? budget.limit.stepTokens };
}

async function* finish(i: {
  req: KeplarRequest; deps: Deps; a: Assessment; picked: Picked; ctx: EngineCtx; budget: CoreBudget; base: KeplarAnswer; markdown: string; steps: PlannedStep[]; checks: CoreCheck[]; criticScore: number | null; rounds: number; depth: ResolvedDepth; escalated: boolean; reason: string; started: number; free: boolean; grounding?: CoreSummary["grounding"]; opts: CoreRunOpts; complete: boolean;
}): AsyncGenerator<KeplarEvent> {
  const { budget } = i;
  const stoppedBy: StopReason = budget.stopped ?? (i.complete ? "criterion" : "budget");
  const stepsFailed = i.steps.filter((s) => s.status === "failed").length;
  let job: CoreSummary["job"];
  const unfinished = !i.complete || (i.criticScore !== null && i.criticScore < (i.picked.params.passScore ?? passScore()));
  if (stoppedBy === "time" && unfinished && i.opts.saveJob && !i.opts.anonymous) {
    const id = await i.opts.saveJob({ prompt: i.req.prompt, context: i.ctx.context, depth: i.depth, plan: i.req.plan, steps: i.steps, markdown: i.markdown, answerId: i.base.id, usedCalls: budget.calls, usedMs: budget.elapsed(), needs: i.a.needs, kind: i.a.classification.kind }).catch(() => null);
    if (id) job = { id, status: "paused" };
  }
  const calibration = (await activeSafe())?.state.calibration;
  const conf = confidence({ consensus: i.base.consensus, verification: i.base.verification, checks: i.checks, criticScore: i.criticScore, stepsFailed, stoppedBy, calibration });
  const core: CoreSummary = {
    depth: i.depth, asked: i.a.asked, ...(i.escalated ? { escalated: true } : {}), reason: i.reason,
    steps: i.steps.map(publicStep), rounds: i.rounds, checks: dedupeChecks(i.checks), confidence: conf,
    use: budget.use(), stoppedBy, ...(job ? { job } : {}), ...(i.grounding ? { grounding: i.grounding } : {}),
  };
  yield coreEvent({ phase: "budget", use: budget.use(), stoppedBy, ...(job ? { job } : {}) });
  // Insights cost one more request; they are asked for after the answer is out, so they never delay it. Their (small) cost is
  // already inside the plan's budget; on paid plans it is metered with the answer as an estimate of one short call.
  const insightUsd = i.free ? 0 : 0.0004;
  const answer = addUnits({ ...i.base, markdown: i.markdown, core, durationMs: Date.now() - i.started }, budget.usd + (budget.canSpend(8_000) ? insightUsd : 0), i.free);
  yield { type: "answer", answer };
  if (budget.canSpend(8_000) && !i.ctx.signal?.aborted) {
    const ins = await insights(i.ctx, i.markdown).catch(() => ({ nextSteps: [] as string[], clarify: undefined }));
    if (ins.nextSteps.length || ins.clarify) {
      core.nextSteps = ins.nextSteps;
      if (ins.clarify) core.clarify = ins.clarify;
      yield coreEvent({ phase: "insight", nextSteps: ins.nextSteps, ...(ins.clarify ? { clarify: ins.clarify } : {}) });
    }
  }
  i.opts.onTurn?.({ answer, assessment: i.a, depth: i.depth, escalated: i.escalated, picked: i.picked, criticScore: i.criticScore, calls: budget.calls, stoppedBy, checksFailed: i.checks.filter((c) => c.outcome === "failed").length, latencyMs: Date.now() - i.started });
}

function dedupeChecks(checks: CoreCheck[]): CoreCheck[] {
  const seen = new Set<string>();
  return checks.filter((c) => { const k = `${c.kind}:${c.label}:${c.outcome}`; if (seen.has(k)) return false; seen.add(k); return true; }).slice(-16);
}
