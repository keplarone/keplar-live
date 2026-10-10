"use client";

import { useEffect } from "react";
import { INSERT_PREF_EVENT, INSERT_PREF_KEY, insertEnabled, isInsertKey, isTextTarget, overtypeSpan } from "@/lib/typing/insert-mode";

/**
 * Insert-key overtype mode (opt-in, Settings -> Typing). While the setting is on, Insert toggles INS/OVR; in OVR a typed
 * character replaces the next one. The replacement is `execCommand("insertText")` over a one-character selection, so it
 * is a normal input event: React/native undo/redo keep working. A block caret shows in OVR (`caret-shape: block`, where the
 * browser supports it) and a small OVR badge sits above the focused field only while overtype is on (clicking it switches back).
 * Normal insert mode shows nothing; switching back to insert flashes "INS" for a moment, then the badge goes. On by default; with
 * the setting off this does nothing: no listeners fire work and the Insert key is untouched. The keystroke path does no layout
 * reads, and focusing a field in insert mode creates nothing.
 */
function readPref(): boolean {
  try {
    return insertEnabled(localStorage.getItem(INSERT_PREF_KEY));
  } catch {
    return true; // storage blocked: the default (enabled) applies
  }
}

export function InsertMode() {
  useEffect(() => {
    let enabled = readPref();
    let ovr = false;
    let field: HTMLElement | null = null;
    let badge: HTMLButtonElement | null = null;
    let ro: ResizeObserver | null = null;
    let flash = 0; // the brief "INS" confirmation after leaving overtype
    const root = document.documentElement;
    const FLASH_MS = 1200;

    const paintBadge = () => {
      if (!badge) return;
      badge.textContent = ovr ? "OVR" : "INS";
      badge.dataset.mode = ovr ? "ovr" : "ins";
      badge.setAttribute("aria-label", ovr ? "OVR" : "INS"); // accessible name == visible text (WCAG 2.5.3 / axe label-content-name-mismatch)
      badge.title = ovr ? "Overtype on. Press Insert to switch back to insert." : "Insert mode. Press Insert to switch to overtype.";
    };
    const place = () => {
      if (!badge || !field) return;
      const r = field.getBoundingClientRect();
      badge.style.transform = `translate(${Math.max(8, Math.round(r.right - 52))}px, ${Math.max(6, Math.round(r.top - 26))}px)`;
    };
    const ensureBadge = () => {
      if (badge) return badge;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ins-badge";
      b.tabIndex = -1;
      b.addEventListener("mousedown", (e) => e.preventDefault()); // clicking must not steal focus from the field
      b.addEventListener("click", () => setMode(!ovr));
      document.body.appendChild(b);
      badge = b;
      return b;
    };
    const removeBadge = () => {
      window.clearTimeout(flash);
      ro?.disconnect();
      ro = null;
      badge?.remove();
      badge = null;
    };
    const hideBadge = () => {
      removeBadge();
      field = null;
    };
    /** Show the badge over the current field (only while overtype is on, or for the brief INS flash). */
    const showBadge = () => {
      if (!field) return;
      window.clearTimeout(flash);
      ensureBadge();
      paintBadge();
      place();
      if (!ro) {
        ro = new ResizeObserver(place); // runs after layout, so the badge follows an auto-growing composer without a forced reflow
        ro.observe(field);
      }
    };
    const setMode = (next: boolean) => {
      ovr = next;
      if (enabled) root.dataset.typingMode = ovr ? "ovr" : "ins";
      if (ovr) showBadge();
      else if (badge) {
        paintBadge(); // flash "INS", then get out of the way
        flash = window.setTimeout(removeBadge, FLASH_MS);
      }
    };
    const apply = () => {
      if (!enabled) {
        ovr = false;
        delete root.dataset.typingMode;
        hideBadge();
      } else {
        root.dataset.typingMode = ovr ? "ovr" : "ins";
      }
    };

    const onFocusIn = (e: FocusEvent) => {
      if (!enabled || !isTextTarget(e.target)) return;
      if (field !== e.target) removeBadge();
      field = e.target;
      if (ovr) showBadge(); // insert mode is the normal state: nothing to show
    };
    const onFocusOut = (e: FocusEvent) => {
      if (e.target === field) hideBadge();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (!enabled) return;
      const el = e.target;
      if (!isTextTarget(el)) return;
      if (isInsertKey(e)) {
        e.preventDefault();
        if (field !== el) onFocusIn({ target: el } as unknown as FocusEvent); // focus landed before this ran (autofocus): track the field now
        setMode(!ovr);
        return;
      }
      if (!ovr) return;
      const n = overtypeSpan({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, isComposing: e.isComposing, keyCode: e.keyCode, altGraph: e.getModifierState?.("AltGraph") }, el.value, el.selectionStart, el.selectionEnd);
      if (!n) return;
      const at = el.selectionStart as number;
      e.preventDefault();
      el.setSelectionRange(at, at + n);
      if (!document.execCommand("insertText", false, e.key)) {
        // execCommand unavailable: same result without native undo
        el.setRangeText(e.key, at, at + n, "end");
        el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: e.key }));
      }
    };
    const onScroll = () => place();
    const onPref = () => {
      enabled = readPref();
      apply();
      if (enabled && isTextTarget(document.activeElement)) onFocusIn({ target: document.activeElement } as unknown as FocusEvent);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === INSERT_PREF_KEY) onPref();
    };

    apply();
    if (enabled && isTextTarget(document.activeElement)) onFocusIn({ target: document.activeElement } as unknown as FocusEvent); // a field focused before hydration
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    window.addEventListener(INSERT_PREF_EVENT, onPref);
    window.addEventListener("storage", onStorage);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener(INSERT_PREF_EVENT, onPref);
      window.removeEventListener("storage", onStorage);
      delete root.dataset.typingMode;
      hideBadge();
    };
  }, []);
  return null;
}
