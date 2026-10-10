import { WORDMARK_PATH, WORDMARK_VIEWBOX } from "./geometry";

type Props = { height?: number | string; title?: string; className?: string };

export function KeplarWordmark({ height = 20, title, className }: Props) {
  const { w, h } = WORDMARK_VIEWBOX;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      height={height}
      className={className}
      style={{ width: "auto" }}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
      fill="currentColor"
    >
      {title ? <title>{title}</title> : null}
      <path fillRule="evenodd" d={WORDMARK_PATH} />
    </svg>
  );
}
