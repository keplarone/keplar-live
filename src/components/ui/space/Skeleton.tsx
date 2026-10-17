/** Loading placeholders: soft pills that breathe in opacity (never a shimmer sweep). Styles: .sp-skel in src/styles/space.css. */
export function Skeleton({ width = "100%", height = 14, radius, lines = 1 }: { width?: number | string; height?: number; radius?: number; lines?: number }) {
  return (
    <span className="sp-skel-group" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className="sp-skel" style={{ width: i === lines - 1 && lines > 1 ? "62%" : width, height, borderRadius: radius }} />
      ))}
    </span>
  );
}

/** A labelled loading block: announced once to screen readers, a title bar and three lines. */
export function LoadingBlock({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: 12, padding: "16px 0" }}>
      <span className="visually-hidden">{label}…</span>
      <Skeleton height={16} width="40%" />
      <Skeleton lines={3} />
    </div>
  );
}
