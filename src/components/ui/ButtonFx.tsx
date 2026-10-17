"use client";

import { useEffect } from "react";
import { buttonFxAllowed, magnetOffset } from "@/lib/button-fx";

/**
 * One delegated listener set for every pill control marked data-lit (no per-button listeners, nothing in React state):
 *  - magnetic lean: the control drifts a few px toward the pointer using the CSS `translate` property (composes with the
 *    hover swell / press squash that use `transform`), springs back on leave;
 * Glow-edge light is lit.css + ProximityLight; busy / done states are pure CSS ([aria-busy], [data-state]).
 * Off for touch, reduced motion and data saver. Controls already wrapped by <Magnetic> are skipped.
 */
export function ButtonFx() {
  useEffect(() => {
    const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
    const fine = matchMedia("(hover: hover) and (pointer: fine)");
    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    const ok = () => buttonFxAllowed({ finePointer: fine.matches, reducedMotion: reduce.matches, saveData: !!nav.connection?.saveData });
    let cur: HTMLElement | null = null;
    let raf = 0, px = 0, py = 0;
    const reset = (el: HTMLElement | null) => { if (el) el.style.removeProperty("translate"); };
    const target = (n: EventTarget | null) => {
      const el = n instanceof Element ? n.closest<HTMLElement>("[data-lit]") : null;
      if (!el || el.matches(":disabled,[aria-disabled='true'],[aria-busy='true']") || el.parentElement?.hasAttribute("data-magnetic")) return null;
      if (el.closest("[data-glass-pill], [data-glass-chip], [data-composer]")) return null;
      return el;
    };
    const frame = () => {
      raf = 0;
      if (!cur) return;
      const [x, y] = magnetOffset(px, py, cur.getBoundingClientRect());
      cur.style.translate = `${x.toFixed(1)}px ${y.toFixed(1)}px`;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch" || !ok()) return;
      const el = target(e.target);
      if (el !== cur) { reset(cur); cur = el; }
      if (!el) return;
      px = e.clientX; py = e.clientY;
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const onOut = (e: PointerEvent) => {
      if (!cur) return;
      const to = e.relatedTarget instanceof Node ? e.relatedTarget : null;
      if (to && cur.contains(to)) return;
      reset(cur); cur = null;
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerout", onOut, { passive: true });
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerout", onOut);
      if (raf) cancelAnimationFrame(raf);
      reset(cur);
    };
  }, []);
  return null;
}
