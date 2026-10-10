/** Everything /admin/learning shows, read from the store. No prompt text beyond the redacted, consented failure cases. */
import { MIN_ARM_TURNS, MIN_CATEGORY_TURNS, mean, ucb } from "./bandit";
import { activeBoost } from "./active";
import { meanScore, WINDOW_DAYS } from "./pipeline";
import { armRows, caseRows, getState, listPolicies, outcomes } from "./repo";
import type { CaseRow, PolicyRow, StateRow } from "./types";

export type ScoreRow = { tier: string; category: string; ready: boolean; turns: number; models: { modelId: string; turns: number; quality: number; avgLatencyMs: number; avgUnits: number; boost: number; breaker: boolean; collecting: boolean }[] };
export type VersionRow = { version: number; turns: number; score: number | null };
export type Dashboard = {
  state: StateRow;
  policies: PolicyRow[];
  scoreboards: ScoreRow[];
  versions: VersionRow[];
  baselineScore: { turns: number; score: number | null };
  totals: { turns: number; withFeedback: number; failures: number; windowDays: number };
  feedback: Record<string, number>;
  cases: { total: number; byReason: Record<string, number>; byCategory: Record<string, number>; recent: Pick<CaseRow, "at" | "tier" | "category" | "reason" | "text">[] };
  thresholds: { minArmTurns: number; minCategoryTurns: number };
};

/** A model is "tripped" when it has been failing most of the time on a question type (the router already ranks it last). */
const breakerTripped = (good: number, bad: number, turns: number) => turns >= MIN_ARM_TURNS && bad / Math.max(1, good + bad) >= 0.5;

export async function loadDashboard(at = new Date()): Promise<Dashboard> {
  const since = new Date(at.getTime() - WINDOW_DAYS * 864e5).toISOString();
  const [state, policies, arms, rows, cases] = await Promise.all([
    getState(),
    listPolicies(),
    armRows().listSystem(),
    outcomes().listSystemRange({ field: "at", gte: since }, 20_000),
    caseRows().listSystemRange({ field: "at", gte: since }, 2_000).catch(() => []),
  ]);
  const groups = new Map<string, typeof arms>();
  for (const a of arms) groups.set(`${a.tier}|${a.category}`, [...(groups.get(`${a.tier}|${a.category}`) ?? []), a]);
  const scoreboards: ScoreRow[] = [...groups.entries()]
    .map(([k, list]) => {
      const [tier, category] = k.split("|");
      const turns = list.reduce((n, a) => n + a.turns, 0);
      const ready = turns >= MIN_CATEGORY_TURNS && list.filter((a) => a.turns >= MIN_ARM_TURNS).length >= 2;
      const all = list.reduce((e, a) => ({ good: e.good + a.good, bad: e.bad + a.bad }), { good: 0, bad: 0 });
      const pooled = all.good + all.bad > 0 ? all.good / (all.good + all.bad) : 0.5;
      return {
        tier,
        category,
        ready,
        turns,
        models: list
          .map((a) => ({
            modelId: a.modelId,
            turns: a.turns,
            quality: Math.round(mean(a, pooled) * 1000) / 1000,
            avgLatencyMs: a.turns ? Math.round(a.latencySumMs / a.turns) : 0,
            avgUnits: a.turns ? Math.round((a.unitsSum / a.turns) * 10) / 10 : 0,
            boost: Math.round(activeBoost(tier as "free" | "paid", category, a.modelId) * 1000) / 1000,
            breaker: breakerTripped(a.good, a.bad, a.turns),
            collecting: a.turns < MIN_ARM_TURNS,
            _u: ucb(a, pooled),
          }))
          .sort((x, y) => y._u - x._u)
          .map(({ _u, ...m }) => (void _u, m)),
      };
    })
    .sort((a, b) => b.turns - a.turns);

  const byVersion = new Map<number, typeof rows>();
  for (const o of rows) byVersion.set(o.policyVersion, [...(byVersion.get(o.policyVersion) ?? []), o]);
  const versions: VersionRow[] = [...byVersion.entries()]
    .filter(([v]) => v > 0)
    .map(([version, list]) => ({ version, turns: list.length, score: meanScore(list) }))
    .sort((a, b) => b.version - a.version);
  const base = byVersion.get(0) ?? [];
  const feedback: Record<string, number> = {};
  let withFeedback = 0;
  for (const o of rows) {
    const n = Object.values(o.fb ?? {}).reduce((s, x) => s + (x ?? 0), 0);
    if (n) withFeedback++;
    for (const [k, v] of Object.entries(o.fb ?? {})) feedback[k] = (feedback[k] ?? 0) + (v ?? 0);
  }
  const byReason: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  for (const c of cases) {
    byReason[c.reason] = (byReason[c.reason] ?? 0) + 1;
    byCategory[c.category] = (byCategory[c.category] ?? 0) + 1;
  }
  return {
    state,
    policies,
    scoreboards,
    versions,
    baselineScore: { turns: base.length, score: meanScore(base) },
    totals: { turns: rows.length, withFeedback, failures: rows.filter((o) => o.status === "no_response").length, windowDays: WINDOW_DAYS },
    feedback,
    cases: {
      total: cases.length,
      byReason,
      byCategory,
      recent: cases
        .filter((c) => c.text)
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 15)
        .map(({ at: when, tier, category, reason, text }) => ({ at: when, tier, category, reason, text })),
    },
    thresholds: { minArmTurns: MIN_ARM_TURNS, minCategoryTurns: MIN_CATEGORY_TURNS },
  };
}
