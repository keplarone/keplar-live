"use client";

import { useEffect } from "react";
import { CARD_LENS_MAP, PILL_LENS_MAP } from "./lens-maps";

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
 * A thick-glass lens. The map is the slope of a blurred rounded plate (strongest on the rim, still in
 * the middle). Red, green and blue are displaced at different scales and added back, so a colour fringe
 * appears only where the sky bends. The map is a PNG: an in-document SVG feImage stays blank when the
 * backdrop is the WebGL cloud canvas.
 * `liquid-glass` / `lg-refract` are the pill. `liquid-glass-card` is the squarer card.
 */
function lens(map: string, red: number, green: number, blue: number) {
  return (
    <>
      <feImage href={map} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map" />
      <feDisplacementMap in="SourceGraphic" in2="map" scale={red} xChannelSelector="R" yChannelSelector="G" result="dr" />
      <feDisplacementMap in="SourceGraphic" in2="map" scale={green} xChannelSelector="R" yChannelSelector="G" result="dg" />
      <feDisplacementMap in="SourceGraphic" in2="map" scale={blue} xChannelSelector="R" yChannelSelector="G" result="db" />
      <feColorMatrix in="dr" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="rch" />
      <feColorMatrix in="dg" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="gch" />
      <feColorMatrix in="db" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="bch" />
      <feComposite in="rch" in2="gch" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="rg" />
      <feComposite in="rg" in2="bch" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" />
    </>
  );
}

export function GlassDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <filter id="liquid-glass" x="-25%" y="-25%" width="150%" height="150%" colorInterpolationFilters="sRGB">{lens(PILL_LENS_MAP, 90, 58, 32)}</filter>
      <filter id="lg-refract" x="-25%" y="-25%" width="150%" height="150%" colorInterpolationFilters="sRGB">{lens(PILL_LENS_MAP, 90, 58, 32)}</filter>
      <filter id="liquid-glass-card" x="-25%" y="-25%" width="150%" height="150%" colorInterpolationFilters="sRGB">{lens(CARD_LENS_MAP, 80, 52, 30)}</filter>
    </svg>
  );
}
