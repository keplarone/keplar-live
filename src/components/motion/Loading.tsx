import type { CSSProperties } from "react";
import { KLoader } from "@/components/loader/KLoader";

/**
 * Loading primitives (styles: src/styles/motion.css). Skeleton blocks are flat and pulse in opacity only (the design has no
 * gradients, so no shimmer sweep). KLoader is the one spinner; Thinking is the small inline "working" cue.
 */
export function Skeleton({ shape = "line", width, height, className, style }: { shape?: "line" | "title" | "block" | "circle"; width?: string | number; height?: string | number; className?: string; style?: CSSProperties }) {
  return <span aria-hidden="true" className={["m-skeleton", className ?? ""].filter(Boolean).join(" ")} data-shape={shape} style={{ width, height, ...style }} />;
}

export function Thinking({ label = "Working", className }: { label?: string; className?: string }) {
  return (
    <span role="status" aria-label={label} className={["m-thinking", className ?? ""].filter(Boolean).join(" ")}>
      <i aria-hidden="true" />
      <i aria-hidden="true" />
      <i aria-hidden="true" />
    </span>
  );
}

/**
 * Route loading state for loading.tsx. Nothing shows for the first ~150ms (--m-loading-delay), so a fast navigation never
 * flashes it; then the skeleton and the loader fade in together.
 */
export function RouteLoading({ label = "Loading", lines = 4, variant = "page" }: { label?: string; lines?: number; variant?: "page" | "docs" }) {
  const widths = ["92%", "78%", "85%", "64%", "88%", "70%"];
  return (
    <div className="m-delayed" data-route-loading="" aria-busy="true" style={{ padding: variant === "docs" ? "var(--s-12) var(--l-gutter)" : "calc(var(--l-nav-h) + var(--l-nav-offset) + var(--s-12)) var(--l-gutter) var(--s-16)", maxWidth: "min(var(--l-max), 960px)", marginInline: "auto", display: "grid", gap: "var(--s-4)", minHeight: "60vh" }}>
      <KLoader size={22} label={label} />
      <Skeleton shape="title" />
      {Array.from({ length: lines }, (_, i) => <Skeleton key={i} shape="line" width={widths[i % widths.length]} />)}
      <Skeleton shape="block" />
    </div>
  );
}
