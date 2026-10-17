"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from "react";
import { isPhone } from "@/lib/fx/lite";
import { spaceFx } from "@/lib/fx/space-fx";

/** Inline style with CSS custom properties. */
const vars = (v: Record<string, string | number>) => v as CSSProperties;

function Line({ verb, rest, phase, delay }: { verb: string; rest: string; phase: "in" | "out" | "static"; delay: number }) {
  const verbRef = useRef<HTMLSpanElement>(null);
  // Each verb glyph carries a slice of one shared gradient: its offset inside the word, in em, keeps the gradient continuous
  // across the separately animated glyph layers and survives font-size changes.
  useLayoutEffect(() => {
    const word = verbRef.current;
    if (!word) return;
    const measure = () => {
      const fs = parseFloat(getComputedStyle(word).fontSize) || 1;
      word.style.setProperty("--ww", `${word.offsetWidth / fs}em`);
      word.querySelectorAll<HTMLElement>(".sp-hl__ch").forEach((ch) => ch.style.setProperty("--cx", `${ch.offsetLeft / fs}em`));
    };
    measure();
    let alive = true;
    document.fonts?.ready.then(() => { if (alive) measure(); }).catch(() => undefined);
    return () => { alive = false; };
  }, [verb]);

  let n = 0;
  const chars = (word: string) => Array.from(word).map((c, i) => <span key={i} className="sp-hl__ch" style={vars({ "--i": n++ })}>{c}</span>);
  return (
    <span className="sp-hl__line" data-phase={phase} style={vars({ "--d": `${delay}ms` })}>
      <span className="sp-hl__word sp-hl__verb" ref={verbRef}>{chars(verb)}</span>
      {rest.split(" ").filter(Boolean).map((w, i) => (
        <span key={i}>
          {" "}
          <span className="sp-hl__word">{chars(w)}</span>
        </span>
      ))}
    </span>
  );
}

/**
 * Space Studio's cycling headline: "<Verb> the rest." The verb is painted with the moving gradient; each new line's glyphs rise
 * out of a vertical motion blur while the old line lifts away. Every line is also laid out invisibly in the same grid cell, so
 * the block is always as tall as the longest line and nothing below it moves. Screen readers get `label` (stable text).
 *
 * The first line paints at once, without animation (it is usually the page's largest paint). Reduced motion swaps lines with
 * no movement; phones (640px and narrower) keep the first line still. `warp` fires a small star-field warp on each change.
 * Needs <SpaceMotionFilters> (the root layout renders it) for the blur filters.
 */
export function RotatingHeadline({ lines, label, as = "h1", className, cycleMs = 3200, warp = false, id }: { lines: readonly (readonly [verb: string, rest: string])[]; label: ReactNode; as?: ElementType; className?: string; cycleMs?: number; warp?: boolean; id?: string }) {
  // still = reduced motion: lines swap without movement (set together with the cycle, from the interval)
  const [{ cycle, still }, setState] = useState({ cycle: 0, still: false });
  const Tag = as;

  useEffect(() => {
    if (lines.length < 2 || isPhone()) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = window.setInterval(() => {
      if (document.hidden) return;
      setState((st) => ({ cycle: st.cycle + 1, still: reduce }));
      if (warp && !reduce) spaceFx.warp(0.25, 0.9);
    }, reduce ? cycleMs * 1.6 : cycleMs);
    return () => window.clearInterval(t);
  }, [lines.length, cycleMs, warp]);

  const at = (c: number) => lines[((c % lines.length) + lines.length) % lines.length]!;
  const shown = cycle === 0 || still ? [cycle] : [cycle - 1, cycle];
  return (
    <Tag className={className ? `sp-hl ${className}` : "sp-hl"} id={id}>
      <span className="visually-hidden">{label}</span>
      <span className="sp-hl__stage" aria-hidden="true">
        {lines.map(([v, r]) => (
          <span key={v} className="sp-hl__sizer">{v} {r}</span>
        ))}
        {shown.map((c) => {
          const [v, r] = at(c);
          return <Line key={c} verb={v} rest={r} phase={cycle === 0 || still ? "static" : c === cycle ? "in" : "out"} delay={300} />;
        })}
      </span>
    </Tag>
  );
}
