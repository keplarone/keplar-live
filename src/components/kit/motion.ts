/**
 * Keplar motion tokens (TypeScript twin of the --ks-dur-* / --ks-ease-* custom properties in tokens.module.css).
 *
 * Use the CSS tokens in stylesheets; use these constants only where motion has to be driven from script (Web Animations,
 * timers that must outlast a CSS transition). Both sides are checked against each other in tests/studio-ui-tokens.test.ts.
 */

/** Durations in milliseconds. Reduced motion collapses every one of them to 0 (see useReducedMotion / the CSS media query). */
export const DURATION = {
  /** state flips with no travel: hover fills, pressed */
  instant: 80,
  /** small travel: tooltips, menu items, switch thumbs */
  fast: 140,
  /** standard component transitions: popovers, segmented indicator, toasts */
  base: 200,
  /** icon geometry morphs (MorphIcon) */
  morph: 220,
  /** larger surfaces: dialogs, panel collapse */
  slow: 300,
  /** the one choreographed sequence (UltimateMark activation) */
  sequence: 900,
} as const;

export type DurationToken = keyof typeof DURATION;

/** Critically damped spring x(t) = 1 - (1 + wt) e^(-wt); w is chosen so the curve is within 0.15% of rest at t = 1. */
export const SPRING_OMEGA = 9.2;
export const SPRING_SAMPLES = 24;

/**
 * Samples the no-overshoot spring as a CSS linear() easing. Every sample is in [0, 1] and non-decreasing, so nothing using it can
 * overshoot its target. The string is generated (not hand-typed) and pasted into tokens.module.css; a test keeps the two equal.
 */
export function springLinear(omega = SPRING_OMEGA, samples = SPRING_SAMPLES): string {
  const pts: string[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const x = i === samples ? 1 : 1 - (1 + omega * t) * Math.exp(-omega * t);
    pts.push(String(i === samples ? 1 : Number(x.toFixed(4))));
  }
  return `linear(${pts.join(", ")})`;
}

export const EASING = {
  /** default for anything that moves between two resting states */
  standard: "cubic-bezier(0.2, 0, 0, 1)",
  /** elements arriving */
  enter: "cubic-bezier(0, 0, 0, 1)",
  /** elements leaving */
  exit: "cubic-bezier(0.4, 0, 1, 1)",
  /** physical settle with no overshoot (indicators, expand-and-settle) */
  spring: springLinear(),
} as const;

export type EasingToken = keyof typeof EASING;
