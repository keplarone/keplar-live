"use client";

import { useEffect } from "react";

/**
 * The always-on, always-calm layer (styles in src/styles/ambient.css): slow smoke drifting behind every page, a glow that breathes,
 * a faint sheen and headings that glide in. All of it is CSS on the compositor (transform / opacity), so the only JS is deciding how much to run:
 *  - data-tab="hidden" pauses every ambient animation while the tab is in the background,
 *  - data-amb="low" drops to a single static glow on weak devices (few cores, little memory, data saver, small phones),
 *  - prefers-reduced-motion is handled in the CSS itself (static glow, nothing moves).
 */
export function AmbientRuntime() {
  useEffect(() => {
    const root = document.documentElement;
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    const weak =
      (nav.hardwareConcurrency ?? 8) <= 4 ||
      (nav.deviceMemory ?? 8) <= 4 ||
      !!nav.connection?.saveData ||
      (matchMedia("(max-width: 600px)").matches && (nav.hardwareConcurrency ?? 8) <= 6);
    root.setAttribute("data-amb", weak ? "low" : "full");
    const vis = () => root.setAttribute("data-tab", document.hidden ? "hidden" : "visible");
    vis();
    document.addEventListener("visibilitychange", vis);
    return () => {
      document.removeEventListener("visibilitychange", vis);
      root.removeAttribute("data-amb");
      root.removeAttribute("data-tab");
    };
  }, []);
  return (
    <div className="ambient" aria-hidden="true">
      <i />
      <i />
      <i />
      <b />
    </div>
  );
}
