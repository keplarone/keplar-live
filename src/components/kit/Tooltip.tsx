"use client";

import { cloneElement, isValidElement, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from "react";
import { cx } from "./cx";
import { useFloating } from "./floating";
import { KeyCombo } from "./Kbd";
import type { Side } from "./position";
import o from "./overlay.module.css";

const OPEN_DELAY = 450;
/** After a tooltip closes, the next one opens without delay for this long (scanning a toolbar). */
const WARM_WINDOW = 400;
let lastClosed = 0;

export interface TooltipProps {
  /** Short text. Rendered as a description of the child (aria-describedby). */
  content: ReactNode;
  /** Optional shortcut, e.g. ["Mod", "Enter"]. */
  shortcut?: readonly string[];
  side?: Side;
  /** The control it describes: one element that accepts aria-describedby. */
  children: ReactElement<{ "aria-describedby"?: string }>;
  /** Render the child alone (no tooltip), e.g. while a menu from the same control is open. */
  disabled?: boolean;
  className?: string;
}

/**
 * Hover (after a short delay) or keyboard focus shows a compact label next to the control; Escape, pointer down, leaving or
 * blurring hides it. Content is not interactive. The child keeps its own accessible name; the tooltip text is linked as its
 * description while visible.
 */
export function Tooltip({ content, shortcut, side = "top", children, disabled, className }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  useFloating(open && !disabled, anchorRef, tipRef, { side, align: "center", offset: 6 });

  const clear = () => {
    if (timer.current !== undefined) window.clearTimeout(timer.current);
    timer.current = undefined;
  };
  const show = (immediate: boolean) => {
    clear();
    if (immediate || Date.now() - lastClosed < WARM_WINDOW) setOpen(true);
    else timer.current = window.setTimeout(() => setOpen(true), OPEN_DELAY);
  };
  const hide = () => {
    clear();
    setOpen((was) => {
      if (was) lastClosed = Date.now();
      return false;
    });
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      lastClosed = Date.now();
      setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);
  useEffect(() => clear, []);

  const visible = open && !disabled;
  const child = isValidElement(children)
    ? cloneElement(children, {
        "aria-describedby": visible ? cx(children.props["aria-describedby"], id) : children.props["aria-describedby"],
      })
    : children;

  return (
    <span
      ref={anchorRef}
      style={{ display: "inline-flex" }}
      className={className}
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") show(false);
      }}
      onPointerLeave={hide}
      onPointerDown={hide}
      onFocus={(e) => {
        if ((e.target as HTMLElement).matches?.(":focus-visible")) show(true);
      }}
      onBlur={hide}
    >
      {child}
      {visible ? (
        <div ref={tipRef} id={id} role="tooltip" popover="manual" data-motion="ks" className={cx(o.layer, o.tip)} data-o="overlay tip">
          <span>{content}</span>
          {shortcut?.length ? <KeyCombo keys={shortcut} className={o.tipKeys} plain /> : null}
        </div>
      ) : null}
    </span>
  );
}
