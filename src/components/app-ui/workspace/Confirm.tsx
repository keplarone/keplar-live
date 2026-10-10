"use client";
import s from "./workspace.module.css";

/** The confirm click every destructive action in a chat card waits for (delete, merge, remove). Nothing happens until "yes". */
export function Confirm({ text, yes, onYes, onNo, busy, danger = true }: { text: string; yes: string; onYes: () => void; onNo: () => void; busy?: boolean; danger?: boolean }) {
  return (
    <div className={s.confirm} role="group" aria-label={text}>
      <span>{text}</span>
      <button type="button" className={danger ? s.danger : s.primary} disabled={busy} onClick={onYes} data-confirm="">{busy ? "…" : yes}</button>
      <button type="button" className={s.ghost} disabled={busy} onClick={onNo}>Cancel</button>
    </div>
  );
}
