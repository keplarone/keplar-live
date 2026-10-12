import { useId } from "react";
import s from "./business-mark.module.css";

/**
 * The Keplar Business icon (public/business/icon.png) drawn as SVG: the glossy black square, triangle and circle on a light
 * tile, so it reads on the dark chrome. Crisp at any size, and its three shapes move apart a little when the icon (or the link
 * around it) is hovered or focused, then spring back. Still for people who prefer reduced motion.
 */
export function BusinessMark({ size = 24 }: { size?: number }) {
  const id = useId().replace(/:/g, "");
  const gloss = `bm-gloss-${id}`;
  const sheen = `bm-sheen-${id}`;
  return (
    <svg className={s.mark} viewBox="0 0 512 512" width={size} height={size} aria-hidden="true" focusable="false">
      <defs>
        {/* Black with a light catching the top-left edge, like the app icon. */}
        <linearGradient id={gloss} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6e6e70" />
          <stop offset="0.28" stopColor="#262628" />
          <stop offset="0.62" stopColor="#0d0d0e" />
          <stop offset="1" stopColor="#050505" />
        </linearGradient>
        <radialGradient id={sheen} cx="0.22" cy="0.18" r="0.55">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect className={s.tile} x="0" y="0" width="512" height="512" rx="116" />
      <g transform="translate(62 62) scale(0.975)">
        <g className={s.square}>
          <rect x="0" y="0" width="229" height="229" rx="70" fill={`url(#${gloss})`} />
          <rect x="0" y="0" width="229" height="229" rx="70" fill={`url(#${sheen})`} />
        </g>
        <g className={s.triangle}>
          <path d="M204.95 11.95A7 7 0 0 1 209.9 0L362 0A16 16 0 0 1 378 16L378 168.1A7 7 0 0 1 366.05 173.05Z" fill={`url(#${gloss})`} />
        </g>
        <g className={s.circle}>
          <circle cx="281" cy="281" r="117" fill={`url(#${gloss})`} />
          <circle cx="281" cy="281" r="117" fill={`url(#${sheen})`} />
        </g>
      </g>
    </svg>
  );
}
