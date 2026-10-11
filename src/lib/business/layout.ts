/** Business dashboard widgets and the default layout (no server imports: the dashboard uses it in the browser too). */
export const WIDGETS = ["summary", "revenue", "orders", "traffic", "conversion", "leads", "agents", "approvals", "usage", "projects", "integrations"] as const;
export type WidgetId = (typeof WIDGETS)[number];
export type WidgetSize = "s" | "m" | "l";
export type LayoutItem = { id: WidgetId; size: WidgetSize };

/** Rows of six columns with no gaps: one large, two rows of three small, then pairs of medium. */
export const DEFAULT_LAYOUT: LayoutItem[] = [
  { id: "summary", size: "l" },
  { id: "revenue", size: "s" }, { id: "orders", size: "s" }, { id: "conversion", size: "s" },
  { id: "leads", size: "s" }, { id: "traffic", size: "s" }, { id: "usage", size: "s" },
  { id: "approvals", size: "m" }, { id: "agents", size: "m" },
  { id: "projects", size: "m" }, { id: "integrations", size: "m" },
];

/** A layout from the client: known widgets only, each once, valid sizes; missing widgets keep their default order at the end. */
export function cleanLayout(raw: unknown): LayoutItem[] {
  const seen = new Set<WidgetId>();
  const out: LayoutItem[] = [];
  for (const x of Array.isArray(raw) ? raw.slice(0, 40) : []) {
    const o = (x ?? {}) as Record<string, unknown>;
    if (!(WIDGETS as readonly string[]).includes(o.id as string) || seen.has(o.id as WidgetId)) continue;
    seen.add(o.id as WidgetId);
    out.push({ id: o.id as WidgetId, size: o.size === "s" || o.size === "l" ? o.size : "m" });
  }
  for (const d of DEFAULT_LAYOUT) if (!seen.has(d.id)) out.push(d);
  return out;
}
