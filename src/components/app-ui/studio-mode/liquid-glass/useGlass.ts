"use client";

import { useEffect, useRef, type RefObject } from "react";
import { attachGlass, type GlassHandle, type GlassOptions } from "./engine";

/** Makes the referenced element a liquid-glass surface while it is mounted; returns a ref to its handle (surge, setStrength). */
export function useGlass<T extends HTMLElement>(ref: RefObject<T | null>, opts: GlassOptions = {}, active = true): RefObject<GlassHandle | null> {
  const handle = useRef<GlassHandle | null>(null);
  const { shape, strength, blur, band } = opts;
  useEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    const h = attachGlass(el, { shape, strength, blur, band });
    handle.current = h;
    return () => { h.dispose(); if (handle.current === h) handle.current = null; };
  }, [ref, shape, strength, blur, band, active]);
  return handle;
}

/** Springy spring-like easing for the Web Animations API (one overshoot, then settle), as a CSS linear() curve. */
export const SPRING = "linear(0, 0.06 2%, 0.23 5%, 0.5 9.5%, 0.86 16%, 1.04 22%, 1.1 27%, 1.09 32%, 1.03 40%, 0.99 50%, 0.995 62%, 1)";
