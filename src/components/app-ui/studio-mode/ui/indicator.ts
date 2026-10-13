"use client";

import { useLayoutEffect, type RefObject } from "react";

/**
 * Slides an indicator element under the selected item of a list (SegmentedControl thumb, Tabs underline). Writes transform
 * and width straight to the element: a CSS transition then moves it, and a new selection mid-flight retargets from wherever
 * it is (interruptible). The first placement is not animated (data-ready is set after it).
 */
export function useSlidingIndicator(
  listRef: RefObject<HTMLElement | null>,
  indicatorRef: RefObject<HTMLElement | null>,
  selector: string,
  key: unknown,
  axis: "x" | "y" = "x",
): void {
  useLayoutEffect(() => {
    const list = listRef.current;
    const ind = indicatorRef.current;
    if (!list || !ind) return;
    const place = () => {
      const active = list.querySelector<HTMLElement>(selector);
      if (!active) {
        ind.style.opacity = "0";
        return;
      }
      ind.style.opacity = "1";
      if (axis === "x") {
        ind.style.transform = `translateX(${active.offsetLeft}px)`;
        ind.style.width = `${active.offsetWidth}px`;
      } else {
        ind.style.transform = `translateY(${active.offsetTop}px)`;
        ind.style.height = `${active.offsetHeight}px`;
      }
    };
    place();
    if (!ind.hasAttribute("data-ready")) {
      // commit the first position before enabling transitions
      void ind.offsetWidth;
      ind.setAttribute("data-ready", "");
    }
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(place) : null;
    ro?.observe(list);
    return () => ro?.disconnect();
  }, [listRef, indicatorRef, selector, key, axis]);
}
