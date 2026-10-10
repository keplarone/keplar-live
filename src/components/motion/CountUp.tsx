"use client";

import { useEffect, useRef } from "react";

/**
 * Counts a price up from 0 once it scrolls into view. The server renders the final text, so crawlers, no-JS and
 * reduced-motion visitors always see the real number; only prices that start below the fold animate.
 * Width is fixed to the final text (tabular figures + min-width), so nothing shifts.
 */
export function CountUp({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    const m = /^\$(\d+)$/.exec(text);
    if (!el || !m || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return;
    const end = Number(m[1]);
    if (end === 0) return;
    el.textContent = "$0";
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / 900);
        el.textContent = `$${Math.round(end * (1 - Math.pow(1 - k, 3)))}`;
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, { threshold: 0.6 });
    io.observe(el);
    // Printing before the price scrolled into view printed "$0": show the real number for paper.
    const finish = () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      el.textContent = text;
    };
    window.addEventListener("beforeprint", finish);
    return () => {
      window.removeEventListener("beforeprint", finish);
      finish();
    };
  }, [text]);
  return (
    <span ref={ref} style={{ fontVariantNumeric: "tabular-nums", display: "inline-block", minWidth: `${text.length}ch` }}>
      {text}
    </span>
  );
}
