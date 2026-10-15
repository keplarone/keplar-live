/**
 * The self-development run (daily via /api/cron/core; admins can run it on demand). In order:
 *   1. calibration: how often answers at each stated confidence were actually good (from real feedback, 30+ turns a bucket);
 *   2. canary decisions: a canary that matched or beat its champion on 40+ turns with no guard regression is marked ready to
 *      promote and waits for an admin (it is never promoted by this job); one that did worse is rolled back; a breaker rolls a
 *      recent promotion back if its live reward falls below the champion it replaced (rolling back is always automatic);
 *   3. one candidate is evaluated against the champion on benchmark items (live, free models, capped calls); if it scores at
 *      least as well with no guard regression (latency, calls, any category) it waits for admin review (pending_review) and
 *      serves no traffic until an admin approves it as a canary (admin.ts#approveCandidate, MFA-gated admin route, audited);
 *   4. scheduled eval of the champion, plus a replay of a few redacted failed questions (people who opted in to sharing);
 *   5. gap finding over recent turns, and new candidates from the worst clusters. Fixes that need code become proposals
 *      in the admin review queue; they are never applied by this job.
 * Everything is logged in the change log. The kill switch stops all of it; freeze stops promotions and canaries.
 * Keplar improves its own prompts, routing hints, retrieval and strategies this way; it does not retrain any model.
 */
import { createHash } from "node:crypto";
import { id as newId, now } from "@/lib/create/platform/ids";
import { caseRows } from "@/lib/learning/repo";
import type { orchestrate } from "@/lib/orchestration/orchestrator";
import { BENCH } from "../bench";
import { bucketOf } from "../confidence";
import { draftFor, proposalFor, toCandidate, type Writer } from "./candidates";
import { coreArm, dailySubset, metricsOf, replayScore, runArm } from "./evals";
import { findGaps } from "./gaps";
import { checkVariant, guardFailures } from "./guard";
import { turnReward } from "./outcomes";
import { changeRows, evalRows, gapRows, getCoreState, logChange, proposalRows, saveCoreState, SYSTEM, turnRows, variantRows } from "./repo";
import { loadActive, pick, seedVariant, STARTER_CANDIDATES, type ActiveSet, type Picked } from "./variants";
import { VARIANT_TARGETS, type EvalRun, type TurnRow, type VariantRow, type VariantTarget } from "./types";

type Deps = NonNullable<Parameters<typeof orchestrate>[1]>;
export const PIPELINE = {
  windowDays: 14,
  keepDays: 60,
  minPromoteTurns: Number(process.env.KEPLAR_CORE_MIN_CANARY_TURNS) || 40,
  rollbackMargin: 0.05,
  breakerMargin: 0.08,
  maxBadRateRise: 0.03,
  maxLatencyRatio: 1.3,
  calibrationMin: 30,
  evalItems: 3,
  replayCases: 2,
} as const;

export type PipelineOpts = {
  /** Live models for evals (free roster). Without it candidates wait; nothing is promoted to canary unevaluated. */
  deps?: (() => Deps | null) | null;
  write?: Writer;
  at?: Date;
  /** Stop starting new work after this time (ms epoch). */
  deadline?: number;
  /** Arms for tests. */
  armFor?: (picked: Picked) => Parameters<typeof runArm>[1];
};
export type PipelineReport = { skipped?: string; calibration: Record<string, number>; decisions: string[]; evals: string[]; gaps: number; candidates: string[]; proposals: string[] };

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
function armStats(turns: TurnRow[]) {
  const rewards = turns.map(turnReward);
  return { n: turns.length, reward: mean(rewards), bad: rewards.filter((r) => r < 0.45).length / (turns.length || 1), latency: mean(turns.map((t) => t.latencyMs)) };
}

export function calibrationFrom(turns: TurnRow[], min: number = PIPELINE.calibrationMin): Record<string, number> {
  const by = new Map<string, { n: number; good: number }>();
  for (const t of turns) {
    if (!Object.keys(t.fb ?? {}).length) continue; // only turns where the person told us something
    const b = bucketOf(t.confidence);
    const v = by.get(b) ?? { n: 0, good: 0 };
    v.n++;
    if (turnReward(t) >= 0.5) v.good++;
    by.set(b, v);
  }
  return Object.fromEntries([...by].filter(([, v]) => v.n >= min).map(([k, v]) => [k, Math.round((v.good / v.n) * 100) / 100]));
}

/** Promote / roll back canaries and run the post-promotion breaker. Pure decisions over turns; writes the result. */
export async function decideCanaries(set: ActiveSet, turns: TurnRow[], at: string): Promise<string[]> {
  const out: string[] = [];
  const of = (t: VariantTarget, id: string) => turns.filter((x) => x.variants?.[t] === id);
  for (const t of VARIANT_TARGETS) {
    const { champion, canary } = set.byTarget[t];
    // Breaker: a recent promotion whose live reward fell clearly below the champion it replaced is undone.
    if (champion.replaced && champion.baseline !== undefined && champion.promotedAt) {
      const after = of(t, champion.id).filter((x) => x.at >= champion.promotedAt!);
      const s = armStats(after);
      if (s.n >= PIPELINE.minPromoteTurns && s.reward < champion.baseline - PIPELINE.breakerMargin) {
        await variantRows().update(SYSTEM, champion.id, { status: "rolled_back", note: `breaker: reward ${s.reward.toFixed(2)} < ${champion.baseline.toFixed(2)} before` });
        if (!champion.replaced.startsWith("seed-")) await variantRows().update(SYSTEM, champion.replaced, { status: "champion" });
        await logChange({ action: "rollback", target: t, variantId: champion.id, by: "breaker", note: `Live reward ${s.reward.toFixed(2)} fell below the replaced champion's ${champion.baseline.toFixed(2)}; restored ${champion.replaced}.` });
        out.push(`${t}: breaker rolled back ${champion.id}`);
        continue;
      }
    }
    if (!canary || set.state.frozen) continue;
    const c = armStats(of(t, canary.id));
    const h = armStats(of(t, champion.id));
    if (c.n < PIPELINE.minPromoteTurns || h.n < PIPELINE.minPromoteTurns) continue;
    const regress: string[] = [];
    if (h.latency > 0 && c.latency > h.latency * PIPELINE.maxLatencyRatio) regress.push("latency");
    if (c.bad > h.bad + PIPELINE.maxBadRateRise) regress.push("bad-outcome rate");
    if (c.reward >= h.reward && !regress.length) {
      // Never promoted by the job (AI-12): recorded as ready, and an admin promotes it (admin.ts#promote).
      if (canary.readyToPromote) continue;
      await variantRows().update(SYSTEM, canary.id, { readyToPromote: { at, reward: c.reward, championReward: h.reward, n: c.n } });
      await logChange({ action: "review", target: t, variantId: canary.id, by: "auto", note: `Canary reward ${c.reward.toFixed(2)} (n=${c.n}) ≥ champion ${h.reward.toFixed(2)} (n=${h.n}); no guard regression. Ready to promote: waiting for an admin.` });
      out.push(`${t}: ${canary.id} ready to promote (waiting for an admin)`);
    } else if (c.reward < h.reward - PIPELINE.rollbackMargin || regress.length) {
      await variantRows().update(SYSTEM, canary.id, { status: "rolled_back", note: regress.length ? `regressed: ${regress.join(", ")}` : `reward ${c.reward.toFixed(2)} < ${h.reward.toFixed(2)}` });
      await logChange({ action: "rollback", target: t, variantId: canary.id, by: "auto", note: regress.length ? `Canary regressed on ${regress.join(", ")}.` : `Canary reward ${c.reward.toFixed(2)} below champion ${h.reward.toFixed(2)}.` });
      out.push(`${t}: rolled back ${canary.id}`);
    }
  }
  return out;
}

/** The champion set with one target swapped for the candidate. */
export function pickedWith(set: ActiveSet, candidate?: VariantRow): Picked {
  const base: ActiveSet = { ...set, state: { ...set.state, frozen: false }, byTarget: Object.fromEntries(VARIANT_TARGETS.map((t) => [t, { champion: set.byTarget[t].champion, canary: null }])) as ActiveSet["byTarget"] };
  const p = pick(base, "eval");
  if (!candidate) return p;
  const champ = set.byTarget[candidate.target].champion;
  const params = { ...p.params };
  for (const k of Object.keys(champ.params)) delete (params as Record<string, unknown>)[k];
  return { ids: { ...p.ids, [candidate.target]: candidate.id }, text: { ...p.text, [candidate.target]: candidate.text || undefined }, params: { ...params, ...candidate.params } };
}

async function saveEval(e: Omit<EvalRun, "id" | "workspaceId" | "at">): Promise<void> {
  await evalRows().insert({ ...e, id: newId("eval"), workspaceId: SYSTEM, at: now() });
}

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 12);

export async function runCorePipeline(opts: PipelineOpts = {}): Promise<PipelineReport> {
  const at = (opts.at ?? new Date()).toISOString();
  const deadline = opts.deadline ?? Date.now() + 240_000;
  const report: PipelineReport = { calibration: {}, decisions: [], evals: [], gaps: 0, candidates: [], proposals: [] };
  const state = await getCoreState();
  if (state.killed) return { ...report, skipped: "Core is switched off (kill switch); nothing learned or changed." };
  if (process.env.KEPLAR_LEARNING_OFF === "1") return { ...report, skipped: "KEPLAR_LEARNING_OFF=1" };

  // Retention: outcome rows older than 60 days are deleted.
  const keep = new Date(Date.parse(at) - PIPELINE.keepDays * 86_400_000).toISOString();
  try { await turnRows().purgeSystemBefore("at", keep); } catch { /* best effort */ }
  const since = new Date(Date.parse(at) - PIPELINE.windowDays * 86_400_000).toISOString();
  const turns = await turnRows().listSystem((t) => t.at >= since);

  // 1. Calibration.
  report.calibration = calibrationFrom(turns);
  if (Object.keys(report.calibration).length) await saveCoreState({ calibration: report.calibration });

  // Starter candidates exist once (they go through the same gate as everything else).
  for (const s of STARTER_CANDIDATES) {
    const r = await variantRows().insertIfAbsent({ ...s, workspaceId: SYSTEM, status: "candidate", createdAt: at, stats: { turns: 0, good: 0, bad: 0 } });
    if (r.inserted) await logChange({ action: "candidate", target: s.target, variantId: s.id, by: "auto", note: `Starter candidate: ${s.label}.` });
  }

  // 2. Canary decisions.
  let set = await loadActive(true);
  report.decisions = await decideCanaries(set, turns, at);
  if (report.decisions.length) set = await loadActive(true);

  // 3. One candidate: guard, then eval against the champion, then canary.
  const deps = opts.deps?.() ?? null;
  const armFor = opts.armFor ?? (deps ? (p: Picked) => coreArm(() => opts.deps!()!, "thorough", "free", p) : null);
  const day = Math.floor(Date.parse(at) / 86_400_000);
  let championRan = false;
  if (!set.state.frozen) {
    const all = await variantRows().list(SYSTEM);
    const busy = new Set([...VARIANT_TARGETS.filter((t) => set.byTarget[t].canary), ...all.filter((v) => v.status === "pending_review").map((v) => v.target)]);
    const next = all.filter((v) => v.status === "candidate" && !busy.has(v.target)).sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    if (next) {
      const g = checkVariant(next);
      if (!g.ok) {
        await variantRows().update(SYSTEM, next.id, { status: "failed_checks", guardFailures: g.reasons });
        await logChange({ action: "reject", target: next.target, variantId: next.id, by: "auto", note: `Failed safety checks: ${g.reasons.join("; ")}.` });
        report.decisions.push(`${next.target}: ${next.id} failed safety checks`);
      } else if (!armFor) {
        report.evals.push(`candidate ${next.id} waiting: live evals unavailable (no free model key)`);
      } else if (Date.now() < deadline - 120_000) {
        const items = dailySubset(BENCH, day).slice(0, PIPELINE.evalItems);
        const [champ, cand] = await Promise.all([runArm(items, armFor(pickedWith(set)), { concurrency: 2 }), runArm(items, armFor(pickedWith(set, next)), { concurrency: 2 })]);
        championRan = true;
        const m0 = metricsOf(champ), m1 = metricsOf(cand);
        const fails = guardFailures(m1, m0);
        const byCat = (rs: typeof champ) => Object.fromEntries(Object.entries(metricsOf(rs).byCategory).map(([k, v]) => [k, { n: rs.filter((r) => r.category === k).length, score: v }]));
        await saveEval({ kind: "scheduled", label: "Champion (daily subset)", n: champ.length, score: m0.score, byCategory: byCat(champ), guardFailures: [], mode: "live" });
        await saveEval({ kind: "candidate", label: `${next.label} (${next.id})`, n: cand.length, score: m1.score, byCategory: byCat(cand), guardFailures: fails, mode: "live" });
        if (fails.length) {
          await variantRows().update(SYSTEM, next.id, { status: "rejected", evalScore: m1.score, championEvalScore: m0.score, guardFailures: fails });
          await logChange({ action: "reject", target: next.target, variantId: next.id, by: "auto", note: `Eval ${m1.score.toFixed(2)} vs champion ${m0.score.toFixed(2)}: ${fails.join("; ")}.` });
          report.decisions.push(`${next.target}: rejected ${next.id}`);
        } else {
          // Passed: it waits for an admin to approve it before it serves any traffic (AI-12).
          await variantRows().update(SYSTEM, next.id, { status: "pending_review", evalScore: m1.score, championEvalScore: m0.score, guardFailures: [] });
          await logChange({ action: "review", target: next.target, variantId: next.id, by: "auto", note: `Eval ${m1.score.toFixed(2)} vs champion ${m0.score.toFixed(2)}, no guard regression; waiting for an admin to approve it as a ${state.canaryPct}% canary.` });
          report.decisions.push(`${next.target}: ${next.id} passed evals and is waiting for admin review`);
        }
        report.evals.push(`candidate ${next.id}: ${m1.score.toFixed(2)} vs champion ${m0.score.toFixed(2)}`);
      }
    }
  }

  // 4. Scheduled champion eval (when the candidate eval didn't already run it) and failure replay.
  if (armFor && !championRan && Date.now() < deadline - 90_000) {
    const items = dailySubset(BENCH, day).slice(0, PIPELINE.evalItems);
    const rs = await runArm(items, armFor(pickedWith(set)), { concurrency: 3 });
    const m = metricsOf(rs);
    await saveEval({ kind: "scheduled", label: "Champion (daily subset)", n: rs.length, score: m.score, byCategory: Object.fromEntries(Object.entries(m.byCategory).map(([k, v]) => [k, { n: rs.filter((r) => r.category === k).length, score: v }])), guardFailures: [], mode: "live" });
    report.evals.push(`scheduled: ${m.score.toFixed(2)} on ${rs.length} items`);
  }
  if (deps && Date.now() < deadline - 60_000) {
    try {
      const cases = (await caseRows().listSystem((c) => Boolean(c.text) && c.at >= since)).sort((a, b) => b.at.localeCompare(a.at)).slice(0, PIPELINE.replayCases);
      const scores: number[] = [];
      for (const c of cases) { const s = await replayScore(deps, c.text!); if (s !== null) scores.push(s / 10); }
      if (scores.length) {
        await saveEval({ kind: "replay", label: "Replay of redacted failed questions (critic-graded)", n: scores.length, score: mean(scores), byCategory: {}, guardFailures: [], mode: "live" });
        report.evals.push(`replay: ${mean(scores).toFixed(2)} on ${scores.length} cases`);
      }
    } catch { /* replay is optional */ }
  }

  // 5. Gaps and new candidates / proposals.
  const gaps = findGaps(turns);
  report.gaps = gaps.length;
  await gapRows().insertIfAbsent({ id: `gaps-${at.slice(0, 10)}`, workspaceId: SYSTEM, at, clusters: gaps }).then(async (r) => { if (!r.inserted) await gapRows().update(SYSTEM, r.row.id, { at, clusters: gaps }); });
  const existing = await variantRows().list(SYSTEM);
  const recent = new Date(Date.parse(at) - PIPELINE.windowDays * 86_400_000).toISOString();
  let made = 0;
  for (const c of gaps) {
    if (made >= 2) break;
    if (c.need === "code") {
      const pid = `prop-${hash(c.key)}`;
      const p = proposalFor(c);
      const r = await proposalRows().insertIfAbsent({ ...p, id: pid, workspaceId: SYSTEM, at, status: "open" });
      if (r.inserted) { await logChange({ action: "proposal", by: "auto", note: `Code proposal for review: ${p.title}.` }); report.proposals.push(p.title); made++; }
      continue;
    }
    if (existing.some((v) => v.cluster === c.key && v.createdAt >= recent)) continue;
    const d = await draftFor(c, opts.write);
    if (!d) continue;
    const g = checkVariant(d);
    const row = toCandidate(d, c);
    if (!g.ok) { await variantRows().insert({ ...row, status: "failed_checks", guardFailures: g.reasons }); continue; }
    await variantRows().insert(row);
    await logChange({ action: "candidate", target: row.target, variantId: row.id, by: "auto", note: `From gap "${c.label}" (${Math.round(c.badRate * 100)}% bad of ${c.turns}): ${row.label}.` });
    report.candidates.push(`${row.target}: ${row.label}`);
    made++;
  }

  const summary = [report.decisions.join("; "), report.evals.join("; "), `${report.gaps} gaps`, report.candidates.length ? `${report.candidates.length} new candidates` : "", report.proposals.length ? `${report.proposals.length} proposals` : ""].filter(Boolean).join(" · ");
  await saveCoreState({ lastRunAt: at, lastRunSummary: summary.slice(0, 500) });
  await loadActive(true).catch(() => undefined);
  return report;
}

/** Seeds shown on the admin page even before any run. */
export const seeds = () => VARIANT_TARGETS.map(seedVariant);
export { changeRows };
