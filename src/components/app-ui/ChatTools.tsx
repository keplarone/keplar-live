"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import s from "./ChatTools.module.css";

const HINT = "keplar:tools-row";
const subscribeNone = () => () => undefined;
function readHint(): boolean { try { return localStorage.getItem(HINT) === "1"; } catch { return false; } }
type Status = { available: boolean; apps: { id: string; name: string; tools: number; auto: number }[]; autoRun: boolean };

/**
 * The per-conversation Tools switch, with the connected apps that are active for Ask. Rendered only for signed-in Plus/Pro/Business.
 * It only sends a request ("tools: true"); the server re-checks the plan, the connections, the owner's grants and policy.
 */
export function ChatToolsBar({ show, synced = true, on, onChange, onOpenApps }: { show: boolean; synced?: boolean; on: boolean; onChange: (v: boolean) => void; onOpenApps: () => void }) {
  const [st, setSt] = useState<Status | null>(null);
  // Remember (per browser) that this account has the Tools row, so the dock keeps its height while the plan is still loading.
  const hint = useSyncExternalStore(subscribeNone, readHint, () => false);
  useEffect(() => {
    try {
      if (show && st?.available) localStorage.setItem(HINT, "1");
      else if (synced && (!show || (st && !st.available))) localStorage.removeItem(HINT);
    } catch { /* storage blocked */ }
  }, [show, synced, st]);
  useEffect(() => {
    if (!show) return;
    let off = false;
    const load = () =>
      fetch("/api/mcp/chat", { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<Status>) : null))
        .then((d) => { if (!off) setSt(d); })
        .catch(() => undefined); // offline: keep the last known state
    void load();
    window.addEventListener("focus", load);
    return () => {
      off = true;
      window.removeEventListener("focus", load);
    };
  }, [show]);

  if (!show) return !synced && hint ? <div className={s.bar} aria-hidden="true" data-tools-pending=""><span className={s.switch} style={{ visibility: "hidden" }}>Tools off</span></div> : null;
  // Until the first answer arrives keep the bar's row (an invisible switch), so the composer does not jump up when it lands.
  if (!st) return <div className={s.bar} aria-hidden="true" data-tools-pending=""><span className={s.switch} style={{ visibility: "hidden" }}>Tools off</span></div>;
  // Hide the bar when tools aren't available or no connected app is on for Ask (no empty-state nudge).
  if (!st.available || !st.apps.length) return null;
  const names = st.apps.map((a) => a.name).join(", ");
  return (
    <div className={s.bar}>
      <button type="button" className={s.switch} aria-pressed={on} onClick={() => onChange(!on)} title="Let Ask use your connected apps in this conversation">
        <span className={s.pip} aria-hidden="true" />
        <span>Tools {on ? "on" : "off"}</span>
      </button>
      <span className={s.apps} role="status">
        {on ? `Using: ${names}. ${st.autoRun ? "Reads you allowed run on their own; everything else asks first." : "Every call asks you first."}` : `Off. Available: ${names}.`}
      </span>
      <button type="button" className={s.link} onClick={onOpenApps}>Manage</button>
    </div>
  );
}
