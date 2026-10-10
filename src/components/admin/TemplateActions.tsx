"use client";

import { useState } from "react";
import s from "./Admin.module.css";

/** Approve (live) or hide one template. Hidden templates 404 on every public page at once; the owner can still withdraw them. */
export function TemplateActions({ slug, status }: { slug: string; status: "live" | "pending" | "hidden" }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = async (next: "live" | "hidden") => {
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/templates", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug, status: next }) });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error || "Could not save.");
      window.location.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
      setBusy(false);
    }
  };
  return (
    <span className={s.switches}>
      {status !== "live" ? <button type="button" className={s.btn} disabled={busy} onClick={() => set("live")}>{status === "pending" ? "Approve" : "Restore"}</button> : null}
      {status !== "hidden" ? <button type="button" className={s.btn} disabled={busy} onClick={() => set("hidden")}>Hide</button> : null}
      {err ? <span role="alert">{err}</span> : null}
    </span>
  );
}
