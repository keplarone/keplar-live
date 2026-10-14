/**
 * Pure logic behind <ResizableSplit>: size clamping, keyboard steps and the persisted-size format. Sizes are the first
 * pane's share of the container in percent (0-100). Unit tested in tests/studio-ui-logic.test.ts.
 */

export interface SplitBounds {
  /** smallest size of the first pane while expanded, percent */
  min: number;
  /** largest size of the first pane, percent */
  max: number;
}

export interface SplitValue {
  /** first pane size in percent when expanded (kept while collapsed, so expanding restores it) */
  size: number;
  collapsed: boolean;
}

export const SPLIT_STORAGE_PREFIX = "keplar.studio.split.";
const VERSION = 1;

export function clampSize(size: number, { min, max }: SplitBounds): number {
  if (!Number.isFinite(size)) return min;
  const lo = Math.max(0, Math.min(min, max));
  const hi = Math.min(100, Math.max(min, max));
  return Math.round(Math.min(hi, Math.max(lo, size)) * 100) / 100;
}

/** Reads a persisted value. Anything malformed, from another version, or non-finite yields null (the default is used). */
export function parsePersistedSplit(raw: string | null | undefined, bounds: SplitBounds): SplitValue | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  if (o.v !== VERSION || typeof o.size !== "number" || !Number.isFinite(o.size)) return null;
  return { size: clampSize(o.size, bounds), collapsed: o.collapsed === true };
}

export function serializeSplit(value: SplitValue): string {
  return JSON.stringify({ v: VERSION, size: Math.round(value.size * 100) / 100, collapsed: value.collapsed });
}

export type SplitCollapsible = "start" | "end" | false;

export interface SplitKeyOptions extends SplitBounds {
  /** percent per arrow press; Shift multiplies by 4 */
  step?: number;
  shift?: boolean;
  /** which pane can collapse (to zero) */
  collapsible?: SplitCollapsible;
  orientation: "horizontal" | "vertical";
}

/** The first pane's rendered share (percent) for a value: 0 / 100 while collapsed, else its size. */
export function effectiveSize(v: SplitValue, collapsible: SplitCollapsible | undefined): number {
  if (!v.collapsed || !collapsible) return v.size;
  return collapsible === "start" ? 0 : 100;
}

/**
 * Next value for a key on the separator. Horizontal split (panes side by side): Left/Right move it. Vertical (stacked):
 * Up/Down. Home/End jump to min/max. Enter toggles collapse when collapsible. Moving away from a collapsed edge restores
 * the remembered size. Returns null for keys that do nothing.
 */
export function splitKeyStep(current: SplitValue, key: string, o: SplitKeyOptions): SplitValue | null {
  const step = (o.step ?? 2) * (o.shift ? 4 : 1);
  const grow = o.orientation === "horizontal" ? "ArrowRight" : "ArrowDown";
  const shrink = o.orientation === "horizontal" ? "ArrowLeft" : "ArrowUp";
  const collapsed = current.collapsed && !!o.collapsible;
  if (key === "Enter") return o.collapsible ? { size: clampSize(current.size, o), collapsed: !current.collapsed } : null;
  if (key === "Home") return { size: clampSize(o.min, o), collapsed: false };
  if (key === "End") return { size: clampSize(o.max, o), collapsed: false };
  if (key === grow) {
    if (collapsed) return o.collapsible === "start" ? { size: clampSize(current.size, o), collapsed: false } : null;
    return { size: clampSize(current.size + step, o), collapsed: false };
  }
  if (key === shrink) {
    if (collapsed) return o.collapsible === "end" ? { size: clampSize(current.size, o), collapsed: false } : null;
    return { size: clampSize(current.size - step, o), collapsed: false };
  }
  return null;
}

/**
 * Value from a pointer position along the split axis (`start`/`length` are the container's offset and size on that axis).
 * Dragging past half of the collapsible pane's minimum collapses it (keeping the last size to restore).
 */
export function sizeFromPointer(
  pos: number,
  start: number,
  length: number,
  current: SplitValue,
  o: SplitBounds & { collapsible?: SplitCollapsible },
): SplitValue {
  const pct = length > 0 ? ((pos - start) / length) * 100 : current.size;
  if (o.collapsible === "start" && pct < o.min / 2) return { size: current.size, collapsed: true };
  if (o.collapsible === "end" && pct > o.max + (100 - o.max) / 2) return { size: current.size, collapsed: true };
  return { size: clampSize(pct, o), collapsed: false };
}
