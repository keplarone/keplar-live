import type { CSSProperties } from "react";
import s from "./KLoader.module.css";

/**
 * Keplar's own loader: three small lights orbit a breathing core, each on its own ellipse, so the shape never reads as a
 * generic spinner. Pure CSS/SVG (no JS, no WebGL): safe on the server, in the worst low-power path, and for reduced motion
 * (still ring + slow fade). `progress` (0..1) fills a thin arc when the amount is really known.
 */
export function KLoader({ size = 28, label = "Loading", progress, tone = "ink", className }: {
  size?: number;
  label?: string;
  progress?: number;
  tone?: "ink" | "light" | "current";
  className?: string;
}) {
  const known = typeof progress === "number" && Number.isFinite(progress);
  const p = known ? Math.max(0, Math.min(1, progress as number)) : 0;
  const R = 15;
  const C = 2 * Math.PI * R;
  const style = { "--kl-size": `${size}px` } as CSSProperties;
  return (
    <span role="status" aria-label={label} aria-live="polite" className={[s.root, tone === "light" ? s.light : tone === "current" ? s.current : "", className ?? ""].filter(Boolean).join(" ")} style={style} data-kloader="">
      <svg viewBox="-20 -20 40 40" width={size} height={size} aria-hidden="true" focusable="false">
        <circle className={s.track} r={R} fill="none" strokeWidth="1" />
        {known ? <circle className={s.arc} r={R} fill="none" strokeWidth="1.6" strokeLinecap="round" strokeDasharray={`${(C * p).toFixed(2)} ${C.toFixed(2)}`} transform="rotate(-90)" /> : null}
        <g className={s.o1}><circle className={s.dot} cx="15" cy="0" r="2" /></g>
        <g className={s.o2}><circle className={s.dot} cx="10" cy="0" r="1.5" /></g>
        <g className={s.o3}><circle className={s.dot} cx="6" cy="0" r="1.1" /></g>
        <circle className={s.core} r="3.2" />
      </svg>
    </span>
  );
}
