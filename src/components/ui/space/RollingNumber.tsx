"use client";

import { useEffect, useRef, useState } from "react";

/**
 * An odometer (Space Studio's RollingNumber): each digit is a 0-9 strip that rolls to its new value, with a vertical motion
 * blur while it moves. Digits are keyed from the right, so 999 -> 1,000 rolls every column instead of re-mounting them. Screen
 * readers get the plain formatted number. Styles: .sp-roll in src/styles/space.css.
 */
export function RollingNumber({ value, format = (n) => Math.round(n).toLocaleString("en-US"), className, durationMs = 900 }: { value: number; format?: (n: number) => string; className?: string; durationMs?: number }) {
  const text = format(value);
  const [rolling, setRolling] = useState(false);
  const prev = useRef(text);
  useEffect(() => {
    if (prev.current === text) return;
    prev.current = text;
    setRolling(true);
    const t = window.setTimeout(() => setRolling(false), durationMs);
    return () => window.clearTimeout(t);
  }, [text, durationMs]);

  const chars = [...text];
  return (
    <span className={className ? `sp-roll ${className}` : "sp-roll"} data-rolling={rolling || undefined} style={{ ["--roll-ms" as string]: `${durationMs}ms` }}>
      <span className="visually-hidden">{text}</span>
      <span className="sp-roll__digits" aria-hidden="true">
        {chars.map((c, i) => {
          const key = chars.length - i;
          if (c < "0" || c > "9") return <span key={`s${key}`} className="sp-roll__sep">{c}</span>;
          return (
            <span key={`d${key}`} className="sp-roll__col">
              <span className="sp-roll__strip" style={{ transform: `translateY(${-Number(c) * 10}%)` }}>
                {"0123456789".split("").map((d) => <span key={d}>{d}</span>)}
              </span>
            </span>
          );
        })}
      </span>
    </span>
  );
}

/** A number that glides toward `target` over `ms` (ease-out), so a polled value counts smoothly instead of jumping. */
export function useGlide(target: number, ms = 1200): number {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  const cur = useRef(target);
  useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    from.current = cur.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = still ? 1 : Math.min(1, (now - start) / ms);
      const v = from.current + (target - from.current) * (1 - Math.pow(1 - p, 3));
      cur.current = v;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return shown;
}
