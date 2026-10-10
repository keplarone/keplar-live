"use client";

import { useState } from "react";
import s from "./Admin.module.css";

/** Approve or deny one held referral claim. Posts to /api/admin/referrals/:id (admin only, audited), then reloads. Approving grants extra usage credit, never cash. */
export function ReferralActions({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const decide = async (decision: "approve" | "deny") => {
    setBusy(true);
    setErr("");
    try {
      const r = await fetch(`/api/admin/referrals/${encodeURIComponent(id)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision }) });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error || "Could not save.");
      window.location.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
      setBusy(false);
    }
  };
  return (
    <span className={s.switches}>
      <button type="button" className={s.btn} disabled={busy} onClick={() => decide("approve")}>Approve</button>
      <button type="button" className={s.btn} disabled={busy} onClick={() => decide("deny")}>Deny</button>
      {err ? <span role="alert">{err}</span> : null}
    </span>
  );
}
