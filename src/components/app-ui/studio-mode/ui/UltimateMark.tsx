"use client";

import { useState, type SVGProps } from "react";
import { cx } from "./cx";
import { useReducedMotion } from "./hooks";
import { ULTIMATE } from "./ultimate-geometry";
import s from "./UltimateMark.module.css";

export interface UltimateMarkProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  /** Ultimate+ is the selected Solar tier right now. */
  active: boolean;
  /**
   * Replays the activation sequence when it changes while `active` (e.g. the id of the selection event). The sequence also
   * plays when `active` turns true. It never plays on first paint: a mark that mounts active is simply shown active.
   */
  animateKey?: string | number;
  /** px, square. Default 20. */
  size?: number;
  /** Accessible name; default "Ultimate+". Pass "" to make it decorative inside a labelled control. */
  label?: string;
}

/** Ring circle as a path starting at 12 o'clock (so the stroke draws from the top). */
function ringPath(r: number): string {
  return `M12 ${12 - r} A${r} ${r} 0 1 1 12 ${12 + r} A${r} ${r} 0 1 1 12 ${12 - r}`;
}

/**
 * The Ultimate+ signature mark for the Solar selector. Inactive: a plain sun (disc + four rays). Activated: the disc becomes a
 * four-point star, the rays turn onto the diagonals as ticks, two thin concentric rings draw in and the set expands into place
 * and settles; then it rests in a calm active state. Monochrome (currentColor). Reduced motion: the static active state.
 */
export function UltimateMark({ active, animateKey, size = 20, label = "Ultimate+", className, ...rest }: UltimateMarkProps) {
  const reduced = useReducedMotion();
  const [prev, setPrev] = useState({ active, animateKey });
  const [run, setRun] = useState(0);
  if (prev.active !== active || prev.animateKey !== animateKey) {
    setPrev({ active, animateKey });
    if (active) setRun((n) => n + 1);
  }
  const play = active && run > 0 && !reduced;
  const state = active ? "active" : "idle";
  return (
    <svg
      {...rest}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={cx(s.mark, className)}
      data-active={active ? "" : undefined}
      role={label ? "img" : undefined}
      aria-label={label ? (active ? `${label}, active` : label) : undefined}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <g key={run} className={s.rings} data-play={play ? "" : undefined}>
        <path className={cx(s.ring, s.inner)} d={ringPath(ULTIMATE.rings.inner.r)} pathLength={1} />
        <path className={cx(s.ring, s.outer)} d={ringPath(ULTIMATE.rings.outer.r)} pathLength={1} />
      </g>
      <g className={s.rays}>
        {ULTIMATE.rays[state].map((d, i) => (
          <path key={i} className={s.ray} d={d} style={{ d: `path("${d}")` }} />
        ))}
      </g>
      <path className={s.core} d={ULTIMATE.core[state]} style={{ d: `path("${ULTIMATE.core[state]}")` }} />
    </svg>
  );
}
