"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";

type Side = "top" | "bottom";
type Align = "start" | "end";

/** Keeps an element mounted for `ms` after `open` turns false, so its exit can play. */
export function usePresenceMs(open: boolean, ms = 160): { mounted: boolean; state: "open" | "closing" } {
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  useEffect(() => {
    if (open) return;
    const t = window.setTimeout(() => setMounted(false), ms);
    return () => window.clearTimeout(t);
  }, [open, ms]);
  return { mounted: open || mounted, state: open ? "open" : "closing" };
}

/**
 * Anchored popover / dropdown (Space Studio's Popover). Positions with `fixed` from the anchor, flips to the side with room,
 * scales and un-blurs in from the corner nearest the anchor. Escape or a press outside closes it and returns focus to the
 * anchor. Use .sp-menu-item for rows inside. Styles: .sp-pop in src/styles/space.css.
 */
export function Popover({
  open,
  onClose,
  anchorRef,
  children,
  label,
  prefer = "bottom",
  align = "start",
  width = 320,
  role = "dialog",
  className,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  label: string;
  prefer?: Side;
  align?: Align;
  width?: number;
  role?: "dialog" | "menu" | "listbox";
  className?: string;
}) {
  const { mounted, state } = usePresenceMs(open, 160);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; side: Side; maxH: number; w: number } | null>(null);

  const place = useCallback(() => {
    const a = anchorRef.current?.getBoundingClientRect();
    if (!a) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const below = vh - a.bottom;
    const above = a.top;
    const side: Side = prefer === "bottom" ? (below >= 260 || below >= above ? "bottom" : "top") : above >= 260 || above >= below ? "top" : "bottom";
    const w = Math.min(width, vw - 16);
    let left = align === "start" ? a.left : a.right - w;
    left = Math.max(8, Math.min(left, vw - w - 8));
    if (side === "bottom") setPos({ top: a.bottom + 8, left, side, maxH: below - 16, w });
    else setPos({ bottom: vh - a.top + 8, left, side, maxH: above - 16, w });
  }, [anchorRef, prefer, align, width]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        anchorRef.current?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchorRef.current?.contains(t)) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("resize", place);
    const f = window.setTimeout(() => {
      ref.current?.querySelector<HTMLElement>("[data-autofocus], button:not([disabled]), [href], input, [tabindex]:not([tabindex='-1'])")?.focus();
    }, 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("resize", place);
      window.clearTimeout(f);
    };
  }, [open, onClose, anchorRef, place]);

  if (!mounted || !pos) return null;
  return (
    <div
      ref={ref}
      role={role}
      aria-label={label}
      className={className ? `sp-pop ${className}` : "sp-pop"}
      data-motion="none"
      data-state={state}
      data-side={pos.side}
      style={{ top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.w, maxHeight: Math.max(160, pos.maxH), transformOrigin: `${pos.side === "bottom" ? "top" : "bottom"} ${align === "start" ? "left" : "right"}` }}
    >
      {children}
    </div>
  );
}
