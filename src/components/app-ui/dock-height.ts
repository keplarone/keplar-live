"use client";

import { useEffect, useRef } from "react";

/**
 * Publishes the real height of the floating composer dock as --dock-h on its parent (.main).
 * The dock is an absolute overlay over the thread; .scroll uses --dock-h for bottom padding so the
 * last card stays clear, and the "Latest" jump button floats just above it. ResizeObserver runs
 * after layout, so this never forces a reflow.
 */
export function useDockHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    const host = el?.parentElement;
    if (!el || !host || typeof ResizeObserver === "undefined") return;
    const set = () => host.style.setProperty("--dock-h", `${Math.ceil(el.getBoundingClientRect().height)}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => { ro.disconnect(); host.style.removeProperty("--dock-h"); };
  }, []);
  return ref;
}
