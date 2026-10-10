"use client";
import { useEffect, useState } from "react";
import s from "./account.module.css";

type Row = { id: string; current: boolean; device: string; provider: string; createdAt: string; lastSeen: string; remembered: boolean };

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const via = (p: string) => (p === "magic-link" ? "email link" : p === "google" ? "Google" : p === "microsoft" ? "Microsoft" : "");

/** Active sign-ins for this account, with per-device and all-device sign-out. Hidden when the account database isn't connected. */
export function DeviceSessions() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [off, setOff] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    fetch("/api/account/sessions", { cache: "no-store", credentials: "same-origin" })
      .then(async (res) => {
        if (!live) return;
        if (res.status === 501) return setOff(true);
        if (res.status === 401) {
          window.location.assign("/signin");
          return;
        }
        const j = (await res.json().catch(() => ({}))) as { sessions?: Row[] };
        setRows(j.sessions ?? []);
      })
      .catch(() => live && setError("Couldn't load your devices."));
    return () => {
      live = false;
    };
  }, [tick]);

  async function call(method: "DELETE" | "POST", payload: unknown, label: string) {
    setBusy(label);
    setError(null);
    try {
      const res = await fetch("/api/account/sessions", { method, headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify(payload) });
      const j = (await res.json().catch(() => ({}))) as { error?: string; current?: boolean };
      if (!res.ok && res.status !== 404) throw new Error(j.error || "Something went wrong.");
      if (method === "POST" || j.current) {
        window.location.assign("/");
        return;
      }
      setTick((t) => t + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
    setBusy(null);
  }

  if (off) return null;
  return (
    <div className={s.panel} id="devices">
      <div className={s.row}>
        <span className={s.k}>Signed-in devices</span>
        <span className={s.v}>{rows ? rows.length : "…"}</span>
      </div>
      {rows ? (
        <ul className={s.sessions}>
          {rows.map((r) => (
            <li key={r.id} className={s.session}>
              <span className={s.sessionInfo}>
                <span className={s.v}>
                  {r.device} {r.current ? <span className={s.badge}>This device</span> : null}
                </span>
                <span className={s.note}>
                  Active {when(r.lastSeen)} · signed in {when(r.createdAt)}
                  {via(r.provider) ? ` with ${via(r.provider)}` : ""}
                  {r.remembered ? "" : " · not remembered"}
                </span>
              </span>
              {!r.current ? (
                <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} disabled={busy !== null} onClick={() => void call("DELETE", { id: r.id }, r.id)}>
                  {busy === r.id ? "Signing out…" : "Sign out"}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <div className={s.actions}>
        <button type="button" className={`${s.btn} ${s.btnGhost}`} disabled={busy !== null} onClick={() => void call("POST", { action: "all" }, "all")}>
          {busy === "all" ? "Signing out…" : "Sign out of all devices"}
        </button>
      </div>
      <p className={s.note}>You stay signed in on a device for 60 days after you last use it. Signing out of a device ends its session immediately.</p>
      {error ? <p className={`${s.note} ${s.err}`} role="alert">{error}</p> : null}
    </div>
  );
}
