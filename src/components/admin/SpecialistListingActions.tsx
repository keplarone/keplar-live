"use client";

import { useState } from "react";
import s from "./Admin.module.css";

/** List, hide or reject one Specialist directory entry. */
export function SpecialistListingActions({ token, status }: { token: string; status: "pending" | "listed" | "hidden" | "rejected" }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = async (decision: "list" | "hide" | "reject") => {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/admin/specialists", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, decision }) });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error || "Could not save.");
      window.location.reload();
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not save."); setBusy(false); }
  };
  return (
    <span className={s.switches}>
      {status !== "listed" ? <button type="button" className={s.btn} disabled={busy} onClick={() => set("list")}>{status === "pending" ? "Approve" : "List"}</button> : null}
      {status === "listed" ? <button type="button" className={s.btn} disabled={busy} onClick={() => set("hide")}>Hide</button> : null}
      {status === "pending" ? <button type="button" className={s.btn} disabled={busy} onClick={() => set("reject")}>Reject</button> : null}
      {err ? <span role="alert">{err}</span> : null}
    </span>
  );
}
