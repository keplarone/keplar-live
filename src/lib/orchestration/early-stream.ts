import { assessOutput } from "./quality-gate";

/**
 * Early words: real provider token streaming into the answer area.
 *
 * Panel models are called in parallel. The FIRST one to produce a word becomes the "leader" and its words are forwarded to the screen as they
 * arrive (a `delta` event each), so the first words show after about one model's time-to-first-token instead of after the whole panel,
 * comparison, review and synthesis. The other seats keep working silently. For one-model answers that streamed text IS the answer. For
 * panel answers it is an early draft: the final, checked answer replaces it when it is ready (the screen says so while it waits).
 *
 * Reasoning that a model inlines as <think>...</think> is never shown (same rule as providers/shared.ts fromChat).
 */

/** The visible part of a streamed reply so far: reasoning blocks removed, and an unfinished opening tag held back. */
export function visibleText(raw: string): string {
  let t = raw.replace(/<think>[\s\S]*?<\/think>\s*/g, "").replace(/^[\s\S]*?<\/think>\s*/, "");
  const open = t.indexOf("<think>");
  if (open >= 0) t = t.slice(0, open);
  // A tag that is still arriving ("<thi") is not text yet.
  const lt = t.lastIndexOf("<");
  if (lt >= 0 && lt >= t.length - 7 && "<think>".startsWith(t.slice(lt))) t = t.slice(0, lt);
  return t;
}

export type EarlyStream = {
  /** A seat's token callback (pass to the provider). */
  tokens(seat: number): (delta: string) => void;
  /** A seat's whole reply is in and passed the registry's quality gate: if it streamed but has not been shown yet (a short reply), show it now. */
  complete(seat: number, text: string): void;
  /** Whether any words were forwarded to the screen. */
  readonly started: boolean;
  /** The seat whose words are on screen, or -1. */
  readonly leader: number;
};

/** Words are held until this much text has arrived so the quality check can look at them first (about 15 words). */
export const EARLY_MIN_CHARS = 90;

/**
 * `emit` gets text to append to the draft. Only the first seat whose opening text passes the quality gate leads; once a leader exists every
 * other seat is ignored. A seat whose opening text fails the gate (word salad, glued words, loops) never leads and nothing of it is shown.
 */
export function earlyStream(emit: (text: string) => void, opts: { minChars?: number; prompt?: string } = {}): EarlyStream {
  const minChars = opts.minChars ?? EARLY_MIN_CHARS;
  let leader = -1;
  let sent = 0;
  const raw = new Map<number, string>();
  const bad = new Set<number>();
  const forward = (seat: number, vis: string) => {
    if (vis.length > sent) {
      emit(vis.slice(sent));
      sent = vis.length;
    }
    void seat;
  };
  return {
    tokens(seat) {
      return (delta) => {
        const all = (raw.get(seat) ?? "") + delta;
        raw.set(seat, all);
        if ((leader !== -1 && leader !== seat) || bad.has(seat)) return;
        const vis = visibleText(all);
        if (leader === -1) {
          // Wait for enough text, ending on a word boundary, then check it.
          if (vis.length < minChars || !/\s$/.test(vis)) return;
          if (!assessOutput(vis, { prompt: opts.prompt }).ok) { bad.add(seat); return; }
          leader = seat;
        }
        forward(seat, vis);
      };
    },
    complete(seat, text) {
      if (!raw.has(seat) || bad.has(seat) || (leader !== -1 && leader !== seat)) return;
      if (leader === -1) leader = seat;
      const vis = visibleText(text);
      if (vis.startsWith(visibleText(raw.get(seat) ?? "").slice(0, sent))) forward(seat, vis);
    },
    get started() { return sent > 0; },
    get leader() { return leader; },
  };
}
