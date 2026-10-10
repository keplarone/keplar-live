/**
 * The Bayesian scoring behind router learning. Pure and deterministic (no randomness), so the same evidence always gives the
 * same routing and every number can be re-derived on the dashboard.
 *
 * Each model on each question type is an "arm" with evidence-weighted successes (`good`) and failures (`bad`). The arm's quality
 * is a Beta posterior shrunk toward the question type's pooled mean (so a few lucky answers cannot move anything), scored by an
 * upper confidence bound (a little optimism for arms we know less about, which is the exploration part of a bandit), and turned into
 * a bounded multiplier on the router's own score. Below the minimum sample sizes the multiplier is exactly 1.
 */
import type { ArmRow, FeedbackKind, SeatOutcome } from "./types";

/** Evidence needed before a model's own numbers count, and before a question type is scored at all. */
export const MIN_ARM_TURNS = 20;
export const MIN_CATEGORY_TURNS = 60;
/** Shrink toward the pooled mean as if this many neutral observations had been seen. */
const PRIOR_STRENGTH = 10;
/** How much a standard deviation of uncertainty is worth (exploration). */
const OPTIMISM = 0.5;
const GAIN = 3;

/** Live multipliers (computed from running tallies) are small; promoted policies may move further. */
export const LIVE_SPAN = 0.08;
export const POLICY_SPAN = 0.25;
/** The product of live and policy boosts is held inside this range whatever else happens. */
export const BOOST_FLOOR = 0.8;
export const BOOST_CEIL = 1.3;

export type Evidence = { good: number; bad: number };
export const total = (e: Evidence) => e.good + e.bad;

export function mean(e: Evidence, pooled = 0.5, k = PRIOR_STRENGTH): number {
  return (e.good + k * pooled) / (total(e) + k);
}

/** Optimistic score: posterior mean plus a fraction of its standard deviation. */
export function ucb(e: Evidence, pooled = 0.5): number {
  const m = mean(e, pooled);
  const n = total(e) + PRIOR_STRENGTH;
  return m + OPTIMISM * Math.sqrt((m * (1 - m)) / (n + 1));
}

export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Seat reward (0..1) and weight for what the turn itself shows: did the model answer, and did it agree with the majority. */
export function seatEvidence(s: SeatOutcome): { r: number; w: number } {
  if (!s.ok) return { r: 0, w: 1 };
  if (s.agree === true) return { r: 1, w: 1 };
  if (s.agree === false) return { r: 0.4, w: 1 };
  return { r: 0.8, w: 1 }; // answered, nobody to compare with
}

/** What a feedback signal says about every model that took part in the turn. */
export const FEEDBACK_EVIDENCE: Record<FeedbackKind, { r: number; w: number }> = {
  up: { r: 1, w: 2 },
  down: { r: 0, w: 3 },
  regenerate: { r: 0, w: 1 },
  copy: { r: 1, w: 1 },
  correct: { r: 0, w: 1.5 },
};

export const toDelta = (e: { r: number; w: number }) => ({ good: e.w * e.r, bad: e.w * (1 - e.r) });

/**
 * Multipliers for every arm of one (tier, category), given all of that category's arms.
 * `{}` when there is not enough evidence: nothing is learned from thin data.
 */
export function boostsFor(arms: readonly Pick<ArmRow, "modelId" | "good" | "bad" | "turns">[], span: number, minArm = MIN_ARM_TURNS, minCat = MIN_CATEGORY_TURNS): Record<string, number> {
  const seasoned = arms.filter((a) => a.turns >= minArm);
  const catTurns = arms.reduce((n, a) => n + a.turns, 0);
  if (catTurns < minCat || seasoned.length < 2) return {};
  const all = arms.reduce((e, a) => ({ good: e.good + a.good, bad: e.bad + a.bad }), { good: 0, bad: 0 });
  const pooled = total(all) > 0 ? all.good / total(all) : 0.5;
  const scores = seasoned.map((a) => ucb(a, pooled));
  const avg = scores.reduce((x, y) => x + y, 0) / scores.length;
  const out: Record<string, number> = {};
  seasoned.forEach((a, i) => {
    const b = clamp(Math.exp(GAIN * (scores[i] - avg)), 1 / (1 + span), 1 + span);
    out[a.modelId] = Math.round(b * 1000) / 1000;
  });
  return out;
}

/** Posterior mean of one arm in a pool (used to estimate how well a routed panel would have done on held-out evidence). */
export function expectedReward(arm: Evidence | undefined, pooled: number): number {
  return arm ? mean(arm, pooled) : pooled;
}

/** How well one recorded turn went, 0..1: seat evidence and any feedback, weighted. null when there is nothing to judge. */
export function turnScore(o: { seats: readonly SeatOutcome[]; fb?: Partial<Record<FeedbackKind, number>> }): number | null {
  let w = 0;
  let r = 0;
  for (const s of o.seats) {
    const e = seatEvidence(s);
    w += e.w;
    r += e.w * e.r;
  }
  for (const [k, n] of Object.entries(o.fb ?? {}) as [FeedbackKind, number][]) {
    const e = FEEDBACK_EVIDENCE[k];
    if (!e || !n) continue;
    // Feedback speaks for the whole turn, so it counts once per signal, not once per seat.
    w += e.w * n;
    r += e.w * e.r * n;
  }
  return w > 0 ? r / w : null;
}
