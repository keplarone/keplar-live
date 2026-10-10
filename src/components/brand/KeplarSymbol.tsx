import { MARK_SIZE, markShapes } from "./geometry";

type Props = {
  size?: number | string;
  title?: string;
  className?: string;
};

/** The Keplar symbol. Decorative by default; pass `title` to expose it to AT. */
export function KeplarSymbol({ size = 24, title, className }: Props) {
  const { square: s, triangle: t, circle: c } = markShapes;
  return (
    <svg
      viewBox={`0 0 ${MARK_SIZE} ${MARK_SIZE}`}
      width={size}
      height={size}
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
      fill="currentColor"
    >
      {title ? <title>{title}</title> : null}
      <rect x={s.x} y={s.y} width={s.size} height={s.size} rx={s.radius} />
      <path d={t.path} />
      <circle cx={c.cx} cy={c.cy} r={c.r} />
    </svg>
  );
}
