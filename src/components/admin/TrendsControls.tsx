"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import s from "./Admin.module.css";

type Settings = { paused: boolean; autoPublish: boolean; maxPerDay: number; maxLive: number };

export function TrendsControls({ settings }: { settings: Settings }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [perDay, setPerDay] = useState(String(settings.maxPerDay));
  const [maxLive, setMaxLive] = useState(String(settings.maxLive));

  const call = async (payload: Record<string, unknown>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/admin/trends", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const j = (await r.json().catch(() => ({}))) as { error?: string; summary?: { published: string[]; held: string[]; rejected: unknown[]; skipped?: string }; rolledBack?: number };
      if (!r.ok) setMsg(j.error ?? "Failed.");
      else {
        setMsg(j.summary ? (j.summary.skipped ? `Skipped: ${j.summary.skipped}` : `Run finished: ${j.summary.published.length} published, ${j.summary.held.length} held, ${j.summary.rejected.length} rejected.`) : j.rolledBack !== undefined ? `Rolled back ${j.rolledBack} page(s).` : "Saved.");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={s.controls}>
      <div className={s.switches}>
        {settings.paused ? (
          <button type="button" className={s.btn} disabled={busy} onClick={() => call({ action: "settings", paused: false })}>Resume the tracker</button>
        ) : (
          <button type="button" className={s.danger} disabled={busy} onClick={() => call({ action: "settings", paused: true }, "Pause the tracker? Nothing will be built or published, and every topic page will return 404 until you resume.")}>Kill switch: pause everything</button>
        )}
        <button type="button" className={s.btn} disabled={busy} onClick={() => call({ action: "settings", autoPublish: !settings.autoPublish })}>{settings.autoPublish ? "Turn auto-publish off" : "Turn auto-publish on"}</button>
        <button type="button" className={s.btn} disabled={busy || settings.paused} onClick={() => call({ action: "run" })}>Run now</button>
        <button type="button" className={s.warn} disabled={busy} onClick={() => call({ action: "rollback_all" }, "Roll back every published topic page? They will 404 immediately and will not be republished automatically.")}>Roll back all published</button>
      </div>
      <label className={s.field}>New pages per day (0 to 10)
        <input inputMode="numeric" value={perDay} onChange={(e) => setPerDay(e.target.value)} onBlur={() => call({ action: "settings", maxPerDay: Number(perDay) })} />
      </label>
      <label className={s.field}>Most live pages at once (0 to 200)
        <input inputMode="numeric" value={maxLive} onChange={(e) => setMaxLive(e.target.value)} onBlur={() => call({ action: "settings", maxLive: Number(maxLive) })} />
      </label>
      <p className={s.msg} role="status">{msg}</p>
    </div>
  );
}

export function RowActions({ slug, status }: { slug: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const act = async (action: "publish" | "rollback") => {
    if (action === "rollback" && !window.confirm(`Roll back ${slug}? It will 404 immediately.`)) return;
    setBusy(true);
    await fetch("/api/admin/trends", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, slug }) }).catch(() => null);
    setBusy(false);
    router.refresh();
  };
  return (
    <span className={s.switches}>
      {status === "held" ? <button type="button" className={s.btn} disabled={busy} onClick={() => act("publish")}>Approve and publish</button> : null}
      {status === "published" ? <button type="button" className={s.warn} disabled={busy} onClick={() => act("rollback")}>Roll back</button> : null}
    </span>
  );
}
