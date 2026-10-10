"use client";

import { useEffect } from "react";

/**
 * On-screen keyboard on phones. iOS Safari and Chrome on Android keep the LAYOUT viewport full height and slide the keyboard over it,
 * so a `position: fixed; inset: 0` app shell (the /app composer dock, the Create prompt) ends up under the keyboard. While an editable
 * field is focused and the VISUAL viewport is clearly shorter than the layout viewport, this publishes its box as
 * `--vv-top` / `--vv-h` on <html> and sets `data-kb`; the shell (App.module.css) then sizes itself to that box, so the composer sits
 * right above the keys. It sets nothing otherwise (no pinch-zoom, no address-bar collapse, no desktop), so the normal layout
 * (100dvh, inset: 0) is untouched. Where the browser already resizes the layout viewport (interactive-widget=resizes-content, Android
 * Firefox) innerHeight shrinks with it, the gap is 0 and this does nothing.
 */
const EDITABLE = "input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit]):not([type=file]), textarea, select, [contenteditable=''], [contenteditable='true']";

export function ViewportKeyboard() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    let raf = 0;
    const clear = () => {
      if (!root.hasAttribute("data-kb")) return;
      root.removeAttribute("data-kb");
      root.style.removeProperty("--vv-top");
      root.style.removeProperty("--vv-h");
    };
    const apply = () => {
      raf = 0;
      const editing = document.activeElement instanceof Element && document.activeElement.matches(EDITABLE);
      const gap = window.innerHeight - vv.height - vv.offsetTop; // px of the layout viewport the keyboard covers
      if (!editing || vv.scale > 1.02 || gap < 120) return clear();
      root.setAttribute("data-kb", "");
      root.style.setProperty("--vv-top", `${Math.max(0, Math.round(vv.offsetTop))}px`);
      root.style.setProperty("--vv-h", `${Math.round(vv.height)}px`);
    };
    const queue = () => { if (!raf) raf = requestAnimationFrame(apply); };
    vv.addEventListener("resize", queue);
    vv.addEventListener("scroll", queue);
    document.addEventListener("focusin", queue);
    document.addEventListener("focusout", queue);
    return () => {
      vv.removeEventListener("resize", queue);
      vv.removeEventListener("scroll", queue);
      document.removeEventListener("focusin", queue);
      document.removeEventListener("focusout", queue);
      if (raf) cancelAnimationFrame(raf);
      clear();
    };
  }, []);
  return null;
}
