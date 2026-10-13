"use client";

import { useState, type CSSProperties, type SVGProps } from "react";
import { cx } from "../cx";
import { useReducedMotion } from "../hooks";
import { morphState, type MorphIconName, type MorphIconState } from "./morph-paths";
import s from "./icons.module.css";

export interface MorphIconProps<N extends MorphIconName> extends Omit<SVGProps<SVGSVGElement>, "children" | "name"> {
  icon: N;
  /** The real state this icon reflects (e.g. `open ? "close" : "menu"`). Changing it morphs the geometry. */
  state: MorphIconState<N>;
  /** Rendered size in px (square). Default 16. */
  size?: number;
  /** Accessible name. Omit when the surrounding control is labelled (IconButton label) — the icon is then decorative. */
  label?: string;
}

/**
 * An icon whose drawing morphs between states by interpolating SVG path geometry (CSS `d` transitions over paths with
 * identical command structure; see morph-paths.ts). Interruptible: a new state mid-flight reverses from the current geometry.
 * Reduced motion: the new state appears at once. `refresh` turns only while `state="active"` and completes its turn after.
 */
export function MorphIcon<N extends MorphIconName>({ icon, state, size = 16, label, className, ...rest }: MorphIconProps<N>) {
  const def = morphState(icon, state);
  const reduced = useReducedMotion();
  const spin = Boolean(def.spin) && !reduced;
  // When the refresh ends, finish the current revolution instead of snapping back (cleared on the next iteration boundary).
  const [prevSpin, setPrevSpin] = useState(spin);
  const [finishing, setFinishing] = useState(false);
  if (prevSpin !== spin) {
    setPrevSpin(spin);
    setFinishing(!spin && !reduced);
  }
  const turning = spin || finishing;
  const glyphStyle: CSSProperties | undefined = def.rotate ? { transform: `rotate(${def.rotate}deg)` } : undefined;
  return (
    <svg
      {...rest}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={cx(s.icon, s.morph, className)}
      data-icon={icon}
      data-state={state}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <g
        className={s.glyph}
        style={glyphStyle}
        data-spin={turning ? "" : undefined}
        onAnimationIteration={finishing ? () => setFinishing(false) : undefined}
      >
        {def.strokes.map((stroke, i) => (
          <path
            key={i}
            className={s.path}
            d={stroke.d}
            style={{ d: `path("${stroke.d}")`, opacity: stroke.opacity ?? 1 }}
          />
        ))}
      </g>
    </svg>
  );
}
