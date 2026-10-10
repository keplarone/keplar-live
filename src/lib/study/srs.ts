/**
 * Spaced repetition (pure). SM-2 (SuperMemo-2) with four answer buttons, plus the Leitner box shown to the learner
 * (box = how many successful repetitions in a row, capped at 5). Intervals are whole days; "due" is a YYYY-MM-DD date.
 *   Again -> quality 1 (lapse: back to the start, tomorrow... in 10 minutes in practice; we use "today" so it returns this session)
 *   Hard  -> 3, Good -> 4, Easy -> 5
 */
import type { CardState } from "./types";

export type Grade = "again" | "hard" | "good" | "easy";
export const QUALITY: Record<Grade, number> = { again: 1, hard: 3, good: 4, easy: 5 };
export const isGrade = (v: unknown): v is Grade => v === "again" || v === "hard" || v === "good" || v === "easy";

export const dayOf = (d: Date | number | string = Date.now()) => new Date(d).toISOString().slice(0, 10);
export const addDays = (day: string, n: number) => dayOf(new Date(`${day}T00:00:00Z`).getTime() + n * 86_400_000);
export const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);

export const newCard = (today: string): CardState => ({ box: 0, ease: 2.5, interval: 0, reps: 0, lapses: 0, due: today, last: "" });

export function review(prev: CardState | undefined, grade: Grade, today: string): CardState {
  const c = prev ?? newCard(today);
  const q = QUALITY[grade];
  let { ease, reps, interval, lapses } = c;
  if (q < 3) {
    reps = 0;
    interval = 0;
    lapses += 1;
  } else {
    reps += 1;
    interval = reps === 1 ? 1 : reps === 2 ? (q === 5 ? 4 : 3) : Math.max(interval + 1, Math.round(interval * ease));
    if (q === 3) interval = Math.max(1, Math.round(interval * 0.8));
  }
  ease = Math.max(1.3, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  const box = q < 3 ? 1 : Math.min(5, Math.max(1, c.box) + (q >= 4 ? 1 : 0));
  return { box, ease: Math.round(ease * 100) / 100, interval, reps, lapses, due: addDays(today, interval), last: today };
}

/** Is the card due on `today`? New cards (never reviewed) are due. */
export const isDue = (c: CardState | undefined, today: string) => !c || c.due <= today;

/** Roughly "learned": reviewed successfully and scheduled at least 6 days out. */
export const isKnown = (c: CardState | undefined) => Boolean(c && c.reps >= 2 && c.interval >= 6);

/** Consecutive study days ending today (or yesterday: the streak is still alive until the day is over). */
export function streak(days: string[], today: string): { current: number; best: number } {
  const set = new Set(days);
  let current = 0;
  let cursor = set.has(today) ? today : addDays(today, -1);
  while (set.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  const sorted = [...set].sort();
  let best = 0;
  let run = 0;
  for (let i = 0; i < sorted.length; i++) {
    run = i > 0 && daysBetween(sorted[i - 1], sorted[i]) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return { current, best };
}
