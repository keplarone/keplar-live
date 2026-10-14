"use client";
import { Button } from "@/components/kit";
import s from "./workspace.module.css";

/**
 * The confirm click every destructive action in a chat card waits for (delete, merge, remove). Nothing happens until "yes".
 * It stays in the card (like a chat row's "Delete this chat?") rather than a modal: a request made in words ("delete my Taxes
 * project") is saved with the chat, so a modal would reopen on every reload until answered. Kit Buttons; the safe one is last.
 */
export function Confirm({ text, yes, onYes, onNo, busy, danger = true }: { text: string; yes: string; onYes: () => void; onNo: () => void; busy?: boolean; danger?: boolean }) {
  return (
    <div className={s.confirm} role="group" aria-label={text}>
      <span>{text}</span>
      <Button size="sm" variant={danger ? "danger" : "primary"} loading={busy} onClick={onYes} data-confirm="">{yes}</Button>
      <Button size="sm" variant="secondary" disabled={busy} onClick={onNo}>Cancel</Button>
    </div>
  );
}
