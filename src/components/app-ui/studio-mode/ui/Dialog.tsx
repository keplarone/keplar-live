"use client";

import { useEffect, useId, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { IconButton } from "./Button";
import { cx } from "./cx";
import { focusables } from "./floating";
import { Icon } from "./icons/Icon";
import o from "./overlay.module.css";

export interface DialogProps {
  open: boolean;
  /** Called with false on Escape, the close button, or a backdrop click (when `dismissible`). */
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** One short line under the title (linked as the dialog's description). */
  description?: ReactNode;
  children?: ReactNode;
  /** Action row (Buttons), right-aligned. Put the primary action last. */
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** Escape / backdrop / close button allowed. Default true. Set false only while a destructive action is mid-request. */
  dismissible?: boolean;
  /** Element to focus on open; default the first focusable control in the body/footer, else the dialog itself. */
  initialFocus?: RefObject<HTMLElement | null>;
  className?: string;
}

/**
 * Modal dialog on the native <dialog> (top layer, inert background). Focus is trapped (Tab / Shift+Tab wrap), Escape
 * closes, and focus returns to the element that was focused before it opened. Renders nothing while closed.
 */
export function Dialog(props: DialogProps) {
  if (!props.open) return null;
  return <OpenDialog {...props} />;
}

function OpenDialog({ onOpenChange, title, description, children, footer, size = "md", dismissible = true, initialFocus, className }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const previous = document.activeElement as HTMLElement | null;
    try {
      if (!el.open) el.showModal();
    } catch {
      el.setAttribute("open", "");
    }
    const target = initialFocus?.current ?? focusables(el).find((f) => !f.hasAttribute("data-dialog-close")) ?? el;
    target.focus({ preventScroll: true });
    return () => {
      try {
        if (el.open) el.close();
      } catch {
        /* already closed */
      }
      if (previous && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, [initialFocus]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onCancel = (e: Event) => {
      e.preventDefault(); // we own closing (and focus return)
      if (dismissible) onOpenChange(false);
    };
    el.addEventListener("cancel", onCancel);
    return () => el.removeEventListener("cancel", onCancel);
  }, [dismissible, onOpenChange]);

  return (
    <dialog
      ref={ref}
      className={cx(o.dialog, className)}
      data-motion="ks"
      data-size={size}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      aria-modal="true"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key !== "Tab") return;
        const items = focusables(e.currentTarget);
        if (!items.length) {
          e.preventDefault();
          return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === e.currentTarget)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }}
      onPointerDown={(e) => {
        // a press on the ::backdrop targets the <dialog> itself, outside its box
        if (!dismissible || e.target !== e.currentTarget) return;
        const r = e.currentTarget.getBoundingClientRect();
        const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        if (!inside) onOpenChange(false);
      }}
    >
      <div className={o.dialogHead}>
        <div className={o.dialogTitles}>
          <h2 id={titleId} className={o.dialogTitle}>
            {title}
          </h2>
          {description ? (
            <p id={descId} className={o.dialogDesc}>
              {description}
            </p>
          ) : null}
        </div>
        {dismissible ? (
          <IconButton size="sm" label="Close" tooltip={false} data-dialog-close="" icon={<Icon name="close" size={16} />} onClick={() => onOpenChange(false)} />
        ) : null}
      </div>
      {children ? <div className={o.dialogBody}>{children}</div> : null}
      {footer ? <div className={o.dialogFoot}>{footer}</div> : null}
    </dialog>
  );
}
