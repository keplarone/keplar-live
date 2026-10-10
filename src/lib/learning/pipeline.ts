/**
 * The nightly self-improvement run (Vercel Cron, once a day on the Hobby plan). Steps:
 *   1  read the last 30 days of content-free outcomes and the consented, redacted failure cases
 *   2  circuit breaker: if the active policy is doing clearly worse than before it, roll it back
 *   3  split outcomes into training and held-out sets; learn per-model multipliers from the training set (Bayesian, bounded)
 *   4  run the eval prompts and the failure cases through the real router under the current policy and the candidate
 *   5  promote automatically only if: every guard check passes, no question type got worse, it wins more than it loses on the
 *      held-out evidence, and it is not noticeably more expensive. A large change waits for an admin instead.
 * It can only produce a new router policy (policy.ts). It cannot touch code, secrets, billing, prompts or the fixed guards.
 */
import { now } from "@/lib/create/platform/ids";
import { boostsFor, FEEDBACK_EVIDENCE, MIN_CATEGORY_TURNS, POLICY_SPAN, seatEvidence, toDelta, turnScore, type Evidence } from "./bandit";
import { boostOf, diffBoosts, keyOf, sizeOf, validateBoosts } from "./policy";
import { caseRows, getPolicy, getState, listPolicies, nextVersion, outcomes, patchPolicy, policyRows, saveState, savePolicy, signalRows, SYSTEM } from "./repo";
import { itemsFrom, runSuite, type Pooled, type Rosters, type SuiteResult } from "./suite";
import type { ArmRow, Boosts, FeedbackKind, OutcomeRow, PolicyEvidence, PolicyRow, StateRow } from "./types";

export const WINDOW_DAYS = 30;
export const KEEP_DAYS = 45;
export const MIN_HOLDOUT = 30;
export const MIN_GAIN = 0.003;
/** The breaker trips when a policy's turns score this much below the turns before it (needs MIN_BREAKER turns on each side). */
export const BREAKER_DROP = 0.05;
export const MIN_BREAKER = 100;

export type EvalCase = { id: string; prompt: string; expect: { guard?: "human" | "conscious" } };
export type RunInput = { rosters: Rosters; evalSet: readonly EvalCase[]; at?: Date; dryRun?: boolean };
export type RunSummary = {
  ran: boolean;
  skipped?: string;
  outcomes: number;
  holdout: number;
  cases: number;
  breaker?: string;
  candidate?: { version: number; status: PolicyRow["status"]; size: "small" | "large"; changes: number; note: string };
};

/** Stable 0..4 bucket of a turn key: 0 = held out for evaluation. */
export const bucketOf = (id: string) => parseInt(id.slice(0, 6), 16) % 5;

type Tally = Map<string, Evidence & { turns: number }>;

/** Per-model evidence from a set of outcomes (the same weights the live tallies use). */
export function tallyOutcomes(rows: readonly OutcomeRow[]): { arms: ArmRow[]; evidence: Map<string, Evidence>; pooled: Map<string, number> } {
  const t: Tally = new Map();
  const at = now();
  const bump = (tier: string, cat: string, model: string, r: number, w: number, turn: boolean) => {
    const k = `${tier}|${cat}|${model}`;
    const cur = t.get(k) ?? { good: 0, bad: 0, turns: 0 };
    const d = toDelta({ r, w });
    t.set(k, { good: cur.good + d.good, bad: cur.bad + d.bad, turns: cur.turns + (turn ? 1 : 0) });
  };
  for (const o of rows) {
    for (const s of o.seats) {
      const e = seatEvidence(s);
      bump(o.tier, o.category, s.id, e.r, e.w, true);
      for (const [k, n] of Object.entries(o.fb ?? {}) as [FeedbackKind, number][]) {
        const f = FEEDBACK_EVIDENCE[k];
        if (f && n) bump(o.tier, o.category, s.id, f.r, f.w * n, false);
      }
    }
  }
  const arms: ArmRow[] = [];
  const evidence = new Map<string, Evidence>();
  const sums = new Map<string, Evidence>();
  for (const [k, v] of t) {
    const [tier, category, ...rest] = k.split("|");
    const modelId = rest.join("|");
    arms.push({ id: k, workspaceId: SYSTEM, tier: tier as ArmRow["tier"], category, modelId, good: v.good, bad: v.bad, turns: v.turns, latencySumMs: 0, unitsSum: 0, updatedAt: at });
    evidence.set(k, { good: v.good, bad: v.bad });
    const g = sums.get(`${tier}|${category}`) ?? { good: 0, bad: 0 };
    sums.set(`${tier}|${category}`, { good: g.good + v.good, bad: g.bad + v.bad });
  }
  const pooled = new Map<string, number>();
  for (const [k, v] of sums) pooled.set(k, v.good + v.bad > 0 ? v.good / (v.good + v.bad) : 0.5);
  return { arms, evidence, pooled };
}

/** The candidate policy a body of evidence supports (bounded, thresholds enforced). */
export function candidateFrom(rows: readonly OutcomeRow[]): Boosts {
  const { arms } = tallyOutcomes(rows);
  const groups = new Map<string, ArmRow[]>();
  for (const a of arms) groups.set(keyOf(a.tier, a.category), [...(groups.get(keyOf(a.tier, a.category)) ?? []), a]);
  const out: Boosts = {};
  for (const [k, list] of groups) {
    const b = boostsFor(list, POLICY_SPAN);
    const kept = Object.fromEntries(Object.entries(b).filter(([, v]) => Math.abs(v - 1) >= 0.02));
    if (Object.keys(kept).length) out[k] = kept;
  }
  return out;
}

/** Mean turn score of the given outcomes (null below `min` turns). */
export function meanScore(rows: readonly OutcomeRow[], min = 1): number | null {
  const s = rows.map((o) => turnScore(o)).filter((x): x is number => x !== null);
  return s.length >= min ? s.reduce((a, b) => a + b, 0) / s.length : null;
}

export async function promote(row: PolicyRow, by: string, mode: PolicyRow["by"], note?: string): Promise<void> {
  const st = await getState();
  if (st.activeVersion && st.activeVersion !== row.version) {
    const cur = await getPolicy(st.activeVersion);
    if (cur) await patchPolicy(cur.id, { status: "superseded" });
  }
  await patchPolicy(row.id, { status: "active", decidedAt: now(), decidedBy: by, by: mode, ...(note ? { note } : {}) });
  await saveState({ activeVersion: row.version });
}

export async function runNightly(input: RunInput): Promise<RunSummary> {
  const at = input.at ?? new Date();
  const since = new Date(at.getTime() - WINDOW_DAYS * 864e5).toISOString();
  const state = await getState();
  const summary: RunSummary = { ran: true, outcomes: 0, holdout: 0, cases: 0 };
  const finish = async (s: RunSummary, text: string) => {
    if (!input.dryRun) await saveState({ lastRunAt: at.toISOString(), lastRunSummary: text.slice(0, 400) });
    return s;
  };
  if (process.env.KEPLAR_LEARNING_OFF === "1") return finish({ ...summary, ran: false, skipped: "KEPLAR_LEARNING_OFF is set" }, "Skipped: learning is switched off by an environment setting.");
  if (state.frozen) return finish({ ...summary, ran: false, skipped: "frozen by an admin" }, "Skipped: learning is frozen by an admin.");

  const rows = await outcomes().listSystemRange({ field: "at", gte: since }, 20_000);
  const caseList = await caseRows().listSystemRange({ field: "at", gte: since }, 2_000).catch(() => []);
  summary.outcomes = rows.length;
  summary.cases = caseList.length;

  // Retention: tallies of old turns are already folded into the running arms; the rows themselves are not kept.
  if (!input.dryRun) {
    const cutoff = new Date(at.getTime() - KEEP_DAYS * 864e5).toISOString();
    await outcomes().purgeSystemBefore("at", cutoff).catch(() => 0);
    await signalRows().purgeSystemBefore("at", cutoff).catch(() => 0);
  }

  // 2 · circuit breaker on the active policy
  const active = state.activeVersion ? await getPolicy(state.activeVersion) : null;
  if (active && active.status === "active") {
    const since0 = active.decidedAt ?? active.at;
    const after = rows.filter((o) => o.policyVersion === active.version && o.at >= since0);
    const before = rows.filter((o) => o.policyVersion !== active.version && o.at < since0);
    const a = meanScore(after, MIN_BREAKER);
    const b = meanScore(before, MIN_BREAKER);
    if (a !== null && b !== null && b - a >= BREAKER_DROP) {
      const msg = `Circuit breaker: turns under version ${active.version} scored ${a.toFixed(3)} against ${b.toFixed(3)} before it; rolled back.`;
      summary.breaker = msg;
      if (!input.dryRun) await rollbackTo(active.replaces, active, "breaker", "circuit-breaker", msg);
      return finish(summary, msg);
    }
  }

  // 3 · learn from the training share of the evidence
  const train = rows.filter((o) => bucketOf(o.id) !== 0);
  const held = rows.filter((o) => bucketOf(o.id) === 0);
  summary.holdout = held.length;
  const candidate = candidateFrom(train);
  const base = active?.status === "active" ? active.boosts : {};
  const diff = diffBoosts(base, candidate);
  if (!diff.length) return finish(summary, `No change: ${rows.length} turns, nothing met the minimum-sample rules or moved a model by 2%.`);
  const v = validateBoosts(candidate);
  if (!v.ok) return finish(summary, `Candidate refused: ${v.error}`);

  // 4 · eval set + held-out evidence, baseline versus candidate
  const h = tallyOutcomes(held);
  const pooled: Pooled = { arms: h.evidence, pooled: h.pooled };
  const items = itemsFrom(input.evalSet, caseList.map((c) => ({ id: c.id, text: c.text })));
  const suite: SuiteResult = runSuite(input.rosters, items, (t, c, m) => boostOf(base, t, c, m), (t, c, m) => boostOf(v.boosts, t, c, m), pooled);
  const evidence: PolicyEvidence = {
    outcomes: rows.length,
    holdout: held.length,
    baselineScore: suite.baselineScore,
    candidateScore: suite.candidateScore,
    wins: suite.wins,
    losses: suite.losses,
    ties: suite.ties,
    costDeltaPct: suite.costDeltaPct,
    guardChecks: suite.checks,
    guardFailures: suite.failures,
    regressions: suite.regressions,
  };

  // 5 · decide
  const size = sizeOf(base, v.boosts, suite.costDeltaPct);
  const gain = suite.baselineScore !== null && suite.candidateScore !== null ? suite.candidateScore - suite.baselineScore : null;
  let status: PolicyRow["status"];
  let note: string;
  if (suite.failures.length) {
    status = "failed_checks";
    note = `Rejected: ${suite.failures.length} guard check(s) failed.`;
  } else if (suite.regressions.length) {
    status = "rejected";
    note = `Rejected: worse than the current policy on ${suite.regressions.join(", ")}.`;
  } else if (held.length < MIN_HOLDOUT || rows.length < MIN_CATEGORY_TURNS) {
    status = "rejected";
    note = `Not enough held-out evidence yet (${held.length} held-out turns, need ${MIN_HOLDOUT}).`;
  } else if (gain === null || gain < MIN_GAIN || suite.wins <= suite.losses) {
    status = "rejected";
    note = `Did not beat the current policy on held-out evidence (gain ${gain === null ? "n/a" : gain.toFixed(4)}, ${suite.wins} wins / ${suite.losses} losses).`;
  } else if (size === "large") {
    status = "pending_approval";
    note = "Beats the current policy with every check passing, but the change is large: waiting for an admin.";
  } else {
    status = "active";
    note = "Beat the current policy on held-out evidence with every check passing and no regressions; promoted automatically.";
  }
  const prior = await listPolicies();
  const same = prior.find((p) => JSON.stringify(p.boosts) === JSON.stringify(v.boosts) && (p.status === "pending_approval" || p.status === "rejected" || p.status === "failed_checks"));
  summary.candidate = { version: same?.version ?? 0, status, size, changes: diff.length, note };
  if (input.dryRun) return summary;
  if (same && status !== "active") return finish(summary, `Unchanged candidate: ${note}`);

  // Only one proposal waits for an admin at a time.
  if (status === "pending_approval") for (const p of prior.filter((x) => x.status === "pending_approval")) await patchPolicy(p.id, { status: "rejected", note: "Replaced by a newer proposal.", decidedAt: now(), decidedBy: "auto" });
  const version = await nextVersion();
  const row: PolicyRow = { id: `pol_${version}`, workspaceId: SYSTEM, version, at: at.toISOString(), status: status === "active" ? "pending_approval" : status, boosts: v.boosts, diff: diff.slice(0, 60), size, evidence, by: "auto", note, replaces: active?.version ?? 0 };
  await savePolicy(row);
  summary.candidate = { version, status, size, changes: diff.length, note };
  if (status === "active") await promote(row, "auto", "auto", note);
  return finish(summary, `v${version}: ${note}`);
}

/** Put `toVersion` (0 = no learned policy) back in charge and mark `from` rolled back. */
export async function rollbackTo(toVersion: number, from: PolicyRow, mode: PolicyRow["by"], who: string, note: string): Promise<void> {
  await patchPolicy(from.id, { status: "rolled_back", decidedAt: now(), decidedBy: who, note });
  const prev = toVersion ? await getPolicy(toVersion) : null;
  if (prev) await patchPolicy(prev.id, { status: "active" });
  await saveState({ activeVersion: prev ? prev.version : 0 });
  void mode;
}

export type { StateRow };
export { policyRows };
