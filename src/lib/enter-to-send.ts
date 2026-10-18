/**
 * Enter in a chat box.
 *
 * A textarea's built-in Enter inserts a newline, and a form does not submit from one. `preventDefault` on keydown
 * stops that in desktop Chrome. Phones often still insert the break (the keydown default is ignored, or only
 * `beforeinput`/`input` fires). Callers therefore also cancel `insertLineBreak`, and if a break lands anyway they
 * remove it and send. Shift+Enter stays a newline. An IME composition (isComposing, or keyCode 229) is left to the
 * browser so a candidate can commit, and is never sent. An open slash or mode menu takes Enter for the highlighted
 * item. Empty or whitespace does nothing and does not insert a newline.
 */
import { composerEnter, readComposerKey, type ComposerEnter, type ComposerKey } from "./composer-keys";

export type EnterDecision = ComposerEnter | "menu";

export type EnterKeyEvent = {
  key: string;
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  repeat?: boolean;
  preventDefault: () => void;
  nativeEvent?: { isComposing?: boolean; keyCode?: number };
};

export type EnterSendOpts = {
  canSend: boolean;
  sendKey?: "enter" | "mod-enter";
  menuOpen?: boolean;
};

export function decideComposerEnter(key: ComposerKey, opts: EnterSendOpts): EnterDecision {
  if (key.key !== "Enter") return "newline";
  const composing = Boolean(key.isComposing) || key.keyCode === 229;
  if (opts.menuOpen && !key.shiftKey && !composing) return "menu";
  if (composing) return "newline";
  return composerEnter(key, { canSend: opts.canSend, sendKey: opts.sendKey });
}

/** Returns the decision. Calls preventDefault for send, swallow and menu, so the textarea does not grow a line. */
export function applyComposerKeyDown(
  e: EnterKeyEvent,
  opts: EnterSendOpts,
  pending: { decision: EnterDecision | null },
): EnterDecision {
  if (e.key !== "Enter") {
    pending.decision = null;
    return "newline";
  }
  const decision = decideComposerEnter(readComposerKey({
    key: e.key,
    shiftKey: Boolean(e.shiftKey),
    metaKey: Boolean(e.metaKey),
    ctrlKey: Boolean(e.ctrlKey),
    nativeEvent: e.nativeEvent,
  }), opts);
  pending.decision = decision;
  if (decision === "newline") return decision;
  e.preventDefault();
  return decision;
}

/** Removes one line break that was just inserted before the caret. Null when there isn't one. */
export function stripInsertedBreak(value: string, caret: number): { value: string; caret: number } | null {
  if (caret >= 2 && value.slice(caret - 2, caret) === "\r\n") {
    return { value: value.slice(0, caret - 2) + value.slice(caret), caret: caret - 2 };
  }
  const code = caret >= 1 ? value.charCodeAt(caret - 1) : 0;
  if (code === 10 || code === 13) {
    return { value: value.slice(0, caret - 1) + value.slice(caret), caret: caret - 1 };
  }
  return null;
}

export type LineBreakEl = {
  value: string;
  selectionStart: number | null;
  setSelectionRange?: (start: number, end: number) => void;
};

/** Writes through the prototype setter so React's value tracker sees it. */
export function writeTextareaValue(el: LineBreakEl, next: string) {
  const proto = typeof HTMLTextAreaElement !== "undefined"
    ? Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
    : undefined;
  if (proto && typeof HTMLTextAreaElement !== "undefined" && el instanceof HTMLTextAreaElement) proto.call(el, next);
  else el.value = next;
}

export function applyComposerBeforeInput(
  e: { inputType?: string; isComposing?: boolean; cancelable?: boolean; preventDefault: () => void },
  pending: { decision: EnterDecision | null },
): void {
  if (e.inputType !== "insertLineBreak") return;
  if (e.isComposing || pending.decision === "newline") return;
  if (e.cancelable === false) return;
  e.preventDefault();
}

/**
 * A line break that got past keydown (common on touch keyboards). Removes it, and sends when that was the intent
 * and keydown itself did not already send. Stops the event so a controlled field does not put the break back.
 */
export function applyComposerInput(
  el: LineBreakEl,
  e: { inputType?: string; isComposing?: boolean; stopPropagation?: () => void },
  pending: { decision: EnterDecision | null },
  onSend: () => void,
): void {
  if (e.inputType !== "insertLineBreak" || e.isComposing) return;
  const decision = pending.decision;
  pending.decision = null;
  if (decision === "newline") return;
  const caret = el.selectionStart ?? el.value.length;
  const repaired = stripInsertedBreak(el.value, caret);
  if (repaired) {
    writeTextareaValue(el, repaired.value);
    el.setSelectionRange?.(repaired.caret, repaired.caret);
  }
  e.stopPropagation?.();
  if (decision === "menu" || decision === "swallow") return;
  if (decision === "send" || (decision === null && el.value.trim().length > 0)) onSend();
}
