"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { commonPrefixLen, frameCap, healMarkdown, initialTyping, stepTyping, visibleText, type TypingState } from "@/lib/typing";

export type Typewriter = {
  /** The text to render now (Markdown-healed while it is still being revealed). */
  text: string;
  /** True from the first character until the reveal has caught up with a finished stream. */
  typing: boolean;
  /** Show the caret: while revealing and while waiting for more of the stream. */
  caret: boolean;
  /** Reveal everything right now. */
  skip: () => void;
};

const QUERY = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (cb: () => void) => {
  const mq = window.matchMedia?.(QUERY);
  mq?.addEventListener?.("change", cb);
  return () => mq?.removeEventListener?.("change", cb);
};
const reducedNow = () => Boolean(window.matchMedia?.(QUERY).matches);

/**
 * Word-level typing reveal for streamed answers (maths in src/lib/typing.ts).
 *
 * - `target` is the text received so far; `done` says the stream has finished (whatever is left
 *   appears within about 0.3 s: text that has arrived is never held back to look like typing).
 * - `live` false (a stored answer, an old thread) renders the target as is, with no animation.
 * - prefers-reduced-motion, a hidden tab, `skip()` and Esc (once the stream is done) show everything at once.
 * - The Markdown is healed for the partial text so no raw markers flash and nothing changes shape later.
 * - The full text is never touched: copy buttons read `target`, not the revealed part.
 *
 * The reveal position lives in state and is only written from the animation frame callback (and
 * skip), so render stays a pure function of (target, done, position).
 */
export function useTypewriter(target: string, opts: { live: boolean; done: boolean }): Typewriter {
  const { live, done } = opts;
  const reduced = useSyncExternalStore(subscribeReduced, reducedNow, () => false);
  const [pos, setPos] = useState(0);
  const [skipped, setSkipped] = useState(false);
  const latest = useRef({ target, done });
  const motion = useRef<TypingState>(initialTyping(0));
  const prevTarget = useRef("");
  const raf = useRef(0);
  const lastT = useRef(0);
  const lastDt = useRef(0);

  useEffect(() => {
    latest.current = { target, done };
  }, [target, done]);

  const instant = !live || skipped || reduced;
  const finished = instant || (done && pos >= target.length);
  const running = !finished;

  useEffect(() => {
    if (!running) return;
    // A hidden tab shows everything at once. The loop keeps going (the browser simply holds the frames while hidden),
    // because text can still stream in after the tab comes back: returning here froze the answer mid-sentence for good
    // when someone switched tabs while it was streaming (the reveal never reached the final text, so it never finished).
    const jumpToEnd = () => {
      const { target: t } = latest.current;
      motion.current = { ...motion.current, pos: t.length, pauseMs: 0 };
      prevTarget.current = t;
      lastT.current = 0;
      setPos(t.length);
    };
    const tick = (now: number) => {
      const { target: t, done: streamDone } = latest.current;
      if (document.hidden) {
        jumpToEnd();
        raf.current = requestAnimationFrame(tick);
        return;
      }
      // The text changed under the reveal (not just extended): never point past the shared part.
      if (prevTarget.current !== t) {
        const keep = commonPrefixLen(prevTarget.current, t);
        if (motion.current.pos > keep) motion.current = { ...motion.current, pos: keep };
        prevTarget.current = t;
      }
      const dt = lastT.current ? now - lastT.current : 16;
      lastT.current = now;
      motion.current = stepTyping(motion.current, dt, t, frameCap(lastDt.current, dt), streamDone);
      lastDt.current = dt;
      // Small moves are skipped to save renders, but reaching the end is always recorded (a skipped final move left the reveal
      // one word short, still "typing", for good).
      setPos((cur) => (motion.current.pos >= t.length ? t.length : Math.abs(cur - motion.current.pos) < 0.01 ? cur : motion.current.pos));
      raf.current = requestAnimationFrame(tick);
    };
    lastT.current = 0;
    lastDt.current = 0;
    raf.current = requestAnimationFrame(tick);
    // Leaving and coming back both reveal what has arrived so far; the rest keeps typing as it streams.
    const onVisible = () => jumpToEnd();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelAnimationFrame(raf.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [running]);

  const skip = useCallback(() => setSkipped(true), []);

  // Esc completes a finished stream (before that Esc stops the run, which discards the partial).
  useEffect(() => {
    if (!running || !done) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSkipped(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running, done]);

  if (finished) return { text: target, typing: false, caret: false, skip };
  const text = pos >= target.length ? target : healMarkdown(visibleText(target, pos));
  return { text, typing: true, caret: true, skip };
}
