"use client";
import { useId, useState } from "react";
import { readSaved, storageKey, writeSaved, scopeOf } from "@/components/app-ui/state/scope";
import s from "./account.module.css";

/** Forget this account's chats kept in this browser (the server copies are already gone). Projects and settings stay. */
export function clearLocalChats(userId: string) {
  const key = storageKey(scopeOf(userId));
  if (!key) return;
  const saved = readSaved(key);
  if (saved) writeSaved(key, { ...saved, threads: [], activeThreadId: null });
}

/** Settings: delete every saved chat for this account. Needs the word DELETE typed first. */
export function DeleteAllChats({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const id = useId();

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/chats", { method: "DELETE", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: typed.trim() }) });
      const j = (await res.json().catch(() => ({}))) as { deleted?: number; error?: string };
      if (!res.ok) throw new Error(j.error || "Couldn't delete your chats.");
      clearLocalChats(userId);
      setDone(j.deleted ?? 0);
      setOpen(false);
      setTyped("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete your chats.");
    }
    setBusy(false);
  }

  return (
    <div className={s.panel} id="delete-chats" aria-labelledby={`${id}-h`}>
      <div className={s.row}>
        <h2 id={`${id}-h`} className={s.cardTitle}>Chats</h2>
      </div>
      <p className={s.note}>Delete every chat saved to your account, with the summaries and answer feedback tied to them. Your saved memory notes and anonymous usage totals stay; manage memory in the Memory section. To remove a single chat, use the trash icon next to it in Keplar.</p>
      {done !== null ? <p className={s.note} role="status" data-delete-all-done="">{done === 0 ? "You had no saved chats." : `Deleted ${done} ${done === 1 ? "chat" : "chats"}.`}</p> : null}
      {!open ? (
        <div className={s.actions}>
          <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => { setOpen(true); setDone(null); }}>Delete all chats</button>
        </div>
      ) : (
        <form className={s.form} onSubmit={(e) => { e.preventDefault(); if (typed.trim() === "DELETE") void run(); }}>
          <p className={s.note}>This permanently deletes all your chats. It can&rsquo;t be undone.</p>
          <label className={s.fieldLabel} htmlFor={`${id}-t`}>Type DELETE to confirm</label>
          <input id={`${id}-t`} className={s.input} value={typed} autoComplete="off" autoCapitalize="characters" spellCheck={false} onChange={(e) => setTyped(e.target.value)} />
          <div className={s.actions}>
            <button type="submit" className={s.btn} disabled={busy || typed.trim() !== "DELETE"}>{busy ? "Deleting…" : "Delete all chats"}</button>
            <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => { setOpen(false); setTyped(""); setError(null); }} disabled={busy}>Cancel</button>
          </div>
        </form>
      )}
      {error ? <p className={`${s.note} ${s.err}`} role="alert">{error}</p> : null}
    </div>
  );
}
