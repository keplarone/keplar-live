import { STREAM_ROLES, svgPaths } from "@/field/path";
import s from "./FieldHome.module.css";

/**
 * The Convergence Field as a still SVG: same curves as the WebGL scene, coloured by meaning through the
 * theme's CSS variables. Server-rendered, so it is the first paint, the reduced-motion / no-WebGL view
 * and the fallback if the GPU path fails. `upTo` clips how far the streams have travelled.
 */
export function FieldFigure({ upTo = 1, className = "" }: { upTo?: number; className?: string }) {
  const g = svgPaths(upTo);
  const hue = (i: number) => `var(--v-${STREAM_ROLES[i].token})`;
  const full = upTo >= 0.99;
  return (
    <svg className={`${s.figure} ${className}`} viewBox="0 0 1200 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="fig-res" x1="0" x2="1">
          <stop offset="0" stopColor="var(--v-reasoning)" />
          <stop offset="0.5" stopColor="var(--v-research)" />
          <stop offset="1" stopColor="var(--v-verified)" />
        </linearGradient>
      </defs>
      {g.paths.map((p, i) => (
        <path key={i} d={p.d} fill="none" stroke={hue(p.stream)} strokeWidth={p.lane === 0 ? 2.2 : 1.1} strokeLinecap="round" opacity={p.lane === 0 ? 0.95 : 0.5} />
      ))}
      <circle cx={g.origin.x} cy={g.origin.y} r="5" fill="var(--c-ink)" />
      {full ? (
        <>
          <line x1={g.boundaryX} x2={g.boundaryX} y1="70" y2="530" stroke="var(--v-verified)" strokeWidth="1.2" strokeDasharray="2 7" opacity="0.8" />
          <circle cx={g.investigate.x} cy={g.investigate.y} r="22" fill="none" stroke="var(--v-attention)" strokeWidth="2" />
          <g transform={`translate(${g.focus.x - 70} ${g.focus.y})`}>
            <ellipse rx="150" ry="60" transform="rotate(-14)" fill="none" stroke="url(#fig-res)" strokeWidth="3" />
            <circle cx="70" cy="0" r="9" fill="var(--c-ink)" />
            <circle cx="70" cy="0" r="22" fill="none" stroke="var(--v-verified)" strokeWidth="2" />
          </g>
        </>
      ) : null}
      <title>Illustration: several lines of reasoning leave one question, diverge, meet a verification boundary and converge into one answer.</title>
    </svg>
  );
}
