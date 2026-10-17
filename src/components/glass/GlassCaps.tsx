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
 * The lens is a static attribute on a few pills. Nothing here watches scroll or typing:
 * restamping data-distort used to flicker cards and rerun filters while the composer was in use.
 */
export function GlassBudget() {
  return null;
}

/**
 * A thick-glass lens. The slope is a blurred plate (flat in the middle, steep at the rim),
 * built from filter primitives so it does not depend on an feImage map.
 * Red, green and blue are displaced at different scales and added back, which leaves a
 * thin colour fringe where a cloud edge bends. Scale is in CSS pixels (userSpaceOnUse).
 * The filter region extends well past a short pill so the rim can sample the sky outside it.
 * One pill filter. Cards do not get a displacement map.
 */
function lens(red: number, green: number, blue: number) {
  return (
    <>
      <feFlood floodColor="#ffffff" floodOpacity="1" x="6%" y="8%" width="88%" height="84%" result="plate" />
      <feGaussianBlur in="plate" stdDeviation="9" result="h" />
      <feOffset in="h" dx="2" dy="0" result="hR" />
      <feOffset in="h" dx="-2" dy="0" result="hL" />
      <feComposite in="hR" in2="hL" operator="arithmetic" k2="14" k3="-14" k4="0.5" result="dx" />
      <feOffset in="h" dx="0" dy="2" result="hD" />
      <feOffset in="h" dx="0" dy="-2" result="hU" />
      <feComposite in="hD" in2="hU" operator="arithmetic" k2="14" k3="-14" k4="0.5" result="dy" />
      <feColorMatrix in="dx" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="rx" />
      <feColorMatrix in="dy" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="gy" />
      <feComposite in="rx" in2="gy" operator="arithmetic" k2="1" k3="1" result="map" />
      <feDisplacementMap in="SourceGraphic" in2="map" scale={red} xChannelSelector="R" yChannelSelector="G" result="dr" />
      <feDisplacementMap in="SourceGraphic" in2="map" scale={green} xChannelSelector="R" yChannelSelector="G" result="dg" />
      <feDisplacementMap in="SourceGraphic" in2="map" scale={blue} xChannelSelector="R" yChannelSelector="G" result="db" />
      <feColorMatrix in="dr" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="rch" />
      <feColorMatrix in="dg" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="gch" />
      <feColorMatrix in="db" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="bch" />
      <feComposite in="rch" in2="gch" operator="arithmetic" k2="1" k3="1" result="rg" />
      <feComposite in="rg" in2="bch" operator="arithmetic" k2="1" k3="1" />
    </>
  );
}

export function GlassDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <filter id="liquid-glass" x="-50%" y="-120%" width="200%" height="340%" colorInterpolationFilters="sRGB" primitiveUnits="userSpaceOnUse">{lens(180, 142, 104)}</filter>
      <filter id="lg-refract" x="-50%" y="-120%" width="200%" height="340%" colorInterpolationFilters="sRGB" primitiveUnits="userSpaceOnUse">{lens(180, 142, 104)}</filter>
      {/* Chips sit under the composer. A region that reaches past the pill samples the placeholder and paints a second, offset copy. This one stays inside the pill. */}
      <filter id="liquid-glass-chip" x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB" primitiveUnits="userSpaceOnUse">{lens(180, 142, 104)}</filter>
    </svg>
  );
}
