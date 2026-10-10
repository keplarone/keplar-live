"use client";

import { useEffect } from "react";
import { fitElement } from "@/lib/fit-text";

/**
 * Site-wide safety net: every control and chip whose label is wider than its frame is scaled down to fit (min 11px, ellipsis + title
 * only as a last resort). One MutationObserver + one ResizeObserver for the whole document, work done in idle frames, reads before writes.
 * Opt out with data-fit="off". Labels that are allowed to wrap (white-space normal) are left to the browser.
 */
const CANDIDATES = "[data-fit]:not([data-fit='off']), button:not([data-fit='off']), [role='tab']:not([data-fit='off']), [role='menuitem'], [class*='chip'], [class*='pill'], [class*='badge'], [class*='tab'], [class*='btn'], [class*='button']";

export function FitRuntime() {
  useEffect(() => {
    let raf = 0, timer = 0;
    const touched = new Set<HTMLElement>();
    const run = () => {
      raf = 0;
      const nodes = Array.from(document.querySelectorAll<HTMLElement>(CANDIDATES));
      // read pass: which ones overflow (single-line only); write pass: fit those
      const over: HTMLElement[] = [];
      for (const el of nodes) {
        if (el.closest("[data-fit='off']") && el.getAttribute("data-fit") !== "") continue;
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden" || cs.whiteSpace === "normal" || cs.whiteSpace === "pre-wrap") { if (touched.has(el)) { el.style.fontSize = ""; touched.delete(el); } continue; }
        if (el.scrollWidth > el.clientWidth + 1 || touched.has(el)) over.push(el);
      }
      for (const el of over) { fitElement(el); if (el.style.fontSize) touched.add(el); else touched.delete(el); }
    };
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { if (!raf) raf = requestAnimationFrame(run); }, 120);
    };
    schedule();
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener("resize", schedule);
    document.fonts?.ready.then(schedule).catch(() => {});
    return () => { mo.disconnect(); window.removeEventListener("resize", schedule); window.clearTimeout(timer); if (raf) cancelAnimationFrame(raf); };
  }, []);
  return null;
}
