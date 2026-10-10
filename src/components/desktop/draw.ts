export type MarkKind = "pen" | "rect" | "ellipse" | "arrow";
export type Pt = { x: number; y: number };
export type Mark = { kind: MarkKind; a: Pt; b: Pt; points?: Pt[] };

export function markBounds(m: Mark): { left: number; top: number; width: number; height: number } {
  const pts = m.kind === "pen" && m.points && m.points.length > 1 ? m.points : [m.a, m.b];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const right = Math.max(...xs);
  const bottom = Math.max(...ys);
  return { left, top, width: Math.max(2, right - left), height: Math.max(2, bottom - top) };
}

export function markLabel(kind: MarkKind): string {
  if (kind === "rect") return "Rectangle";
  if (kind === "ellipse") return "Ellipse";
  if (kind === "arrow") return "Arrow";
  return "Freehand stroke";
}

/** The question sent onward. Words are whatever was readable under each mark. No picture is included. */
export function askFromMarks(notes: { kind: MarkKind; words: string }[]): string {
  const lines = notes.map((n, i) => `${i + 1}. ${markLabel(n.kind)} over: ${n.words.trim() || "no readable words"}`);
  return `Look at what I marked on this page and explain it, including what is uncertain.\n\n--- Marks ---\n${lines.join("\n")}`.slice(0, 4000);
}
