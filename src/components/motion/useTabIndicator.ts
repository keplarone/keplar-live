"use client";

import { useLayoutEffect, type RefObject } from "react";

/**
 * Sliding tab indicator. Put <span className="m-tab-indicator" aria-hidden="true" /> inside a position:relative tablist and
 * call this with the tablist ref and the selected key. It reads the selected tab's box once per change (no read/write
 * interleaving) and hands it to CSS as --ti-x / --ti-w; the bar moves with transform only (src/styles/motion.css). The first
 * placement does not animate.
 */
export function useTabIndicator(listRef: RefObject<HTMLElement | null>, selected: unknown) {
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const place = () => {
      const tab = list.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
      if (!tab) return;
      list.style.setProperty("--ti-x", `${tab.offsetLeft}px`);
      list.style.setProperty("--ti-w", String(tab.offsetWidth));
    };
    const first = list.dataset.tabIndicator !== "on";
    if (first) list.dataset.tabIndicator = "placing";
    place();
    let raf = 0;
    if (first) raf = requestAnimationFrame(() => { list.dataset.tabIndicator = "on"; });
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(place) : null;
    ro?.observe(list);
    return () => { cancelAnimationFrame(raf); ro?.disconnect(); };
  }, [listRef, selected]);
}
