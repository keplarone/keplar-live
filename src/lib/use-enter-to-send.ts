"use client";

import { useCallback, useEffect, useRef, type FormEvent, type KeyboardEvent } from "react";
import {
  applyComposerBeforeInput,
  applyComposerInput,
  applyComposerKeyDown,
  type EnterDecision,
  type EnterSendOpts,
} from "./enter-to-send";

type Flag = boolean | (() => boolean);

export type UseEnterToSendOptions = {
  /** False for empty/whitespace, a busy send, or a streaming reply. Read at key time, so a function sees the live value. */
  canSend: Flag;
  onSend: () => void;
  /** Settings → Chat → Send with. Omitted means Enter sends. */
  sendKey?: EnterSendOpts["sendKey"];
  /** Slash-command or mode menu. Enter picks the highlighted item instead of sending. */
  menuOpen?: Flag;
  onMenuSelect?: () => void;
};

export type EnterToSendHandlers = {
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onBeforeInput: (e: FormEvent<HTMLTextAreaElement>) => void;
  /** Phones label the return key Send. Ctrl/⌘+Enter keeps it as a newline. */
  enterKeyHint: "send" | "enter";
};

function readFlag(v: Flag | undefined, fallback = false): boolean {
  if (typeof v === "function") return v();
  return v ?? fallback;
}

/** Per-textarea bookkeeping. Not a React ref, so render never reads it. */
type Box = { decision: EnterDecision | null; handled: boolean };
const boxes = new WeakMap<HTMLTextAreaElement, Box>();
const cleanups = new WeakMap<HTMLTextAreaElement, () => void>();

function slot(el: HTMLTextAreaElement): Box {
  let box = boxes.get(el);
  if (!box) {
    box = { decision: null, handled: false };
    boxes.set(el, box);
  }
  return box;
}

/** keydown and the input that follows share one turn; the next Enter is a later turn. */
function actOnce(el: HTMLTextAreaElement, fn: () => void) {
  const box = slot(el);
  if (box.handled) return;
  box.handled = true;
  fn();
  setTimeout(() => { box.handled = false; }, 0);
}

function optsOf(opts: UseEnterToSendOptions): EnterSendOpts {
  return {
    canSend: readFlag(opts.canSend),
    sendKey: opts.sendKey,
    menuOpen: readFlag(opts.menuOpen),
  };
}

/**
 * Enter sends, Shift+Enter inserts a newline.
 * The callback is separate from the handlers: passing the handlers object to `ref` makes the
 * compiler treat every field as a ref. Phones that ignore keydown preventDefault are caught
 * by a native beforeinput/input listener on the textarea.
 */
export function useEnterToSend(opts: UseEnterToSendOptions): [(node: HTMLTextAreaElement | null) => void, EnterToSendHandlers] {
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });

  const bound = useRef<HTMLTextAreaElement | null>(null);
  const ref = useCallback((next: HTMLTextAreaElement | null) => {
    const prev = bound.current;
    if (prev === next) return;
    if (prev) cleanups.get(prev)?.();
    bound.current = next;
    if (!next) return;
    const onBefore = (ev: Event) => applyComposerBeforeInput(ev as InputEvent, slot(next));
    const onInput = (ev: Event) => {
      applyComposerInput(next, ev as InputEvent, slot(next), () => actOnce(next, () => optsRef.current.onSend()));
    };
    next.addEventListener("beforeinput", onBefore, true);
    next.addEventListener("input", onInput, true);
    cleanups.set(next, () => {
      next.removeEventListener("beforeinput", onBefore, true);
      next.removeEventListener("input", onInput, true);
    });
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const decision = applyComposerKeyDown({
      key: e.key,
      shiftKey: e.shiftKey,
      metaKey: e.metaKey,
      ctrlKey: e.ctrlKey,
      altKey: e.altKey,
      repeat: e.repeat,
      preventDefault: () => e.preventDefault(),
      nativeEvent: e.nativeEvent,
    }, optsOf(opts), slot(el));
    if (decision === "newline" || e.repeat) return;
    if (decision === "menu") actOnce(el, () => opts.onMenuSelect?.());
    else if (decision === "send") actOnce(el, () => opts.onSend());
  };

  const onBeforeInput = (e: FormEvent<HTMLTextAreaElement>) => {
    applyComposerBeforeInput(e.nativeEvent as InputEvent, slot(e.currentTarget));
  };

  const sendKey = opts.sendKey ?? "enter";
  return [ref, {
    onKeyDown,
    onBeforeInput,
    enterKeyHint: sendKey === "mod-enter" ? "enter" : "send",
  }];
}
