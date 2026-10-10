/**
 * Background continuation for hard problems. When a Thorough / Exhaustive run reaches its time limit for one request with
 * work left (steps not done, or the answer not yet passing review), the work is saved here (signed-in people only, in their
 * own workspace) and the answer card offers "Keep working". Each continuation is one bounded slice that resumes from the
 * saved steps; the client polls for the result, and the daily cron finishes any job whose slices were left running.
 * Jobs expire after 7 days and are deleted with the account.
 */
import { collection } from "@/lib/create/platform/store";
import { id as newId, now } from "@/lib/create/platform/ids";
import { engineDeps } from "@/lib/orchestration/orchestrator";
import { HeuristicClassifier } from "@/lib/orchestration/classifier";
import { budgetFor, passScore } from "./config";
import { confidence } from "./confidence";
import { publicStep, refine, solve, insights, type EngineCtx, type PlannedStep } from "./engine";
import { CoreBudget } from "./llm";
import { coreModels } from "./models";
import { activeSafe, pick } from "./selfdev/variants";
import type { PausedWork } from "./run";
import type { CoreCheck, CoreEvent, CoreSummary } from "./types";

export type CoreJob = PausedWork & {
  id: string;
  workspaceId: string;
  status: "paused" | "running" | "done" | "failed";
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  slices: number;
  /** A slice holds the lease while it runs, so two continuations never work on one job at once. */
  leaseUntil?: string;
  checks: CoreCheck[];
  /** The person asked Keplar to keep going until done (slices continue on polls and the daily cron). */
  keepGoing?: boolean;
  result?: { markdown: string; core: CoreSummary };
  error?: string;
};

export const jobRows = () => collection<CoreJob>("core_jobs");
const WEEK = 7 * 24 * 3600_000;

export async function saveJob(workspaceId: string, w: PausedWork): Promise<string> {
  const id = newId("cj");
  await jobRows().insert({ ...w, id, workspaceId, status: "paused", createdAt: now(), updatedAt: now(), expiresAt: new Date(Date.now() + WEEK).toISOString(), slices: 0, checks: [], steps: w.steps.map((s) => ({ ...s, work: s.work?.slice(0, 4000) })) });
  return id;
}

export async function getJob(workspaceId: string, id: string): Promise<CoreJob | null> {
  const j = await jobRows().get(workspaceId, id);
  if (!j) return null;
  if (Date.parse(j.expiresAt) < Date.now()) { await jobRows().remove(workspaceId, id).catch(() => undefined); return null; }
  return j;
}

/** The person-facing view (no scratch work). */
export function jobView(j: CoreJob) {
  return { id: j.id, status: j.status, slices: j.slices, steps: j.steps.map(publicStep), usedCalls: j.usedCalls, ...(j.result ? { result: j.result } : {}), ...(j.error ? { error: j.error } : {}) };
}

/** Takes the lease (or says another slice is running). */
async function lease(j: CoreJob, ms: number): Promise<boolean> {
  if (j.leaseUntil && Date.parse(j.leaseUntil) > Date.now()) return false;
  await jobRows().update(j.workspaceId, j.id, { leaseUntil: new Date(Date.now() + ms + 15_000).toISOString(), status: "running", updatedAt: now() });
  return true;
}

/**
 * Runs one slice of a job. Returns the updated job. Stops at the job's total limits (jobMs / jobCalls), not at a step count.
 * `emit` receives progress events (the streaming endpoint forwards them).
 */
export async function runSlice(j: CoreJob, opts: { emit?: (e: CoreEvent) => void; signal?: AbortSignal; onUsd?: (usd: number) => void } = {}): Promise<CoreJob> {
  const limit = budgetFor(j.plan, j.depth);
  const msLeft = Math.max(0, limit.jobMs - j.usedMs);
  const callsLeft = Math.max(0, limit.jobCalls - Math.max(0, j.usedCalls - limit.calls));
  if (msLeft < 10_000 || callsLeft < 1) {
    await jobRows().update(j.workspaceId, j.id, { status: "done", updatedAt: now(), result: j.result ?? finalOf(j, j.markdown, null, "budget") });
    return (await getJob(j.workspaceId, j.id)) ?? j;
  }
  const sliceMs = Math.min(limit.ms, msLeft);
  if (!(await lease(j, sliceMs))) return j;
  const deps = engineDeps({ keyTier: j.plan === "free" ? "free" : "paid" });
  const models = deps?.registry ? coreModels(deps.registry) : null;
  if (!deps?.registry || !models) {
    await jobRows().update(j.workspaceId, j.id, { status: "failed", error: "Keplar's models aren't available right now.", leaseUntil: undefined, updatedAt: now() });
    return (await getJob(j.workspaceId, j.id)) ?? j;
  }
  const budget = new CoreBudget({ ...limit, calls: Math.min(limit.calls, callsLeft), ms: sliceMs });
  const classification = new HeuristicClassifier().classify({ prompt: j.prompt, plan: j.plan as never });
  const picked = pick(await activeSafe(), `${j.id}:${j.slices}`);
  const ctx: EngineCtx = { req: { prompt: j.prompt, plan: j.plan as never }, context: j.context, registry: deps.registry, models, budget, classification, picked, retriever: deps.retriever, routingPlan: null, emit: opts.emit ?? (() => undefined), signal: opts.signal, stepTokens: limit.stepTokens };
  try {
    let steps: PlannedStep[] = j.steps;
    let checks = j.checks;
    const open = steps.some((s) => s.status !== "done" && s.status !== "revised");
    if (open) {
      const solved = await solve(ctx, j.needs, steps);
      steps = solved.steps;
      checks = [...checks, ...solved.checks];
    }
    const r = await refine(ctx, j.markdown, steps, picked.params.passScore ?? passScore());
    checks = [...checks, ...r.checks];
    opts.onUsd?.(budget.usd);
    const usedCalls = j.usedCalls + budget.calls;
    const usedMs = j.usedMs + budget.elapsed();
    const stillOpen = steps.some((s) => s.status !== "done" && s.status !== "revised") || (r.score !== null && r.score < (picked.params.passScore ?? passScore()));
    const outOfRoom = usedMs >= limit.jobMs - 10_000 || usedCalls - limit.calls >= limit.jobCalls;
    const doneNow = !stillOpen || outOfRoom || budget.stopped === "pool";
    const next: Partial<CoreJob> = { steps, checks: checks.slice(-30), markdown: r.markdown, usedCalls, usedMs, slices: j.slices + 1, leaseUntil: undefined, updatedAt: now(), status: doneNow ? "done" : j.keepGoing ? "running" : "paused" };
    if (doneNow) {
      const fin = finalOf({ ...j, ...next } as CoreJob, r.markdown, r.score, stillOpen ? (budget.stopped ?? "budget") : "criterion");
      if (budget.canSpend(6_000)) {
        const ins = await insights(ctx, r.markdown).catch(() => ({ nextSteps: [] as string[], clarify: undefined }));
        if (ins.nextSteps.length) fin.core.nextSteps = ins.nextSteps;
        if (ins.clarify) fin.core.clarify = ins.clarify;
      }
      next.result = fin;
    }
    await jobRows().update(j.workspaceId, j.id, next);
  } catch (e) {
    await jobRows().update(j.workspaceId, j.id, { status: "paused", leaseUntil: undefined, updatedAt: now(), error: e instanceof Error && e.name === "AbortError" ? undefined : "A slice failed; it can be resumed." });
  }
  return (await getJob(j.workspaceId, j.id)) ?? j;
}

function finalOf(j: CoreJob, markdown: string, score: number | null, stoppedBy: CoreSummary["stoppedBy"]): { markdown: string; core: CoreSummary } {
  const failed = j.steps.filter((s) => s.status === "failed").length;
  const conf = confidence({ checks: j.checks, criticScore: score, stepsFailed: failed, stoppedBy });
  return { markdown, core: { depth: j.depth, asked: j.depth, reason: "Kept working in the background until the checks passed or the plan's limit was reached.", steps: j.steps.map(publicStep), rounds: j.slices, checks: j.checks.slice(-16), confidence: conf, use: { calls: j.usedCalls, callLimit: budgetFor(j.plan, j.depth).calls + budgetFor(j.plan, j.depth).jobCalls, ms: j.usedMs, msLimit: budgetFor(j.plan, j.depth).jobMs }, stoppedBy, job: { id: j.id, status: "done" } } };
}

/** Cron: continue jobs whose last slice ended (status running with an expired lease, or paused but asked to keep going). */
export async function sweepJobs(maxJobs = 5, deadlineMs = 90_000, hooks: { may?: (j: CoreJob) => Promise<boolean>; charge?: (j: CoreJob, usd: number) => Promise<unknown> } = {}): Promise<{ ran: number; expired: number }> {
  const started = Date.now();
  const all = await jobRows().listSystem();
  let expired = 0;
  for (const j of all) if (Date.parse(j.expiresAt) < Date.now()) { await jobRows().remove(j.workspaceId, j.id).catch(() => undefined); expired++; }
  const due = all.filter((j) => j.status === "running" && (!j.leaseUntil || Date.parse(j.leaseUntil) < Date.now()) && Date.parse(j.expiresAt) >= Date.now()).slice(0, maxJobs);
  let ran = 0;
  for (const j of due) {
    if (Date.now() - started > deadlineMs) break;
    if (hooks.may && !(await hooks.may(j).catch(() => false))) continue;
    await jobRows().update(j.workspaceId, j.id, { leaseUntil: undefined });
    let usd = 0;
    await runSlice({ ...j, leaseUntil: undefined }, { onUsd: (u) => { usd = u; } });
    if (usd > 0) await hooks.charge?.(j, usd).catch(() => undefined);
    ran++;
  }
  return { ran, expired };
}
