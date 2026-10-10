/**
 * Multi-model fan-out control. Pure policy, shared by the route and the tests.
 *
 *  - Per plan, per UTC day: only `dailyFanoutRuns` questions get a full panel (3+ models). After that the plan still answers,
 *    but with at most 2 models (fast strategy). Free is already limited to free models, FREE_MAX_PANEL and its daily question count.
 *  - Under load: when this instance is running `loadHigh`+ answers at once, new ones use at most 2 models; at `loadCritical`+, 1.
 *  - The global spend breaker (breaker-routing.ts) is applied separately and the strictest cap wins.
 * Degrading is never silent to the person: the answer card lists the models actually consulted.
 */
import type { RoutingPreferences } from "./types";
import { limitsFor, type LimitPlan } from "./limits";

export type FanoutReason = "daily_fanout" | "load" | null;
export type FanoutPolicy = { maxModels: number | null; fast: boolean; reason: FanoutReason };

export const loadThresholds = (env: Record<string, string | undefined> = process.env) => {
  const n = (k: string, d: number) => (Number.isFinite(Number(env[k])) && Number(env[k]) > 0 ? Math.floor(Number(env[k])) : d);
  return { high: n("KEPLAR_LOAD_HIGH", 30), critical: n("KEPLAR_LOAD_CRITICAL", 80) };
};

export function fanoutPolicy(i: { plan: LimitPlan; usedToday: number; loadInflight: number; admin?: boolean; env?: Record<string, string | undefined> }): FanoutPolicy {
  const t = loadThresholds(i.env);
  if (i.loadInflight >= t.critical) return { maxModels: 1, fast: true, reason: "load" };
  if (i.loadInflight >= t.high) return { maxModels: 2, fast: true, reason: "load" };
  if (!i.admin && i.plan !== "free" && i.usedToday >= limitsFor(i.plan).dailyFanoutRuns) return { maxModels: 2, fast: true, reason: "daily_fanout" };
  return { maxModels: null, fast: false, reason: null };
}

/** Applies the policy on top of the person's own routing preferences (their stricter limit is kept). */
export function applyFanout(routing: RoutingPreferences | undefined, p: FanoutPolicy): RoutingPreferences | undefined {
  if (p.maxModels === null) return routing;
  return { ...(routing ?? {}), strategy: "fast", maxModels: Math.min(routing?.maxModels ?? 6, p.maxModels) };
}

/* ── load: answers running on this instance ── */
let active = 0;
export const loadInflight = () => active;
/** Call when a metered answer starts; call the returned function exactly once when it ends. */
export function beginRun(): () => void {
  active++;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    active = Math.max(0, active - 1);
  };
}
