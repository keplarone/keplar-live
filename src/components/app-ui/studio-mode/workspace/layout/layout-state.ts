/**
 * The full-page Workspace layout: nav rail, the conversation | inspector split, the inspector tab, Simple vs Advanced, and
 * the focus presets. Pure (parse, serialize, presets) plus small try/catch storage helpers.
 *
 * Two kinds of persistence:
 * - live: the split persists itself through ResizableSplit's storageKey (ui/split-storage.ts), and the rest of the live layout
 *   is kept under LAYOUT_LIVE_KEY, so a reload looks the same;
 * - saved: "Save layout" stores a snapshot under LAYOUT_SAVED_KEY; "Restore saved layout" brings it back; "Reset layout"
 *   returns to DEFAULT_LAYOUT.
 */
import { parsePersistedSplit, SPLIT_STORAGE_PREFIX, serializeSplit, type SplitValue } from "../../ui/split-storage";
import type { InspectorTab } from "../../ui/Layout";

export type ViewMode = "simple" | "advanced";
export type FocusPreset = "conversation" | "code" | "viewport";

export type WorkspaceLayout = {
  v: 1;
  navCollapsed: boolean;
  /** The conversation's share of the split, percent (start pane), and whether the inspector (end pane) is collapsed. */
  split: SplitValue;
  view: ViewMode;
  tab: InspectorTab;
};

export const LAYOUT_LIVE_KEY = "keplar.studio.layout.live";
export const LAYOUT_SAVED_KEY = "keplar.studio.layout.saved";
/** ResizableSplit storageKey of the conversation | inspector split (prefixed by SPLIT_STORAGE_PREFIX). */
export const SPLIT_KEY = "workspace.inspector";
export const SPLIT_BOUNDS = { min: 28, max: 78 } as const;

export const DEFAULT_LAYOUT: WorkspaceLayout = {
  v: 1,
  navCollapsed: false,
  split: { size: 56, collapsed: false },
  view: "advanced",
  tab: "code",
};

export const FOCUS_PRESETS: ReadonlyArray<{ id: FocusPreset; label: string }> = [
  { id: "conversation", label: "Conversation" },
  { id: "code", label: "Code" },
  { id: "viewport", label: "Viewport" },
];

/** What each focus preset does to the layout. Viewport falls back to Changes in Blender (it has no screenshots). */
export function applyPreset(l: WorkspaceLayout, p: FocusPreset, env: "roblox" | "blender"): WorkspaceLayout {
  switch (p) {
    case "conversation": return { ...l, view: "advanced", split: { size: l.split.size, collapsed: true } };
    case "code": return { ...l, view: "advanced", split: { size: 34, collapsed: false }, tab: "code" };
    case "viewport": return { ...l, view: "advanced", split: { size: 44, collapsed: false }, tab: env === "blender" ? "changes" : "viewport" };
  }
}

/** The preset the layout currently matches, or null (custom). */
export function presetOf(l: WorkspaceLayout, env: "roblox" | "blender"): FocusPreset | null {
  if (l.view === "simple") return null;
  if (l.split.collapsed) return "conversation";
  for (const p of ["code", "viewport"] as const) {
    const t = applyPreset(l, p, env);
    if (Math.abs(t.split.size - l.split.size) < 0.5 && t.tab === l.tab) return p;
  }
  return null;
}

const TABS = new Set(["code", "viewport", "changes", "plan", "activity"]);

export function parseLayout(raw: string | null | undefined): WorkspaceLayout | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<WorkspaceLayout> | null;
    if (!o || o.v !== 1) return null;
    const size = Number(o.split?.size);
    if (!Number.isFinite(size)) return null;
    return {
      v: 1,
      navCollapsed: o.navCollapsed === true,
      split: { size: Math.min(SPLIT_BOUNDS.max, Math.max(SPLIT_BOUNDS.min, size)), collapsed: o.split?.collapsed === true },
      view: o.view === "simple" ? "simple" : "advanced",
      tab: typeof o.tab === "string" && TABS.has(o.tab) ? (o.tab as InspectorTab) : "code",
    };
  } catch {
    return null;
  }
}

export const serializeLayout = (l: WorkspaceLayout): string => JSON.stringify(l);

/* Storage (every access in try/catch: private windows and blocked site data just mean no persistence). */

const EVENT = "ks-layout-change";

export function readStore(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStore(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* blocked: the layout still applies for this visit */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
}

/** ResizableSplit announces its own writes with this event (ui/ResizableSplit.tsx). */
const SPLIT_EVENT = "ks-split-change";

export function subscribeStore(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener(SPLIT_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener(SPLIT_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** A stable snapshot string of the live layout (the shell's own key plus the split's), for useSyncExternalStore. */
export const liveSnapshot = (): string => `${readStore(LAYOUT_LIVE_KEY) ?? ""}\u0000${readStore(SPLIT_STORAGE_PREFIX + SPLIT_KEY) ?? ""}`;

/** The live layout from a liveSnapshot() string (defaults for anything missing or malformed). */
export function layoutFromSnapshot(snap: string | null): WorkspaceLayout {
  if (!snap) return DEFAULT_LAYOUT;
  const [live, split] = snap.split("\u0000");
  const base = parseLayout(live) ?? DEFAULT_LAYOUT;
  const sv = parsePersistedSplit(split ?? null, SPLIT_BOUNDS);
  return sv ? { ...base, split: sv } : base;
}

/** Persists the whole live layout (the shell's part and the split's). */
export function writeLive(l: WorkspaceLayout): void {
  writeSplit(l.split);
  writeStore(LAYOUT_LIVE_KEY, serializeLayout(l));
}

/** Writes the split where ResizableSplit reads it, so a remounted split opens at this size. */
export function writeSplit(v: SplitValue): void {
  try {
    window.localStorage.setItem(SPLIT_STORAGE_PREFIX + SPLIT_KEY, serializeSplit(v));
  } catch {
    /* blocked */
  }
}
