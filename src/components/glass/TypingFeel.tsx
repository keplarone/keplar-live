"use client";

import { useEffect } from "react";

/**
 * Typing feel, part 1: keep the browser's native undo stack intact in controlled textareas.
 *
 * React syncs a controlled <textarea>'s `defaultValue` (its child text node) on every keystroke. In Chromium that
 * rewrite splits native undo into per-character steps (the "first typed character is its own undo step" bug).
 * `defaultValue` only matters for form reset, so while a textarea has focus (the user is typing) the write is skipped;
 * it is applied normally when the element is not focused (initial render, programmatic changes, SSR hydration).
 * Nothing else about the element is changed: value, caret, selection, IME and input events are all native.
 */
export function TypingFeel() {
  useEffect(() => {
    const proto = HTMLTextAreaElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "defaultValue");
    if (!desc?.set || !desc.configurable) return;
    const original = desc.set;
    Object.defineProperty(proto, "defaultValue", {
      ...desc,
      set(this: HTMLTextAreaElement, v: string) {
        if (document.activeElement === this && this.value === v) return;
        original.call(this, v);
      },
    });
    return () => {
      Object.defineProperty(proto, "defaultValue", desc);
    };
  }, []);

  // Typing feel, part 2: a textarea keeps wheel/touch scroll to itself (overscroll-behavior: contain in globals.css) only
  // while its text actually overflows. Measured lazily, one rAF per element, on hover, focus and input.
  useEffect(() => {
    const pending = new Set<HTMLTextAreaElement>();
    let raf = 0;
    const flush = () => {
      raf = 0;
      for (const t of pending) t.toggleAttribute("data-scrolls", t.scrollHeight > t.clientHeight + 1);
      pending.clear();
    };
    const on = (e: Event) => {
      if (!(e.target instanceof HTMLTextAreaElement)) return;
      pending.add(e.target);
      if (!raf) raf = requestAnimationFrame(flush);
    };
    const opts = { capture: true, passive: true } as const;
    for (const type of ["input", "focusin", "pointerover"]) document.addEventListener(type, on, opts);
    return () => {
      for (const type of ["input", "focusin", "pointerover"]) document.removeEventListener(type, on, opts);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return null;
}
