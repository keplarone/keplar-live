import { LOCKUP, MARK_SIZE, WORDMARK_PATH, markShapes } from "./geometry";

type Props = { height?: number | string; title?: string; className?: string };

/** Symbol + wordmark lockup, positioned exactly as in the founder's artwork. */
export function KeplarLogo({ height = 22, title = "Keplar", className }: Props) {
  const { square: s, triangle: t, circle: c } = markShapes;
  const sym = LOCKUP.symbol;
  const wm = LOCKUP.wordmark;
  return (
    <svg
      viewBox={LOCKUP.viewBox}
      height={height}
      className={className}
      style={{ width: "auto", display: "block" }}
      role="img"
      aria-label={title}
      focusable="false"
      fill="currentColor"
    >
      <g transform={`translate(${sym.x} ${sym.y}) scale(${sym.scale})`} data-size={MARK_SIZE}>
        <rect x={s.x} y={s.y} width={s.size} height={s.size} rx={s.radius} />
        <path d={t.path} />
        <circle cx={c.cx} cy={c.cy} r={c.r} />
      </g>
      <g transform={`translate(${wm.x} ${wm.y}) scale(${wm.scale})`}>
        <path fillRule="evenodd" d={WORDMARK_PATH} />
      </g>
    </svg>
  );
}
