"use client";

import { useEffect, useRef, useState } from "react";
import { isPhone } from "@/lib/fx/lite";

/**
 * The hero's last word, in Space Studio's style: painted with the moving gradient, it holds, then the next word rises out of a
 * vertical motion blur (the .morphWord keyframes in business-site.module.css; the blur filters come from <SpaceMotionFilters>).
 * Decorative: the heading around it carries the stable sentence for screen readers. `paused` stops the cycle and the gradient
 * (WCAG 2.2.2: the page offers a pause control). Phones (640px and narrower) and reduced motion keep the first word still.
 */
export function HeroWord({ words, className, wordClassName, paused = false, hold = 2600 }: { words: string[]; className?: string; wordClassName?: string; paused?: boolean; hold?: number }) {
  const [at, setAt] = useState(0);
  const pausedRef = useRef(paused);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  useEffect(() => {
    if (words.length < 2 || isPhone() || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => {
      if (pausedRef.current || document.hidden) return;
      setAt((n) => n + 1);
    }, hold);
    return () => window.clearInterval(t);
  }, [words.length, hold]);

  return (
    <span className={className} data-paused={paused || undefined} aria-hidden="true">
      <span key={at} className={wordClassName} data-arrived={at > 0 || undefined}>{words[at % words.length]}</span>
    </span>
  );
}
