"use client";

import { useCallback } from "react";

/**
 * Publishes the real height of the floating composer dock as --dock-h on its parent (.main).
 * The dock is an absolute overlay over the thread; .scroll uses --dock-h for bottom padding so the
 * last card stays clear, and the "Latest" jump button floats just above it. ResizeObserver runs
 * after layout, so this never forces a reflow.
 *
 * A callback ref, not a mount-once effect: the dock unmounts whenever another view (Create, Slides, Study...) takes the main
 * column and a new one mounts on the way back. A mount-once observer stayed on the removed dock, published its 0px height and
 * never saw the new one, so the empty-chat starters slid up under the composer. The border box is observed because the dock's
 * padding changes between the empty-chat and thread layouts.
 */
export function useDockHeight<T extends HTMLElement>() {
  return useCallback((el: T | null) => {
    const host = el?.parentElement;
    if (!el || !host || typeof ResizeObserver === "undefined") return;
    const set = () => {
      if (el.isConnected) host.style.setProperty("--dock-h", `${Math.ceil(el.getBoundingClientRect().height)}px`);
    };
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el, { box: "border-box" });
    return () => { ro.disconnect(); host.style.removeProperty("--dock-h"); };
  }, []);
}
