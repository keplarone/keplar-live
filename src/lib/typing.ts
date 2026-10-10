/**
 * Typing animation maths (pure: no DOM, no React), shared by the hook and the tests.
 *
 * The answer text arrives faster (and in bigger lumps) than anyone can read. The reveal
 * runs on its own clock: a steady base pace that speeds up in proportion to how far the
 * stream is ahead (so it always catches up within a few seconds), eased so the speed
 * never jumps, with a short natural pause at sentence ends while it is not catching up.
 * Words appear whole (the visible text is always cut at a word boundary), which keeps
 * half-typed words from hopping to the next line.
 */

import { hasMathHint, maskMath, unmaskMath } from "@/lib/math/extract";

export const TYPING = {
  /** Steady pace when the stream is not ahead, characters per second. */
  baseCps: 58,
  /** Upper bound while catching up. */
  maxCps: 480,
  /** The backlog is cleared in about this long (before the cap). */
  catchUpSeconds: 1.2,
  /** Time constant for easing speed changes. */
  smoothingMs: 240,
  /** Pause after . ! ? : when the reveal is close behind the stream. */
  sentencePauseMs: 130,
  /** Backlog (characters) under which sentence pauses apply. */
  pauseBelowBacklog: 70,
  /** A single frame longer than this (tab was busy) is treated as this long, so a hiccup never teleports the reveal. */
  maxFrameMs: 100,
  /** When frames stay that slow (a weak GPU, a loaded machine, a heavy canvas) the clock is real time up to this per frame: the reveal takes seconds, not frames. */
  slowFrameMaxMs: 1000,
} as const;

/** The longest step one frame may advance the reveal: 100 ms normally, up to a second once two frames in a row were slower than that. */
export function frameCap(prevDtMs: number, dtMs: number): number {
  return prevDtMs > TYPING.maxFrameMs && dtMs > TYPING.maxFrameMs ? TYPING.slowFrameMaxMs : TYPING.maxFrameMs;
}

export type TypingState = { pos: number; cps: number; pauseMs: number };
export const initialTyping = (pos = 0): TypingState => ({ pos, cps: TYPING.baseCps, pauseMs: 0 });

/** Characters per second the reveal is aiming for. */
export function desiredCps(backlog: number): number {
  if (backlog <= 0) return TYPING.baseCps;
  return Math.min(TYPING.maxCps, Math.max(TYPING.baseCps, backlog / TYPING.catchUpSeconds));
}

/** Advance the reveal by one frame. `text` is the full target (used for sentence pauses). */
export function stepTyping(state: TypingState, dtMs: number, text: string, maxFrameMs: number = TYPING.maxFrameMs): TypingState {
  const len = text.length;
  if (state.pos >= len) return { ...state, pos: len, pauseMs: 0 };
  const dt = Math.min(Math.max(dtMs, 0), maxFrameMs);
  if (state.pauseMs > 0) return { ...state, pauseMs: Math.max(0, state.pauseMs - dt) };
  const backlog = len - state.pos;
  const want = desiredCps(backlog);
  const cps = state.cps + (want - state.cps) * (1 - Math.exp(-dt / TYPING.smoothingMs));
  const before = Math.floor(state.pos);
  const pos = Math.min(len, state.pos + (cps * dt) / 1000);
  let pauseMs = 0;
  const after = Math.floor(pos);
  if (after > before && backlog < TYPING.pauseBelowBacklog && after < len) {
    // A sentence end between the old and new position, followed by whitespace: breathe.
    for (let i = before; i < after; i++) {
      if (/[.!?:]/.test(text[i]) && /\s/.test(text[i + 1] ?? "")) {
        pauseMs = TYPING.sentencePauseMs;
        break;
      }
    }
  }
  return { pos, cps, pauseMs };
}

/**
 * The text to show for a reveal position: cut at a word boundary (only whole words show),
 * everything when the position reached the end. A first word that is still being typed shows nothing yet.
 */
export function visibleText(text: string, pos: number): string {
  const end = Math.floor(pos);
  if (end >= text.length) return text;
  if (end <= 0) return "";
  // Already on a boundary (the next character is whitespace): the word is whole.
  if (/\s/.test(text[end])) return text.slice(0, end);
  let i = end;
  while (i > 0 && !/\s/.test(text[i - 1])) i--;
  return text.slice(0, i).replace(/[ \t]+$/, "");
}

/** Length of the longest shared prefix (the reveal keeps its place when the text is extended or only its tail changes). */
export function commonPrefixLen(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  return i;
}

const FENCE = /^\s*```/;
const BLOCK_START = /^\s*([-*+]\s|\d+[.)]\s|#{1,4}\s|>|\|)/;

/**
 * Make a half-revealed Markdown string render like its finished self: no raw `**`, backticks,
 * half links or marker-only lines flash on screen and then change shape. Code fences are left
 * alone (the renderer already treats an unclosed fence as open). Pure and idempotent.
 */
export function healMarkdown(partial: string): string {
  if (!partial) return partial;
  if (hasMathHint(partial)) {
    // Math is healed around, never inside: an unfinished formula is held back until its closing delimiter arrives, and
    // finished ones are masked so their `_`, `*` and `[` are not mistaken for emphasis or a half-typed link.
    const { text, items } = maskMath(partial, true);
    return unmaskMath(healPlain(text), items);
  }
  return healPlain(partial);
}

function healPlain(partial: string): string {
  if (!partial) return partial;
  const lines = partial.replace(/\r\n?/g, "\n").split("\n");
  const fences = lines.filter((l) => FENCE.test(l)).length;
  if (fences % 2 === 1) {
    // Inside an open code block: only a half-typed opening fence needs hiding.
    return /^\s*`{1,2}$/.test(lines[lines.length - 1]) ? lines.slice(0, -1).join("\n") : partial;
  }
  let last = lines[lines.length - 1];
  // Half-typed fence at the start of a line.
  if (/^\s*`{1,2}$/.test(last)) return lines.slice(0, -1).join("\n");
  // A line that is only a block marker ("-", "1.", "##", ">") is not a list/heading/quote yet.
  if (/^\s*([-*+]|\d+[.)]?|#{1,4}|>)\s*$/.test(last) && last.trim() !== "") return lines.slice(0, -1).join("\n");
  // A table is only a table once its header and separator rows are both there: until then it reads as a line of pipes.
  let t0 = lines.length;
  while (t0 > 0 && /^\s*\|/.test(lines[t0 - 1])) t0--;
  if (t0 < lines.length && !(lines.length - t0 >= 2 && /^\s*\|?\s*:?-{2,}/.test(lines[t0 + 1]))) return lines.slice(0, t0).join("\n");

  // The span the inline markers belong to: the last line for list/heading/quote/table lines, else the paragraph.
  let start = lines.length - 1;
  if (!BLOCK_START.test(last)) {
    while (start > 0 && lines[start - 1].trim() !== "" && !BLOCK_START.test(lines[start - 1]) && !FENCE.test(lines[start - 1])) start--;
  }
  const head = lines.slice(0, start);
  let tail = lines.slice(start).join("\n");
  last = tail;

  // Half-typed link: "[label](http://par" → "label"; "[label" → "label".
  tail = tail.replace(/\[([^\]\n]*)\]\([^)\s]*$/, "$1").replace(/\[([^\]\n]*)$/, "$1");
  tail = closeInline(tail);
  void last;
  return [...head, tail].join("\n");
}

/** Close whatever inline spans a partial line leaves open (code, bold, italic), in nesting order. */
function closeInline(text: string): string {
  const m = text.match(/^(\s*[-*+]\s+)([\s\S]*)$/);
  const lead = m ? m[1] : "";
  let body = m ? m[2] : text;
  // A trailing lone "*" might become "**" on the next character: wait for it.
  if (/(^|[^*])\*$/.test(body)) body = body.slice(0, -1);
  const stack: string[] = [];
  for (let i = 0; i < body.length; ) {
    const top = stack[stack.length - 1];
    if (top === "`") {
      if (body[i] === "`") stack.pop();
      i++;
    } else if (body[i] === "`") {
      stack.push("`");
      i++;
    } else if (body.startsWith("**", i)) {
      if (stack.includes("**")) {
        while (stack.pop() !== "**");
      } else stack.push("**");
      i += 2;
    } else if (body[i] === "*") {
      if (stack.includes("*")) {
        while (stack.pop() !== "*");
      } else if (i + 1 < body.length && !/\s/.test(body[i + 1])) stack.push("*");
      i++;
    } else i++;
  }
  return lead + body + stack.reverse().join("");
}
