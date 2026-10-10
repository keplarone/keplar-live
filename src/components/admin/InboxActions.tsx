"use client";

import { useState } from "react";
import s from "./Admin.module.css";

/** Status buttons for one report or ticket. Posts to /api/admin/inbox (admin only, audited), then reloads the list. */
export function InboxActions({ kind, id, current, options }: { kind: "report" | "ticket"; id: string; current: string; options: string[] }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = async (status: string) => {
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/admin/inbox", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, id, status }) });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error || "Could not save.");
      window.location.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
      setBusy(false);
    }
  };
  return (
    <span className={s.switches}>
      {options.filter((o) => o !== current).map((o) => <button key={o} type="button" className={s.btn} disabled={busy} onClick={() => set(o)}>Mark {o}</button>)}
      {err ? <span role="alert">{err}</span> : null}
    </span>
  );
}
