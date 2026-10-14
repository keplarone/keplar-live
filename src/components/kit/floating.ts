"use client";

import { useLayoutEffect, type RefObject } from "react";
import { computePlacement, type Align, type Side } from "./position";

export interface FloatingOptions {
  side?: Side;
  align?: Align;
  offset?: number;
}

/** Opens `el` in the top layer when the Popover API exists (escapes overflow clipping and z-index); a no-op otherwise. */
export function showTopLayer(el: HTMLElement): void {
  try {
    if (typeof el.showPopover === "function" && !el.matches(":popover-open")) el.showPopover();
  } catch {
    /* not supported or already open: it is fixed-positioned either way */
  }
}

export function hideTopLayer(el: HTMLElement): void {
  try {
    if (typeof el.hidePopover === "function" && el.matches(":popover-open")) el.hidePopover();
  } catch {
    /* ignore */
  }
}

/**
 * Keeps a fixed-position floating element (rendered only while open, with popover="manual") placed against its anchor:
 * on open, on resize of either element, on window resize and on any scroll. Writes styles directly (no React state).
 */
export function useFloating(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  floatingRef: RefObject<HTMLElement | null>,
  { side = "bottom", align = "center", offset = 6 }: FloatingOptions = {},
): void {
  useLayoutEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current;
    const el = floatingRef.current;
    if (!anchor || !el) return;
    showTopLayer(el);
    const update = () => {
      const r = anchor.getBoundingClientRect();
      const p = computePlacement({
        anchor: { top: r.top, left: r.left, width: r.width, height: r.height },
        floating: { width: el.offsetWidth, height: el.offsetHeight },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        side,
        align,
        offset,
      });
      el.style.top = `${p.top}px`;
      el.style.left = `${p.left}px`;
      el.dataset.side = p.side;
    };
    update();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(update) : null;
    ro?.observe(el);
    ro?.observe(anchor);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      hideTopLayer(el);
    };
  }, [open, anchorRef, floatingRef, side, align, offset]);
}

/** Focusable descendants in DOM order (visible, enabled, not tabindex=-1). */
export function focusables(root: HTMLElement): HTMLElement[] {
  const sel =
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';
  return Array.from(root.querySelectorAll<HTMLElement>(sel)).filter((el) => !el.closest("[inert]") && el.getClientRects().length > 0);
}
