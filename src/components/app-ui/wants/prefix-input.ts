/**
 * The Keplar Wants composer keeps "I want " fixed at the start of the text box: it can't be deleted, cut, selected,
 * typed over or pasted over, and the caret can't move into it. Pure helpers (tests/wants-prefix.test.ts); the component
 * wires them to onSelect / onKeyDown / onPaste / onCut / onChange in KeplarWantsTab.tsx.
 *
 * The rules, for a prefix of length P:
 *  - selection: both ends are clamped to >= P (click, drag, Shift+Home, Ctrl/Cmd+A, touch handles);
 *  - Backspace at P deletes nothing; with Ctrl/Alt/Cmd (word / line delete) it deletes only text after P;
 *  - Home, Ctrl/Cmd+Up and Ctrl/Cmd+Home put the caret at P instead of 0;
 *  - paste / cut / typing replace only the part of the selection after P;
 *  - any change that still arrives without the prefix (IME, autocorrect, a browser extension) is rejected and the
 *    previous value is restored, so the invariant `value.startsWith(PREFIX)` always holds.
 */
export const PREFIX = "I want ";
export const P = PREFIX.length;

export type Sel = { start: number; end: number };

export function clampSel(sel: Sel, p = P): Sel {
  const start = Math.max(p, Math.min(sel.start, sel.end));
  const end = Math.max(p, Math.max(sel.start, sel.end));
  return { start, end };
}

/** The value after replacing the (clamped) selection with `insert`, and where the caret goes. */
export function replaceSel(value: string, sel: Sel, insert: string, p = P): { value: string; caret: number } {
  const { start, end } = clampSel(sel, p);
  const v = value.slice(0, start) + insert + value.slice(end);
  return { value: normalise(v, p), caret: Math.min(start + insert.length, normalise(v, p).length) };
}

/** Text after the prefix, with a pasted/typed duplicate "I want" at its start removed. */
export function userText(value: string): string {
  return value.startsWith(PREFIX) ? value.slice(P).replace(/^\s*i\s+want\s+/i, "") : value.replace(/^\s*i\s+want\s*/i, "");
}

function normalise(v: string, p: number): string {
  const head = v.slice(0, p);
  return head + v.slice(p).replace(/^\s*i\s+want\s+/i, "");
}

/** Start of the word before `pos`, never before p (Ctrl/Alt+Backspace). */
export function wordStart(value: string, pos: number, p = P): number {
  let i = pos;
  while (i > p && /\s/.test(value[i - 1]!)) i--;
  while (i > p && !/\s/.test(value[i - 1]!)) i--;
  return Math.max(p, i);
}

export type KeyResult = { prevent: true; value?: string; caret?: number } | { prevent: false };

/** What a key press does to the prefix zone. `prevent` means the component calls preventDefault and applies the result. */
export function onKey(value: string, sel: Sel, key: { key: string; ctrl: boolean; alt: boolean; meta: boolean; shift: boolean }, p = P): KeyResult {
  const { start, end } = { start: Math.min(sel.start, sel.end), end: Math.max(sel.start, sel.end) };
  const mod = key.ctrl || key.meta;
  if (key.key === "Backspace") {
    if (start !== end) {
      if (start >= p) return { prevent: false };
      return { prevent: true, ...replaceSel(value, sel, "", p) };
    }
    if (start <= p) return { prevent: true };
    if (key.meta) return { prevent: true, value: value.slice(0, p) + value.slice(start), caret: p }; // line delete to the prefix
    if (key.ctrl || key.alt) { const w = wordStart(value, start, p); return { prevent: true, value: value.slice(0, w) + value.slice(start), caret: w }; }
    return { prevent: false };
  }
  if (key.key === "Delete") {
    if (start < p) return { prevent: true, ...(end > p ? replaceSel(value, sel, "", p) : {}) };
    return { prevent: false };
  }
  if (key.key === "Home" || (mod && (key.key === "ArrowUp" || key.key === "Home")) || (key.meta && key.key === "ArrowLeft")) {
    return key.shift ? { prevent: true, caret: p } : { prevent: true, caret: p };
  }
  if ((key.key === "ArrowLeft" || key.key === "ArrowUp") && !key.shift && start <= p && end <= p) return { prevent: true, caret: p };
  if (key.key === "ArrowLeft" && !key.shift && start === p && end === p) return { prevent: true, caret: p };
  return { prevent: false };
}

/** A change event's new value, accepted (with the duplicate "I want" removed) or rejected (the previous value stays). */
export function acceptChange(prev: string, next: string, p = P): string {
  if (!next.startsWith(PREFIX)) return prev.startsWith(PREFIX) ? prev : PREFIX;
  return normalise(next, p);
}
