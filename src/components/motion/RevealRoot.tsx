"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Page motion for the marketing pages, in one place and without a layout cost (opacity and transform only).
 *
 * - Route transition: a short fade of <main> on client-side navigation (not on first load).
 * - Scroll reveal is pure CSS (globals.css, `[data-reveal]`): a scroll-driven animation tied to each block's own position, so
 *   nothing is ever hidden by a script. The old observer set below-the-fold blocks to opacity 0 until it saw them, which left
 *   whole sections blank for fast scrollers, find-in-page, full-page captures and slow script loads (and printed blank pages).
 * - Reduced motion: nothing animates; content is simply there.
 */
export function RevealRoot() {
  const path = usePathname();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    document.getElementById("main")?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: "cubic-bezier(0.2, 0, 0, 1)" });
  }, [path]);

  return null;
}
