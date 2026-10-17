"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * Modal dialog on the native <dialog> (focus trap, Escape, top layer). It rises out of a blur (Space Studio's entry). Styles:
 * .sp-dialog in src/styles/space.css. `actions` sit bottom-right (Space buttons).
 *
 *   <Dialog open={open} onClose={() => setOpen(false)} title="Delete this chat?" actions={<>…</>}>This cannot be undone.</Dialog>
 */
export function Dialog({ open, onClose, title, children, actions, className, labelledBy }: { open: boolean; onClose: () => void; title: ReactNode; children?: ReactNode; actions?: ReactNode; className?: string; labelledBy?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const auto = useId();
  const titleId = labelledBy ?? `${auto}-t`;
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={className ? `sp-dialog ${className}` : "sp-dialog"}
      data-motion="none"
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // a press on the backdrop (outside the box) closes it
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose();
        }
      }}
    >
      <h2 id={titleId} className="sp-dialog__title">{title}</h2>
      {children ? <div className="sp-dialog__body">{children}</div> : null}
      {actions ? <div className="sp-dialog__actions">{actions}</div> : null}
    </dialog>
  );
}
