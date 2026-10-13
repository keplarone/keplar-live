"use client";

import { useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { cx } from "./cx";
import {
  clampSize,
  effectiveSize,
  parsePersistedSplit,
  serializeSplit,
  sizeFromPointer,
  splitKeyStep,
  SPLIT_STORAGE_PREFIX,
  type SplitCollapsible,
  type SplitValue,
} from "./split-storage";
import l from "./layout.module.css";

const CHANGE = "ks-split-change";

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(SPLIT_STORAGE_PREFIX + key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: SplitValue): void {
  try {
    window.localStorage.setItem(SPLIT_STORAGE_PREFIX + key, serializeSplit(value));
  } catch {
    /* storage blocked (private window, quota): the size still applies for this session */
  }
  window.dispatchEvent(new CustomEvent(CHANGE, { detail: key }));
}

function subscribeStored(cb: () => void): () => void {
  window.addEventListener(CHANGE, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(CHANGE, cb);
    window.removeEventListener("storage", cb);
  };
}

export interface ResizableSplitProps {
  /** "horizontal" = panes side by side (vertical divider); "vertical" = stacked (horizontal divider). */
  orientation?: "horizontal" | "vertical";
  /** Exactly two panes: [start, end]. */
  children: [ReactNode, ReactNode];
  /** Accessible name of the divider, e.g. "Resize inspector". */
  label: string;
  /** Start pane's default share, percent. */
  defaultSize?: number;
  /** Start pane bounds while expanded, percent. */
  minSize?: number;
  maxSize?: number;
  /** Which pane may collapse to nothing (drag past half its minimum, Enter, or double-click the divider). */
  collapsible?: SplitCollapsible;
  /**
   * Persist size + collapsed state under localStorage["keplar.studio.split.<storageKey>"] (read and written in try/catch;
   * blocked storage just means no persistence). Omit for an unpersisted split.
   */
  storageKey?: string;
  /** Called after a resize or collapse is committed. */
  onChange?: (value: SplitValue) => void;
  className?: string;
}

/**
 * Two resizable panes. Pointer: drag the divider (pointer capture, so it tracks outside the window edge). Keyboard: focus
 * the divider (role="separator"), arrows move 2% (Shift: 8%), Home/End jump to min/max, Enter collapses/expands.
 */
export function ResizableSplit({
  orientation = "horizontal",
  children,
  label,
  defaultSize = 50,
  minSize = 15,
  maxSize = 85,
  collapsible = false,
  storageKey,
  onChange,
  className,
}: ResizableSplitProps) {
  const bounds = { min: minSize, max: maxSize };
  const raw = useSyncExternalStore(
    subscribeStored,
    () => (storageKey ? readStored(storageKey) : null),
    () => null,
  );
  const [local, setLocal] = useState<SplitValue | null>(null);
  const [drag, setDrag] = useState<SplitValue | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const committed: SplitValue = local ?? parsePersistedSplit(raw, bounds) ?? { size: clampSize(defaultSize, bounds), collapsed: false };
  const value = drag ?? committed;
  const shown = effectiveSize(value, collapsible);

  const commit = (v: SplitValue) => {
    setLocal(v);
    if (storageKey) writeStored(storageKey, v);
    onChange?.(v);
  };

  const horizontal = orientation === "horizontal";
  const fromEvent = (e: PointerEvent<HTMLDivElement>, base: SplitValue): SplitValue => {
    const r = containerRef.current?.getBoundingClientRect();
    if (!r) return base;
    return horizontal
      ? sizeFromPointer(e.clientX, r.left, r.width, base, { ...bounds, collapsible })
      : sizeFromPointer(e.clientY, r.top, r.height, base, { ...bounds, collapsible });
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus({ preventScroll: true });
    setDrag(committed);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    setDrag(fromEvent(e, committed));
  };
  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    commit(drag);
    setDrag(null);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const next = splitKeyStep(committed, e.key, { ...bounds, collapsible, orientation, shift: e.shiftKey });
    if (!next) return;
    e.preventDefault();
    commit(next);
  };

  const collapsedPane = value.collapsed && collapsible ? collapsible : null;
  return (
    <div
      ref={containerRef}
      className={cx(l.split, className)}
      data-orientation={orientation}
      data-dragging={drag ? "" : undefined}
      style={{ ["--split-size" as string]: `${shown}%` }}
    >
      <div className={cx(l.pane, l.paneStart)} inert={collapsedPane === "start" || undefined}>
        {children[0]}
      </div>
      <div
        role="separator"
        tabIndex={0}
        aria-label={label}
        aria-orientation={horizontal ? "vertical" : "horizontal"}
        aria-valuemin={collapsible === "start" ? 0 : Math.round(minSize)}
        aria-valuemax={collapsible === "end" ? 100 : Math.round(maxSize)}
        aria-valuenow={Math.round(shown)}
        className={l.handle}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={collapsible ? () => commit({ size: committed.size, collapsed: !committed.collapsed }) : undefined}
        onKeyDown={onKeyDown}
      />
      <div className={cx(l.pane, l.paneEnd)} inert={collapsedPane === "end" || undefined}>
        {children[1]}
      </div>
    </div>
  );
}
