"use client";

import { useState } from "react";
import s from "./Admin.module.css";

export function ErrorStatusButton({ id, status }: { id: string; status: "open" | "resolved" }) {
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" className={s.btn} disabled={busy} onClick={async () => {
      setBusy(true);
      const r = await fetch("/api/admin/errors", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, status: status === "open" ? "resolved" : "open" }) });
      if (r.ok) window.location.reload(); else setBusy(false);
    }}>{status === "open" ? "Mark resolved" : "Reopen"}</button>
  );
}
