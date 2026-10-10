/**
 * Soft upsell for Free users: a small, dismissible note under an answer.
 * Pure (no storage, no DOM) so the rules are testable; the app keeps the state in localStorage.
 *
 * Rules (Free plan only; never on small talk or the creator reply, which are not "answers"):
 *  - after the 5th answer, then every 10th (15th, 25th, ...)
 *  - or when the question was complex (models disagreed / partial consensus): at most once a day
 *  - never twice in a row, never within 1 hour of the last note
 *  - dismissing it hides the notes for 7 days
 */
export type UpsellState = { answers: number; lastShownAt: number; lastComplexAt: number; dismissedUntil: number };
export type UpsellReason = "milestone" | "complex";

export const emptyUpsell = (): UpsellState => ({ answers: 0, lastShownAt: 0, lastComplexAt: 0, dismissedUntil: 0 });

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
export const DISMISS_MS = 7 * DAY;

/** Is the answer the kind a stronger panel would help with? */
export function isComplexAnswer(a: { consensus: { level: string; disagree: number }; disagreements: unknown[] }): boolean {
  return a.disagreements.length > 0 || a.consensus.level === "partial" || a.consensus.level === "none" || a.consensus.disagree > 0;
}

/** Counts this answer and says whether to show a note. Returns the next state too. */
export function nextUpsell(prev: UpsellState, opts: { complex: boolean; now?: number }): { state: UpsellState; show: UpsellReason | null } {
  const now = opts.now ?? Date.now();
  const answers = prev.answers + 1;
  let state: UpsellState = { ...prev, answers };
  if (now < prev.dismissedUntil || now - prev.lastShownAt < HOUR) return { state, show: null };
  const milestone = answers === 5 || (answers > 5 && (answers - 5) % 10 === 0);
  const complex = opts.complex && now - prev.lastComplexAt >= DAY;
  const show: UpsellReason | null = complex ? "complex" : milestone ? "milestone" : null;
  if (show) state = { ...state, lastShownAt: now, lastComplexAt: show === "complex" ? now : prev.lastComplexAt };
  return { state, show };
}

export const dismissUpsell = (prev: UpsellState, now = Date.now()): UpsellState => ({ ...prev, dismissedUntil: now + DISMISS_MS });

const KEY = "keplar.upsell.v1";

export function readUpsell(): UpsellState {
  try {
    const raw = typeof window === "undefined" ? null : window.localStorage.getItem(KEY);
    const j = raw ? (JSON.parse(raw) as Partial<UpsellState>) : {};
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);
    return { answers: n(j.answers), lastShownAt: n(j.lastShownAt), lastComplexAt: n(j.lastComplexAt), dismissedUntil: n(j.dismissedUntil) };
  } catch {
    return emptyUpsell();
  }
}

export function writeUpsell(s: UpsellState) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: no note next time either */
  }
}
