"use client";

import { useSyncExternalStore } from "react";

const REDUCED = "(prefers-reduced-motion: reduce)";

function subscribeReduced(cb: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(REDUCED);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/**
 * True when the person asked the OS for reduced motion. Server render and first hydration pass report false (the CSS media
 * query in tokens.module.css already zeroes every --ks-dur-* token, so nothing moves even before this resolves).
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReduced,
    () => (typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(REDUCED).matches),
    () => false,
  );
}

const noSubscribe = () => () => {};

/** True after hydration (client snapshot), false on the server. Use to gate browser-only rendering without an effect. */
export function useHydrated(): boolean {
  return useSyncExternalStore(noSubscribe, () => true, () => false);
}
