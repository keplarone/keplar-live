"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { cx } from "./cx";
import { focusables, useFloating } from "./floating";
import { Icon } from "./icons/Icon";
import { KeyCombo } from "./Kbd";
import type { Align, Side } from "./position";
import o from "./overlay.module.css";

/* ─────────────────────────────── Popover ─────────────────────────────── */

export interface PopoverProps {
  open: boolean;
  /** Called with false on Escape, outside pointer down, or Tab out of the popover. */
  onOpenChange: (open: boolean) => void;
  /** The element it is anchored to (usually the trigger button). Focus returns here on Escape. */
  anchorRef: RefObject<HTMLElement | null>;
  side?: Side;
  align?: Align;
  /** Accessible name of the popover surface. */
  label: string;
  /** ARIA role of the surface: "dialog" (default) for free content, "menu" is set by <Menu>. */
  role?: "dialog" | "menu" | "listbox";
  /** Focus the first focusable element on open (default), or the surface itself ("surface"), or nothing. */
  initialFocus?: "first" | "last" | "surface" | "none";
  id?: string;
  className?: string;
  children: ReactNode;
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
}

/**
 * A compact anchored surface in the top layer. Non-modal: Escape closes and returns focus to the anchor; a pointer down
 * outside closes; Tab moves on and closes. Renders nothing while closed.
 */
export function Popover({
  open,
  onOpenChange,
  anchorRef,
  side = "bottom",
  align = "start",
  label,
  role = "dialog",
  initialFocus = "first",
  id,
  className,
  children,
  onKeyDown,
}: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  useFloating(open, anchorRef, ref, { side, align, offset: 6 });

  useLayoutEffect(() => {
    if (!open) return;
    const el = ref.current;
    if (!el || initialFocus === "none") return;
    // skip aria-disabled controls (e.g. a disabled first MenuItem) when choosing where focus lands
    const items = focusables(el).filter((f) => f.getAttribute("aria-disabled") !== "true");
    const target = initialFocus === "surface" ? el : initialFocus === "last" ? items[items.length - 1] : items[0];
    (target ?? el).focus({ preventScroll: true });
  }, [open, initialFocus]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchorRef.current?.contains(t)) return;
      onOpenChange(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open, onOpenChange, anchorRef]);

  if (!open) return null;
  return (
    <div
      ref={ref}
      id={id}
      role={role}
      aria-label={label}
      tabIndex={-1}
      popover="manual"
      data-motion="ks"
      className={cx(o.layer, o.float, className)}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (e.defaultPrevented) return;
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onOpenChange(false);
          anchorRef.current?.focus({ preventScroll: true });
        } else if (e.key === "Tab") {
          // Non-modal: let focus move on naturally, then close.
          onOpenChange(false);
        }
      }}
    >
      {children}
    </div>
  );
}

/* ─────────────────────────────── Menu ─────────────────────────────── */

interface MenuCtx {
  close: (returnFocus: boolean) => void;
}
const MenuContext = createContext<MenuCtx | null>(null);

/** Props to spread on the element that opens the menu (any Button / IconButton / button). */
export interface MenuTriggerProps {
  ref: RefObject<HTMLButtonElement | null>;
  id: string;
  "aria-haspopup": "menu";
  "aria-expanded": boolean;
  "aria-controls": string | undefined;
  onClick: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
}

export interface MenuProps {
  /** Renders the trigger; spread the given props onto a button. */
  trigger: (props: MenuTriggerProps & { open: boolean }) => ReactNode;
  /** Accessible name of the menu. */
  label: string;
  children: ReactNode;
  side?: Side;
  align?: Align;
  /** Controlled open state (optional). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

const ITEM_SELECTOR = '[role="menuitem"]:not([aria-disabled="true"]), [role="menuitemcheckbox"]:not([aria-disabled="true"])';

/**
 * Menu button + menu (WAI-ARIA menu pattern). Click, Enter, Space or ArrowDown on the trigger opens it on the first item,
 * ArrowUp on the last. In the menu: Up/Down move (wrapping), Home/End, a letter jumps to the next item starting with it,
 * Enter/Space activate, Escape closes and returns focus to the trigger, Tab closes.
 */
export function Menu({ trigger, label, children, side = "bottom", align = "start", open: openProp, onOpenChange, className }: MenuProps) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const [focusFrom, setFocusFrom] = useState<"first" | "last">("first");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const triggerId = useId();
  const setOpen = useCallback(
    (v: boolean) => {
      if (openProp === undefined) setOpenState(v);
      onOpenChange?.(v);
    },
    [openProp, onOpenChange],
  );
  const close = useCallback(
    (returnFocus: boolean) => {
      setOpen(false);
      if (returnFocus) triggerRef.current?.focus({ preventScroll: true });
    },
    [setOpen],
  );

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(ITEM_SELECTOR));
    if (!items.length) return;
    const i = items.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => {
      e.preventDefault();
      items[(n + items.length) % items.length]?.focus();
    };
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i < 0 ? items.length - 1 : i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(items.length - 1);
    else if (e.key.length === 1 && /\S/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const ch = e.key.toLowerCase();
      for (let k = 1; k <= items.length; k++) {
        const it = items[(i + k) % items.length];
        if ((it.textContent ?? "").trim().toLowerCase().startsWith(ch)) {
          go((i + k) % items.length);
          break;
        }
      }
    }
  };

  const triggerProps: MenuTriggerProps & { open: boolean } = {
    ref: triggerRef,
    id: triggerId,
    "aria-haspopup": "menu",
    "aria-expanded": open,
    "aria-controls": open ? menuId : undefined,
    open,
    onClick: () => {
      setFocusFrom("first");
      setOpen(!open);
    },
    onKeyDown: (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setFocusFrom(e.key === "ArrowUp" ? "last" : "first");
        setOpen(true);
      }
    },
  };

  return (
    <MenuContext.Provider value={{ close }}>
      {trigger(triggerProps)}
      <Popover
        open={open}
        onOpenChange={setOpen}
        anchorRef={triggerRef}
        side={side}
        align={align}
        label={label}
        role="menu"
        id={menuId}
        initialFocus={focusFrom}
        className={className}
        onKeyDown={onMenuKey}
      >
        <div className={o.menu}>{children}</div>
      </Popover>
    </MenuContext.Provider>
  );
}

export interface MenuItemProps {
  children: ReactNode;
  /** Runs on click / Enter / Space; the menu then closes and focus returns to the trigger. */
  onSelect: () => void;
  icon?: ReactNode;
  /** Shortcut that does the same thing elsewhere (display only). */
  shortcut?: readonly string[];
  /** Short trailing text, e.g. a count. (Never "Soon" on a dead item: leave unavailable actions out, or disable them and say why.) */
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  /** Makes it a menuitemcheckbox with this checked state. */
  checked?: boolean;
}

export function MenuItem({ children, onSelect, icon, shortcut, hint, danger, disabled, checked }: MenuItemProps) {
  const ctx = useContext(MenuContext);
  const isCheck = checked !== undefined;
  return (
    <button
      type="button"
      role={isCheck ? "menuitemcheckbox" : "menuitem"}
      aria-checked={isCheck ? checked : undefined}
      aria-disabled={disabled || undefined}
      tabIndex={-1}
      className={o.item}
      data-orbit-fx="menuitem"
      data-danger={danger ? "" : undefined}
      onClick={() => {
        if (disabled) return;
        onSelect();
        ctx?.close(true);
      }}
    >
      {isCheck ? <span className={o.itemCheck}>{checked ? <Icon name="check" size={14} /> : null}</span> : null}
      {icon ? <span className={o.itemIcon}>{icon}</span> : null}
      <span className={o.itemLabel}>{children}</span>
      {hint ? <span className={o.itemHint}>{hint}</span> : null}
      {shortcut?.length ? <KeyCombo keys={shortcut} className={o.itemHint} plain /> : null}
    </button>
  );
}

export function MenuSeparator() {
  return <div role="separator" className={o.sep} />;
}

/** A non-interactive heading for a group of items. */
export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <div role="presentation" className={o.groupLabel}>
      {children}
    </div>
  );
}
