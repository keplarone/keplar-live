/**
 * Keplar Core operational guardrails. These are the ONLY limits on how far Core reasons: there is no fixed step count.
 * The loop runs plan → execute → critique → revise until its quality bar is met, and stops early only when one of these
 * real limits is reached. Every number is explicit, per plan and depth, and can be overridden without a code change:
 *
 *   KEPLAR_CORE_OFF=1                 kill switch: Core is skipped entirely, Ask runs exactly as before
 *   KEPLAR_CORE_BUDGETS='{"free":{"exhaustive":{"calls":40}}}'   JSON patch over the table below
 *   KEPLAR_CORE_PASS_SCORE=8          critic score (0-10) an answer must reach to stop the loop
 *
 * Free = OpenRouter `:free` models only (enforced in the registry, not here), with a generous but finite request budget
 * because every Free request comes out of one shared key.
 */
import type { ResolvedDepth } from "./types";

export type CorePlan = "free" | "lite" | "plus" | "pro" | "business";

export type DepthBudget = {
  /** Model requests Core may add on top of the normal answer (planner, steps, critiques, revisions, insights). */
  calls: number;
  /** Wall-clock time for this request before Core pauses and offers to keep working in the background. */
  ms: number;
  /** Total wall-clock time across background slices. */
  jobMs: number;
  /** Total model requests across background slices (on top of `calls`). */
  jobCalls: number;
  /** Extra provider USD Core may spend (paid plans; Free spends $0). Also capped by the plan's per-request limit. */
  usd: number;
  /** Max output tokens for one step. */
  stepTokens: number;
};

const B = (calls: number, ms: number, jobMs: number, usd: number, stepTokens: number, jobCalls = calls * 2): DepthBudget => ({ calls, ms, jobMs, jobCalls, usd, stepTokens });

/** Quick never adds Core calls: it is the existing fast path, unchanged. */
const QUICK = B(0, 0, 0, 0, 0);

export const DEFAULT_BUDGETS: Record<CorePlan, Record<ResolvedDepth, DepthBudget>> = {
  free: { quick: QUICK, thorough: B(14, 90_000, 4 * 60_000, 0, 1800, 20), exhaustive: B(32, 150_000, 12 * 60_000, 0, 2400, 48) },
  lite: { quick: QUICK, thorough: B(18, 90_000, 6 * 60_000, 0.05, 2200), exhaustive: B(44, 160_000, 20 * 60_000, 0.2, 3000) },
  plus: { quick: QUICK, thorough: B(24, 100_000, 10 * 60_000, 0.1, 2600), exhaustive: B(64, 170_000, 30 * 60_000, 0.5, 4000) },
  pro: { quick: QUICK, thorough: B(30, 110_000, 15 * 60_000, 0.2, 3200), exhaustive: B(96, 180_000, 60 * 60_000, 1.2, 6000) },
  business: { quick: QUICK, thorough: B(30, 110_000, 15 * 60_000, 0.2, 3200), exhaustive: B(120, 180_000, 90 * 60_000, 2, 6000) },
};

/** A safety net, not a design limit: stops a pathological loop that keeps "revising" without spending (e.g. all checks local). */
export const MAX_ROUNDS_SAFETY = 50;

function overrides(): Partial<Record<CorePlan, Partial<Record<ResolvedDepth, Partial<DepthBudget>>>>> {
  const raw = process.env.KEPLAR_CORE_BUDGETS;
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

export function budgetFor(plan: string | undefined, depth: ResolvedDepth): DepthBudget {
  const p = (plan && plan in DEFAULT_BUDGETS ? plan : "free") as CorePlan;
  const base = DEFAULT_BUDGETS[p][depth];
  const o = overrides()[p]?.[depth] ?? {};
  return {
    calls: Math.round(num(o.calls, 0, 1000, base.calls)),
    ms: num(o.ms, 0, 290_000, base.ms), // a request can never outlive the function (route maxDuration 300 s)
    jobMs: num(o.jobMs, 0, 24 * 3600_000, base.jobMs),
    jobCalls: Math.round(num(o.jobCalls, 0, 5000, base.jobCalls)),
    usd: p === "free" ? 0 : num(o.usd, 0, 50, base.usd),
    stepTokens: Math.round(num(o.stepTokens, 256, 32_000, base.stepTokens)),
  };
}

export function coreDisabledByEnv(): boolean {
  return process.env.KEPLAR_CORE_OFF === "1";
}

export function passScore(): number {
  return num(Number(process.env.KEPLAR_CORE_PASS_SCORE), 1, 10, 8);
}

/** Plain-language description of the limits, shown in docs and on the admin page. */
export function describeBudget(b: DepthBudget): string {
  if (!b.calls) return "No extra steps (the normal fast answer).";
  return `Up to ${b.calls} extra model requests and ${Math.round(b.ms / 1000)} s in this request; it can keep working in the background for up to ${Math.round(b.jobMs / 60_000)} min${b.usd ? `, within $${b.usd.toFixed(2)} of extra model cost` : ""}.`;
}
