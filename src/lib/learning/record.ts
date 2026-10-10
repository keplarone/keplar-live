/**
 * Recording what happened after each prompt, and what the person did with the answer. Everything here is best effort: it never
 * throws into the answer path, never stores prompt text (except a redacted failed question with consent), and never stores an
 * account id (turn keys are salted hashes).
 */
import { id, now } from "@/lib/create/platform/ids";
import type { Classification, KeplarAnswer } from "@/lib/orchestration/types";
import { FEEDBACK_EVIDENCE, seatEvidence, toDelta } from "./bandit";
import { redactCase } from "./redact";
import { armRows, caseRows, outcomes, shareFailures, signalRows, SYSTEM, turnKey } from "./repo";
import { FEEDBACK_KINDS, type ArmRow, type CaseRow, type Category, type FeedbackKind, type OutcomeRow, type SeatOutcome, type Tier } from "./types";

export const categoryOf = (c: Pick<Classification, "kind" | "complexity">): Category => `${c.kind}:${c.complexity}`;
export const tierOf = (plan: string | undefined): Tier => (!plan || plan === "free" ? "free" : "paid");
const armId = (tier: Tier, category: Category, modelId: string) => `${tier}|${category}|${modelId}`;

/** Panel seats of a finished answer, with agreement only when 3+ models answered (a pair has no majority). */
export function seatsOf(answer: Pick<KeplarAnswer, "models">): SeatOutcome[] {
  const panel = answer.models.filter((m) => m.slot === "panel");
  const counts = new Map<string, number>();
  for (const m of panel) if (m.status === "responded" && m.stance) counts.set(m.stance, (counts.get(m.stance) ?? 0) + 1);
  const responders = panel.filter((m) => m.status === "responded").length;
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const majority = responders >= 3 && top && top[1] > responders / 2 ? top[0] : null;
  return panel.map((m) => {
    const ok = m.status === "responded";
    return { id: m.id, ok, ...(ok && majority !== null && m.stance ? { agree: m.stance === majority } : {}) };
  });
}

export type TurnFacts = {
  key: string;
  tier: Tier;
  category: Category;
  mode: "single" | "consensus";
  seats: SeatOutcome[];
  latencyMs: number;
  units: number;
  status: "ok" | "no_response";
  policyVersion: number;
};

export function buildOutcome(f: TurnFacts, at = now()): OutcomeRow {
  return {
    id: f.key,
    workspaceId: SYSTEM,
    at,
    tier: f.tier,
    category: f.category,
    mode: f.mode,
    seats: f.seats.slice(0, 12),
    latencyMs: Math.max(0, Math.round(f.latencyMs)),
    units: Math.max(0, Math.round(f.units)),
    status: f.status,
    policyVersion: f.policyVersion,
    fb: {},
  };
}

async function addEvidence(tier: Tier, category: Category, seats: SeatOutcome[], per: (s: SeatOutcome) => { r: number; w: number }, extra?: { latencyMs: number; units: number; turns: 1 }, sign = 1) {
  for (const s of seats) {
    const raw = toDelta(per(s));
    const d = { good: raw.good * sign, bad: raw.bad * sign };
    const aid = armId(tier, category, s.id);
    const init: ArmRow = { id: aid, workspaceId: SYSTEM, tier, category, modelId: s.id, good: 0, bad: 0, turns: 0, latencySumMs: 0, unitsSum: 0, updatedAt: now() };
    await armRows().increment(SYSTEM, aid, { good: d.good, bad: d.bad, turns: extra ? 1 : 0, latencySumMs: extra?.latencyMs ?? 0, unitsSum: extra ? extra.units / Math.max(1, seats.length) : 0 }, init);
  }
}

/** One finished turn: the outcome row plus the tallies of every model that took part. Idempotent per turn key. */
export async function recordOutcome(f: TurnFacts): Promise<boolean> {
  try {
    if (!f.seats.length) return false;
    const { inserted } = await outcomes().insertIfAbsent(buildOutcome(f));
    if (!inserted) return false;
    await addEvidence(f.tier, f.category, f.seats, seatEvidence, { latencyMs: f.latencyMs, units: f.units, turns: 1 });
    return true;
  } catch (e) {
    console.error("[learning] outcome not recorded:", e instanceof Error ? e.name : "error");
    return false;
  }
}

export type SignalResult = { ok: boolean; reason?: "unknown_turn" | "duplicate" | "bad_kind" | "error"; caseSaved?: boolean };

/**
 * Feedback on an answer: thumbs, copy, regenerate (Ask again), or a follow-up that corrects it. Counted once per turn and kind
 * (a thumbs-up then thumbs-down replaces the vote). `text`, when given and the person agreed to share failures, is stored redacted.
 */
export async function recordSignal(i: { workspaceId: string; anonymous?: boolean; answerId: string; kind: string; text?: string }): Promise<SignalResult> {
  try {
    if (!FEEDBACK_KINDS.includes(i.kind as FeedbackKind)) return { ok: false, reason: "bad_kind" };
    const kind = i.kind as FeedbackKind;
    const key = turnKey(i.workspaceId, String(i.answerId).slice(0, 80));
    const row = await outcomes().get(SYSTEM, key);
    if (!row) return { ok: false, reason: "unknown_turn" };

    // Votes are one slot per turn (the latest wins); every other signal counts once.
    const slot = kind === "up" || kind === "down" ? "vote" : kind;
    const sigId = `${key}:${slot}`;
    const prior = await signalRows().get(SYSTEM, sigId);
    if (prior?.value === kind) return { ok: false, reason: "duplicate" };
    if (prior) {
      await signalRows().update(SYSTEM, sigId, { value: kind, at: now() });
      const old = prior.value as FeedbackKind;
      const rev = FEEDBACK_EVIDENCE[old];
      await addEvidence(row.tier, row.category, row.seats, () => rev, undefined, -1); // take the old vote back
      await outcomes().update(SYSTEM, key, { fb: { ...row.fb, [old]: Math.max(0, (row.fb[old] ?? 1) - 1) } });
    } else {
      await signalRows().insert({ id: sigId, workspaceId: SYSTEM, at: now(), value: kind });
    }
    const fresh = (await outcomes().get(SYSTEM, key)) ?? row;
    await outcomes().update(SYSTEM, key, { fb: { ...fresh.fb, [kind]: (fresh.fb[kind] ?? 0) + 1 } });
    await addEvidence(row.tier, row.category, row.seats, () => FEEDBACK_EVIDENCE[kind]);

    let caseSaved = false;
    if (kind === "down" || kind === "correct" || kind === "regenerate") {
      caseSaved = await saveCase({ workspaceId: i.workspaceId, anonymous: i.anonymous, tier: row.tier, category: row.category, reason: kind === "down" ? "thumbs_down" : kind === "correct" ? "correction" : "regenerate", text: i.text });
    }
    return { ok: true, caseSaved };
  } catch (e) {
    console.error("[learning] signal not recorded:", e instanceof Error ? e.name : "error");
    return { ok: false, reason: "error" };
  }
}

/** Keep a failed question for testing future changes. Signed-in people who turned sharing on only; redacted; may be text-free. */
export async function saveCase(i: { workspaceId: string; anonymous?: boolean; tier: Tier; category: Category; reason: CaseRow["reason"]; text?: string }): Promise<boolean> {
  try {
    if (i.anonymous || !(await shareFailures(i.workspaceId))) return false;
    const existing = await caseRows().list(i.workspaceId);
    if (existing.length >= 50) await caseRows().remove(i.workspaceId, existing.sort((a, b) => a.at.localeCompare(b.at))[0].id);
    await caseRows().insert({ id: id("case"), workspaceId: i.workspaceId, at: now(), tier: i.tier, category: i.category, reason: i.reason, text: redactCase(i.text) });
    return true;
  } catch {
    return false;
  }
}

export { looksLikeCorrection } from "./signals";
