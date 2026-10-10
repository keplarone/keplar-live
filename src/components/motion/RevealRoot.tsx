"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Page motion for the marketing pages, in one place and without a layout cost (opacity and transform only).
 *
 * - Scroll reveal: elements marked `data-reveal` that start below the fold fade and rise in once as they
 *   scroll into view. Anything already on screen is left alone, so there is no flash and nothing hides before JS runs.
 *   Children of `data-reveal-stagger` come in one after another.
 * - Route transition: a short fade of <main> on client-side navigation (not on first load).
 * - Reduced motion: nothing animates; content is simply there.
 */
export function RevealRoot() {
  const path = usePathname();
  const first = useRef(true);

  // Route transition (skipped on the first render).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    document.getElementById("main")?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: "cubic-bezier(0.2, 0, 0, 1)" });
  }, [path]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    const vh = window.innerHeight;
    const targets: HTMLElement[] = [];
    document.querySelectorAll<HTMLElement>("main [data-reveal]").forEach((el) => {
      if (el.getBoundingClientRect().top < vh * 0.92) return; // already visible: leave it
      targets.push(el);
    });
    if (!targets.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          el.dataset.rv = "in";
          io.unobserve(el);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    for (const el of targets) {
      const stagger = el.parentElement?.closest("[data-reveal-stagger]") ? Array.prototype.indexOf.call(el.parentElement.children, el) : 0;
      el.style.setProperty("--rv-delay", `${Math.min(stagger, 8) * 70}ms`);
      el.dataset.rv = "out";
      io.observe(el);
    }
    return () => {
      io.disconnect();
      // Leave nothing hidden if the route changes mid-way.
      for (const el of targets) delete el.dataset.rv;
    };
  }, [path]);

  return null;
}
