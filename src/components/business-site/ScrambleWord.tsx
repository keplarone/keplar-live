"use client";

import { useEffect, useRef, useState } from "react";

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#%&*+<>/";

/**
 * The hero's last word: it holds, then decodes into the next one, letters resolving left to right through random glyphs.
 * Decorative: the heading around it carries the stable sentence for screen readers. Reduced motion keeps the first word still.
 */
export function ScrambleWord({ words, className, hold = 2600 }: { words: string[]; className?: string; hold?: number }) {
  const [text, setText] = useState(words[0]);
  const index = useRef(0);

  useEffect(() => {
    if (words.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    let timer = 0;
    const decode = (from: string, to: string) => {
      const len = Math.max(from.length, to.length);
      const start = performance.now();
      const per = 38; // ms per letter
      const tick = (now: number) => {
        const t = now - start;
        const settled = Math.floor(t / per) - 3;
        let out = "";
        for (let i = 0; i < len; i++) {
          if (i < settled) out += to[i] ?? "";
          else if (i < to.length || t < len * per * 0.5) out += GLYPHS[(Math.random() * GLYPHS.length) | 0];
        }
        setText(out);
        if (settled < len) frame = requestAnimationFrame(tick);
        else { setText(to); timer = window.setTimeout(next, hold); }
      };
      frame = requestAnimationFrame(tick);
    };
    const next = () => {
      const from = words[index.current];
      index.current = (index.current + 1) % words.length;
      decode(from, words[index.current]);
    };
    timer = window.setTimeout(next, hold + 900);
    return () => { cancelAnimationFrame(frame); window.clearTimeout(timer); };
  }, [words, hold]);

  return (
    <span className={className} aria-hidden="true">{text}</span>
  );
}
