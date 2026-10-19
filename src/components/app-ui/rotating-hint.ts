"use client";

import { useEffect, useState } from "react";

/**
 * The composer's empty-home placeholder cycles through example prompts, like Gemini's input. It only runs while `active`
 * (an empty chat), pauses while the tab is hidden, and stays on the first hint under reduced motion.
 */
export function useRotatingHint(active: boolean, hints: readonly string[], everyMs = 4000): string {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!active || hints.length < 2) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = document.documentElement;
    let swap = 0;
    // Fade the placeholder out (gemini.css: html[data-hint-swap]), swap the text, then let it fade back in.
    const id = window.setInterval(() => {
      if (document.hidden) return;
      root.setAttribute("data-hint-swap", "");
      swap = window.setTimeout(() => {
        setI((n) => (n + 1) % hints.length);
        root.removeAttribute("data-hint-swap");
      }, 180);
    }, everyMs);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(swap);
      root.removeAttribute("data-hint-swap");
    };
  }, [active, hints, everyMs]);
  // A conversation shows "Reply to Keplar…" instead, so there is nothing to reset when it becomes inactive.
  return hints[active ? i % hints.length : 0] ?? "";
}

/** "Ask Keplar" first, then real examples of what Keplar is for (several models, one checked answer). */
export const HOME_HINTS = [
  "Ask Keplar",
  "Compare two laptops for video editing",
  "Is intermittent fasting backed by evidence?",
  "Plan a 3-day trip to Lisbon on a budget",
  "Explain this contract clause in plain English",
] as const;
