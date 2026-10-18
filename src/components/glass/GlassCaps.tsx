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
    const noTransparency = mq("(prefers-reduced-transparency: reduce)") || mq("(prefers-contrast: more)");
    const small = mq("(max-width: 899px), (pointer: coarse)");
    const chromium = Boolean(nav.userAgentData?.brands?.some((b) => /Chromium/i.test(b.brand)));
    const weak = Boolean(nav.connection?.saveData) || (nav.deviceMemory !== undefined && nav.deviceMemory <= 2) || (nav.hardwareConcurrency !== undefined && nav.hardwareConcurrency <= 2);
    if (weak) r.setAttribute("data-glass", "lite");
    if (chromium && !noTransparency && !small && !weak) r.setAttribute("data-lens", "");
  }, []);
  return null;
}

/** The refraction filter used by `.lg-lens` (see src/styles/glass.css). Low-frequency noise gently bends what is behind the glass. */
export function GlassDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <filter id="lg-refract" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.007 0.011" numOctaves="2" seed="7" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="20" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}
