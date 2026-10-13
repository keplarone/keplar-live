"use client";

import { useEffect } from "react";
import { CARET_INPUT_TYPES, MIRROR_MAX_CHARS, MIRROR_PROPS, caretStep, settled, smoothCaretAllowed } from "@/lib/typing/smooth";

/**
 * Smooth caret: the caret glides between positions (a short exponential ease, like Word / VS Code "smooth caret animation").
 *
 * VISUAL ONLY. The field is never wrapped, replaced, re-rendered or delayed: no listener here sits on the keystroke path (everything is
 * measured in the next animation frame after `selectionchange` / `input`), so typing, IME, selection, undo and paste are exactly the native ones.
 * The native caret is hidden (caret-color: transparent) only while our overlay is showing; on ANY problem (exception, composition, a range
 * selection, a long document, reduced motion, forced colors, opt-out data-smooth-caret="off", localStorage keplar-smooth=off) the native caret is back
 * at once. In overtype mode (INS/OVR, html[data-typing-mode="ovr"]) the overlay is a block as wide as the character it will replace.
 * Position comes from a mirrored copy of the field's text measured up to the caret (one hidden element, reused).
 */
type Field = HTMLTextAreaElement | HTMLInputElement;

const isField = (el: EventTarget | null): el is Field => {
  if (el instanceof HTMLTextAreaElement) return true;
  return el instanceof HTMLInputElement && CARET_INPUT_TYPES.has(el.type);
};

export function SmoothCaret() {
  useEffect(() => {
    let off = false;
    try { off = localStorage.getItem("keplar-smooth") === "off"; } catch { /* storage blocked: stays on */ }
    const env = () => ({
      finePointer: true, // the caret is also useful with a hardware keyboard on a tablet
      reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
      forcedColors: matchMedia("(forced-colors: active)").matches,
      off,
    });
    if (!smoothCaretAllowed(env())) return;

    let field: Field | null = null;
    let composing = false;
    let mirror: HTMLDivElement | null = null;
    let caret: HTMLDivElement | null = null;
    let cur = { x: 0, y: 0 };
    let target = { x: 0, y: 0, h: 18, w: 2 };
    let shown = false;
    let raf = 0, measureRaf = 0, last = 0, moveT = 0;

    const ensure = () => {
      if (!caret) {
        caret = document.createElement("div");
        caret.className = "smooth-caret";
        caret.setAttribute("aria-hidden", "true");
        document.body.appendChild(caret);
      }
      if (!mirror) {
        mirror = document.createElement("div");
        mirror.setAttribute("aria-hidden", "true");
        mirror.style.cssText = "position:fixed;left:-9999px;top:0;visibility:hidden;pointer-events:none;overflow:hidden;contain:strict;";
        document.body.appendChild(mirror);
      }
    };
    const native = (f: Field | null) => { if (f) f.removeAttribute("data-sc"); };
    const hide = () => {
      shown = false;
      if (caret) caret.style.visibility = "hidden";
      native(field);
    };
    const fail = () => { hide(); off = true; document.querySelectorAll("[data-sc]").forEach((e) => e.removeAttribute("data-sc")); };

    /** Caret rectangle (viewport coordinates) from the mirror. */
    const measure = (f: Field) => {
      ensure();
      const m = mirror as HTMLDivElement;
      const cs = getComputedStyle(f);
      const ms = m.style as unknown as Record<string, string>;
      for (const p of MIRROR_PROPS) ms[p] = (cs as unknown as Record<string, string>)[p];
      const multi = f instanceof HTMLTextAreaElement;
      m.style.whiteSpace = multi ? "pre-wrap" : "pre";
      m.style.overflowWrap = multi ? "break-word" : "normal";
      m.style.height = "auto";
      // the field's text box (a scrollbar narrows it): same width, so the lines wrap in the same places
      m.style.width = `${f.clientWidth + (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0)}px`;
      m.style.overflow = "hidden";
      const pos = f.selectionStart ?? 0;
      const v = f.value;
      m.textContent = "";
      m.appendChild(document.createTextNode(v.slice(0, pos)));
      const mark = document.createElement("span");
      // the character the caret sits before gives the block width in overtype mode; a zero-width space keeps an empty tail measurable
      const ahead = v.slice(pos, pos + 1);
      mark.textContent = ahead && ahead !== "\n" ? ahead : "\u200b";
      m.appendChild(mark);
      m.appendChild(document.createTextNode(v.slice(pos + 1) || "\u200b"));
      const mr = m.getBoundingClientRect();
      const kr = mark.getBoundingClientRect();
      const fr = f.getBoundingClientRect();
      const bl = parseFloat(cs.borderLeftWidth) || 0, bt = parseFloat(cs.borderTopWidth) || 0;
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.25;
      const x = fr.left + bl + (kr.left - mr.left) - f.scrollLeft;
      let y = fr.top + bt + (kr.top - mr.top) - f.scrollTop;
      const h = kr.height || lh;
      // A one-line <input> taller than its text centres the text vertically (the mirror lays it out from the top), so a
      // 52px command bar drew the caret above the text. Centre it in the content box the same way the browser does.
      if (!multi) {
        const pt = parseFloat(cs.paddingTop) || 0, pb = parseFloat(cs.paddingBottom) || 0, bb = parseFloat(cs.borderBottomWidth) || 0;
        const content = fr.height - bt - bb - pt - pb;
        y = fr.top + bt + pt + Math.max(0, (content - h) / 2);
      }
      return { x, y, h, w: kr.width, fr, bl, bt, cs };
    };

    const place = () => {
      measureRaf = 0;
      try {
        const f = field;
        if (!f || composing || off || !document.hasFocus() || document.activeElement !== f || f.hasAttribute("data-smooth-caret-off") || f.getAttribute("data-smooth-caret") === "off") return hide();
        if (f.disabled || f.readOnly || f.value.length > MIRROR_MAX_CHARS || f.selectionStart !== f.selectionEnd) return hide();
        const r = measure(f);
        const inside = r.x >= r.fr.left && r.x <= r.fr.right + 1 && r.y + r.h >= r.fr.top && r.y <= r.fr.bottom;
        if (!inside) return hide(); // scrolled out of the field's visible box: let the browser handle it
        const ovr = document.documentElement.dataset.typingMode === "ovr";
        target = { x: r.x, y: r.y, h: r.h, w: ovr ? Math.max(6, r.w) : 2 };
        ensure();
        const c = caret as HTMLDivElement;
        c.style.height = `${target.h}px`;
        c.style.width = `${target.w}px`;
        c.dataset.block = ovr ? "1" : "";
        c.style.color = r.cs.color;
        c.style.visibility = "visible";
        if (!shown) { cur = { x: target.x, y: target.y }; shown = true; paint(); c.style.visibility = "visible"; }
        f.setAttribute("data-sc", "");
        moveT = performance.now();
        c.dataset.moving = "1";
        if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
      } catch { fail(); }
    };
    const schedule = () => { if (!measureRaf) measureRaf = requestAnimationFrame(place); };
    const paint = () => { if (caret) caret.style.transform = `translate3d(${cur.x.toFixed(2)}px, ${cur.y.toFixed(2)}px, 0)`; };
    const tick = (now: number) => {
      raf = 0;
      try {
        const dt = now - last; last = now;
        const s = caretStep(cur, target, dt);
        cur = { x: s.x, y: s.y };
        paint();
        if (!settled(cur.x, target.x) || !settled(cur.y, target.y)) { raf = requestAnimationFrame(tick); return; }
        cur = { x: target.x, y: target.y }; paint();
        // arrived: blink again after a beat (the caret stays solid while it moves or while typing)
        window.setTimeout(() => { if (caret && performance.now() - moveT > 380) delete caret.dataset.moving; }, 400);
      } catch { fail(); }
    };

    const onFocusIn = (e: FocusEvent) => {
      if (isField(e.target)) { field = e.target; composing = false; schedule(); }
    };
    const onFocusOut = (e: FocusEvent) => { if (e.target === field) { hide(); field = null; } };
    const onSel = () => { if (field && document.activeElement === field) schedule(); };
    const onScroll = (e: Event) => { if (field && (e.target === field || e.target === document || (e.target instanceof Node && e.target.contains(field)))) schedule(); };
    const onComp = (e: Event) => { composing = e.type === "compositionstart"; if (composing) hide(); else schedule(); };
    const onMode = () => schedule();

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("selectionchange", onSel);
    document.addEventListener("input", onSel, true);
    document.addEventListener("keyup", onSel, true); // arrows / home / end where selectionchange is coalesced
    document.addEventListener("compositionstart", onComp, true);
    document.addEventListener("compositionend", onComp, true);
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", onMode);
    const mo = new MutationObserver(onMode);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-typing-mode"] });
    if (isField(document.activeElement)) { field = document.activeElement; schedule(); }
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("selectionchange", onSel);
      document.removeEventListener("input", onSel, true);
      document.removeEventListener("keyup", onSel, true);
      document.removeEventListener("compositionstart", onComp, true);
      document.removeEventListener("compositionend", onComp, true);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onMode);
      mo.disconnect();
      if (raf) cancelAnimationFrame(raf);
      if (measureRaf) cancelAnimationFrame(measureRaf);
      native(field);
      caret?.remove();
      mirror?.remove();
    };
  }, []);
  return null;
}
