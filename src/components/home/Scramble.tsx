"use client";

import { useEffect, useRef, useState } from "react";
import { runScramble, scrambleAt } from "@/lib/typing/scramble";
import s from "./Scramble.module.css";

const DURATION = 760;

/**
 * Headline that letter-scrambles into place when its scene arrives.
 *
 * Invariants (see tests/scramble.test.ts and e2e/scramble.e2e.ts):
 * - The real text is always in the DOM for assistive tech (visually-hidden copy); the animated layer is aria-hidden.
 * - Whatever interrupts a run (scene scrolled away, text changed, unmount), the run is cancelled and the real text shows.
 *   A run is never left half-done, and it is replayed on the next arrival until it has completed once.
 * - A timeout inside runScramble forces the final frame even if requestAnimationFrame is throttled (background tab).
 * - Reduced motion: no animation at all.
 * - The real text stays in the flow (transparent while scrambling) and the scrambled glyphs are an absolute overlay, so layout never moves.
 */
export function Scramble({ text, live, className }: { text: string; live: boolean; className?: string }) {
  const [run, setRun] = useState<{ text: string; p: number } | null>(null);
  const completed = useRef<string | null>(null);
  useEffect(() => {
    if (!live || completed.current === text) return; // run is already null: every run's cleanup clears it
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { completed.current = text; return; }
    // Start scrambled on this very commit (not one frame late), so the real text never flashes before the effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRun({ text, p: 0 });
    const cancel = runScramble({
      duration: DURATION,
      onFrame: (p) => setRun({ text, p }),
      onDone: () => { completed.current = text; setRun(null); },
    });
    return () => { cancel(); setRun(null); };
  }, [live, text]);
  const active = run !== null && run.text === text && run.p < 1;
  const chars = active ? scrambleAt(text, run.p, text.length) : null;
  return (
    <span className={className}>
      <span className="visually-hidden">{text}</span>
      <span className={s.vis} aria-hidden="true" data-scramble={active ? "running" : "settled"}>
        <span className={active ? s.hold : undefined}>{text}</span>
        {chars ? (
          <span className={s.over}>{chars.map((c, i) => (c.settled ? c.ch : <i key={i} className={s.sc}>{c.ch}</i>))}</span>
        ) : null}
      </span>
    </span>
  );
}
