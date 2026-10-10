"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { motion } from "@/lib/tokens";

/**
 * Wraps an interactive element and lets it lean toward the pointer by a few
 * pixels. Disabled for coarse pointers and reduced motion.
 */
export function Magnetic({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduce) return;

    const { strength, maxOffset, lerp } = motion.magnet;
    let tx = 0, ty = 0, x = 0, y = 0, raf = 0, active = false;

    const tick = () => {
      x += (tx - x) * lerp;
      y += (ty - y) * lerp;
      el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
      if (active || Math.abs(x) > 0.05 || Math.abs(y) > 0.05) raf = requestAnimationFrame(tick);
      else { el.style.transform = ""; raf = 0; }
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      tx = Math.max(-maxOffset, Math.min(maxOffset, dx * strength));
      ty = Math.max(-maxOffset, Math.min(maxOffset, dy * strength));
      active = true;
      kick();
    };
    const onLeave = () => { tx = 0; ty = 0; active = false; kick(); };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <span ref={ref} data-magnetic="" className={className} style={{ display: "inline-flex", willChange: "transform" }}>
      {children}
    </span>
  );
}
