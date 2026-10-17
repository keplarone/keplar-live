"use client";

import { useEffect } from "react";

const RANGE = 120; // px around a control where the light starts

/**
 * One global pointer listener (no per-button listeners). While a fine pointer moves, controls marked
 * data-lit within RANGE get --lx/--ly/--lp. Frame-throttled, touches only nearby controls, idle when the
 * pointer is still, off for touch, reduced motion and hidden tabs.
 */
export function ProximityLight() {
  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!fine.matches || reduce.matches) return;
    let raf = 0;
    let x = 0;
    let y = 0;
    let lit: HTMLElement[] = [];
    const clear = (el: HTMLElement) => el.style.removeProperty("--lp");
    const frame = () => {
      raf = 0;
      if (document.hidden) return;
      const now = new Set<HTMLElement>();
      const nodes = document.querySelectorAll<HTMLElement>("[data-lit]");
      nodes.forEach((el) => {
        // Composer and glass stay still. A proximity write on them restamps the lens and duplicates type.
        if (el.closest("[data-glass-pill], [data-glass-chip], [data-composer]")) return;
        const r = el.getBoundingClientRect();
        if (r.bottom < y - RANGE || r.top > y + RANGE || r.right < x - RANGE || r.left > x + RANGE) return;
        const dx = Math.max(r.left - x, 0, x - r.right);
        const dy = Math.max(r.top - y, 0, y - r.bottom);
        const d = Math.hypot(dx, dy);
        if (d > RANGE) return;
        el.style.setProperty("--lx", `${(x - r.left).toFixed(0)}px`);
        el.style.setProperty("--ly", `${(y - r.top).toFixed(0)}px`);
        el.style.setProperty("--lp", (1 - d / RANGE).toFixed(2));
        now.add(el);
      });
      for (const el of lit) if (!now.has(el)) clear(el);
      lit = [...now];
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      x = e.clientX;
      y = e.clientY;
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const onLeave = () => {
      lit.forEach(clear);
      lit = [];
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
      lit.forEach(clear);
    };
  }, []);
  return null;
}
