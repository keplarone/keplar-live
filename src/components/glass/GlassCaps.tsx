"use client";

import { useEffect } from "react";

/**
 * Glass capability flags on <html>:
 *  - data-lens: SVG refraction of the backdrop (url() in backdrop-filter). Chromium only; off for reduced transparency,
 *    coarse pointers, small screens and data-saver. Everything else keeps the plain blur glass.
 *  - data-glass="lite": opaque surfaces (data-saver, <=2 GB memory or <=2 cores).
 */
export function GlassCaps() {
  useEffect(() => {
    const r = document.documentElement;
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean }; userAgentData?: { brands?: { brand: string }[] } };
    const mq = (q: string) => window.matchMedia(q).matches;
    const noTransparency = mq("(prefers-reduced-transparency: reduce)") || mq("(prefers-contrast: more)") || mq("(prefers-reduced-motion: reduce)");
    const small = mq("(max-width: 899px), (pointer: coarse)");
    const chromium = Boolean(nav.userAgentData?.brands?.some((b) => /Chromium/i.test(b.brand))) || /Chrome|Chromium/.test(navigator.userAgent);
    const weak = Boolean(nav.connection?.saveData) || (nav.deviceMemory !== undefined && nav.deviceMemory <= 2) || (nav.hardwareConcurrency !== undefined && nav.hardwareConcurrency <= 2);
    if (weak) r.setAttribute("data-glass", "lite");
    if (chromium && !noTransparency && !small && !weak) r.setAttribute("data-lens", "");
  }, []);
  return null;
}

/**
 * Distortion is expensive. Nav pills opt in permanently (a handful, always on screen). Cards marked
 * data-glass-live, and settings panels inside data-glass-scope, get the displacement filter only while
 * they are on screen, and at most four of them at once.
 */
export function GlassBudget() {
  useEffect(() => {
    const MAX = 4;
    let frame = 0;
    const candidates = () => [
      ...document.querySelectorAll<HTMLElement>("[data-glass-live], [data-glass-scope] [class*='panel']"),
    ];
    const pick = () => {
      frame = 0;
      const lens = document.documentElement.hasAttribute("data-lens");
      const list = candidates();
      if (!lens) {
        for (const n of list) n.removeAttribute("data-distort");
        return;
      }
      const visible = list.filter((n) => {
        const r = n.getBoundingClientRect();
        return r.width > 80 && r.height > 40 && r.bottom > 0 && r.top < window.innerHeight;
      });
      visible.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      const on = new Set(visible.slice(0, MAX));
      for (const n of list) {
        if (on.has(n)) n.setAttribute("data-distort", "");
        else n.removeAttribute("data-distort");
      }
    };
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(pick);
    };
    schedule();
    const io = new IntersectionObserver(schedule, { rootMargin: "80px" });
    let observed: HTMLElement[] = [];
    const watch = () => {
      for (const n of observed) io.unobserve(n);
      observed = candidates();
      for (const n of observed) io.observe(n);
      schedule();
    };
    watch();
    const mo = new MutationObserver(watch);
    mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      io.disconnect();
      mo.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);
  return null;
}

/**
 * Refraction for liquid glass. `liquid-glass` bends the sky and splits the red and blue by a pixel or two
 * at the distorted edge. `lg-refract` is the same filter for the older .lg-lens hook.
 */
function refract() {
  return (
    <>
      <feTurbulence type="fractalNoise" baseFrequency="0.012 0.018" numOctaves="2" seed="4" result="n" />
      <feDisplacementMap in="SourceGraphic" in2="n" scale="42" xChannelSelector="R" yChannelSelector="G" result="d" />
      <feOffset in="d" dx="1.5" dy="0.3" result="rShift" />
      <feOffset in="d" dx="-1.4" dy="-0.2" result="bShift" />
      <feColorMatrix in="rShift" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="rch" />
      <feColorMatrix in="d" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="gch" />
      <feColorMatrix in="bShift" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="bch" />
      <feBlend in="rch" in2="gch" mode="screen" result="rg" />
      <feBlend in="rg" in2="bch" mode="screen" />
    </>
  );
}

export function GlassDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <filter id="liquid-glass" x="-8%" y="-8%" width="116%" height="116%" colorInterpolationFilters="sRGB">{refract()}</filter>
      <filter id="lg-refract" x="-8%" y="-8%" width="116%" height="116%" colorInterpolationFilters="sRGB">{refract()}</filter>
    </svg>
  );
}
