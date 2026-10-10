"use client";
import { forwardRef, useEffect, useRef, useState, type ReactNode } from "react";
import { IconTrash } from "../icons";
import cx from "./delete-chat.module.css";
import type { MotionAttrs } from "@/components/motion/usePresence";

/** The inline question that replaces a chat row's content: "Delete this chat? Cancel / Delete". Escape cancels; focus starts on Cancel (the safe one). */
export function DeleteConfirm({ title, onCancel, onConfirm, variant = "row" }: { title: string; onCancel: () => void; onConfirm: () => void; variant?: "row" | "header" }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { cancelRef.current?.focus(); }, []);
  return (
    <div
      className={`${cx.confirm} ${variant === "header" ? cx.header : ""}`}
      role="group"
      aria-label={`Delete ${title}?`}
      data-delete-confirm=""
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onCancel(); } }}
    >
      <span className={cx.ask}>Delete this chat?</span>
      <button ref={cancelRef} type="button" className={cx.btn} onClick={onCancel}>Cancel</button>
      <button type="button" className={`${cx.btn} ${cx.danger}`} data-delete-yes="" onClick={onConfirm}>Delete</button>
    </div>
  );
}

/** The trash button that starts the question. */
export const DeleteTrigger = forwardRef<HTMLButtonElement, { title: string; id?: string; onClick: () => void }>(function DeleteTrigger({ title, id, onClick }, ref) {
  return (
    <button ref={ref} type="button" className={cx.trigger} aria-label={`Delete chat: ${title}`} title="Delete chat" data-delete-trigger="" data-delete-for={id} onClick={onClick}>
      <IconTrash size={15} />
    </button>
  );
});

/**
 * One self-contained delete action (trash button -> inline confirm). `children` is the row's normal content; it is hidden
 * while the question shows so the bar gets the whole row. Focus returns to the trash button after Cancel.
 */
export function DeleteChatAction({ title, onDelete, children, variant = "row", enabled = true }: { title: string; onDelete: () => void; children?: ReactNode; variant?: "row" | "header"; enabled?: boolean }) {
  const [asking, setAsking] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasAsking = useRef(false);
  useEffect(() => {
    if (!asking && wasAsking.current) triggerRef.current?.focus();
    wasAsking.current = asking;
  }, [asking]);

  if (!enabled) return <>{children}</>;
  const bar = <DeleteConfirm title={title} variant={variant} onCancel={() => setAsking(false)} onConfirm={() => { setAsking(false); onDelete(); }} />;
  const trigger = <DeleteTrigger ref={triggerRef} title={title} onClick={() => setAsking(true)} />;
  if (variant === "header") return asking ? bar : trigger;
  return (
    <div className={`${cx.item} ${children ? cx.reveal : ""}`} data-asking={asking || undefined}>
      {children}
      {asking ? bar : trigger}
    </div>
  );
}

/** "Chat deleted · Undo" with a thin bar that drains over the undo window. */
export function UndoToast({ title, ms, onUndo, motion }: { title: string; ms: number; onUndo: () => void; motion?: MotionAttrs }) {
  // Rises in from the bottom edge. With `motion` from usePresence / <Presence> it also sinks out instead of vanishing.
  return (
    <div className={cx.toast} role="status" aria-live="polite" data-undo-toast="" style={{ ["--undo-ms" as string]: `${ms}ms` }} {...(motion ?? { "data-motion": "toast", "data-state": "open" })}>
      <span className={cx.toastText}>Deleted “{title}”</span>
      <button type="button" className={cx.undo} data-undo="" onClick={onUndo}>Undo</button>
      <span className={cx.bar} aria-hidden="true" />
    </div>
  );
}
