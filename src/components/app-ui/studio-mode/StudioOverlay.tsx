"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { KeplarSymbol } from "@/components/brand";
import { resultText, STUDIO_PLANS, studioBridge, type OverlayState, type StudioStatus } from "@/lib/desktop/studio-bridge";
import { StudioDock } from "./StudioDock";
import { parsePlaces, useStudioAgent } from "./useStudioAgent";
import s from "./studio-overlay.module.css";

const noSubscribe = () => () => {};

/**
 * The Studio overlay (/app/studio/overlay): the build in a small always-on-top desktop window over Roblox Studio
 * (keplar-desktop src/main/studio/overlay.ts). The window is frameless and transparent; this page draws the panel, its
 * draggable header, and the collapsed pill. It connects to Studio by itself and runs its own build (useStudioAgent).
 */
export function StudioOverlay() {
  const bridge = useSyncExternalStore(noSubscribe, studioBridge, () => null);
  const [account, setAccount] = useState<{ plan: string; signedIn: boolean } | null>(null);
  const [status, setStatus] = useState<StudioStatus | null>(null);
  const [win, setWin] = useState<OverlayState>({ open: true, collapsed: false, seeThrough: false });
  const a = useStudioAgent(bridge);
  const { setPlace } = a;
  const allowed = !!account?.signedIn && STUDIO_PLANS.has(account.plan);

  // The window is see-through: no page background, no site chrome.
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-overlay", "");
    return () => root.removeAttribute("data-overlay");
  }, []);

  useEffect(() => {
    let live = true;
    void fetch("/api/compute", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { plan?: string; signedIn?: boolean } | null) => { if (live) setAccount({ plan: d?.plan ?? "free", signedIn: Boolean(d?.signedIn) }); })
      .catch(() => { if (live) setAccount({ plan: "free", signedIn: false }); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!bridge || !allowed) return;
    let live = true;
    void bridge.status().then((st) => {
      if (!live) return;
      setStatus(st);
      if (st.state === "idle") void bridge.connect().then((n) => { if (live) setStatus(n); });
    });
    const off = bridge.onStatus((st) => setStatus(st));
    const offWin = bridge.overlay?.onState((o) => setWin(o));
    return () => { live = false; off(); offWin?.(); };
  }, [bridge, allowed]);

  const connected = status?.state === "connected";
  useEffect(() => {
    if (!connected || !bridge) return;
    let live = true;
    void bridge.call("list_roblox_studios", {}).then((r) => { if (live) setPlace(r.ok ? parsePlaces(resultText(r))[0] ?? null : null); });
    return () => { live = false; };
  }, [connected, bridge, setPlace]);

  const statusText = !connected
    ? status?.state === "connecting" ? "Connecting to Studio…" : status?.message ?? "Not connected"
    : a.looking ? "Looking at your place…"
      : a.running ? (a.current ? `Building · step ${a.current}${a.plan.length ? ` of ${a.plan.length}` : ""}` : "Planning…")
        : a.paused ? "Paused" : a.finished ? "Finished" : a.place ? a.place.name : "Ready";
  const done = a.plan.filter((p) => p.state === "done").length;
  const pct = a.plan.length ? Math.round((done / a.plan.length) * 100) : 0;
  const tone = a.running || a.looking ? "busy" : connected ? "ok" : "off";

  if (win.collapsed) {
    return (
      <div className={s.pill}>
        <span className={s.pillDrag}>
          <KeplarSymbol size={16} />
          <span className={s.dot} data-tone={tone} aria-hidden="true" />
          <span className={s.pillText}>{statusText}</span>
          {a.pending ? <span className={s.badge}>{a.pending} to approve</span> : null}
        </span>
        <button type="button" className={s.icon} onClick={() => void bridge?.overlay?.collapse(false)} aria-label="Open the overlay">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6" /></svg>
        </button>
      </div>
    );
  }

  return (
    <div className={s.panel}>
      <div className={s.aura} aria-hidden="true"><span data-a="1" /><span data-a="2" /><span data-a="3" /></div>
      <header className={s.head}>
        <svg className={s.grip} width="10" height="16" viewBox="0 0 12 18" fill="currentColor" aria-hidden="true"><circle cx="3" cy="3" r="1.5" /><circle cx="9" cy="3" r="1.5" /><circle cx="3" cy="9" r="1.5" /><circle cx="9" cy="9" r="1.5" /><circle cx="3" cy="15" r="1.5" /><circle cx="9" cy="15" r="1.5" /></svg>
        <KeplarSymbol size={18} />
        <span className={s.headText}>
          <span className={s.name}>Keplar</span>
          <span className={s.status}><span className={s.dot} data-tone={tone} aria-hidden="true" />{statusText}</span>
        </span>
        <button type="button" className={s.icon} onClick={() => void a.refreshViewport()} disabled={!connected || a.looking} aria-label="Let Keplar look at Studio again" title="Look again">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
        </button>
        <button type="button" className={s.icon} onClick={() => void bridge?.overlay?.seeThrough(!win.seeThrough)} aria-pressed={win.seeThrough} aria-label="See-through" title="See-through">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" /></svg>
        </button>
        <button type="button" className={s.icon} onClick={() => void bridge?.overlay?.collapse(true)} aria-label="Collapse to a pill" title="Collapse">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 12h12" /></svg>
        </button>
        <button type="button" className={s.icon} onClick={() => void bridge?.overlay?.close()} aria-label="Close the overlay and go back to Keplar" title="Back to Keplar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </header>
      <div className={s.progress} aria-hidden="true"><span style={{ width: `${a.running && !pct ? 8 : pct}%` }} data-live={a.running || undefined} /></div>
      {!bridge ? (
        <p className={s.message}>Open this from the Keplar desktop app.</p>
      ) : account && !allowed ? (
        <p className={s.message}>{account.signedIn ? "Studio mode comes with Keplar Lite, Plus and Pro." : "Sign in to Keplar in the main window to use Studio mode."}</p>
      ) : (
        <div className={s.body}>
          {a.viewport ? (
            <figure className={s.view} data-looking={a.looking || undefined}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a data URL from Studio */}
              <img src={a.viewport.image} alt="What Keplar sees in Studio" />
              <span className={s.scan} aria-hidden="true" />
            </figure>
          ) : null}
          <StudioDock a={a} compact />
        </div>
      )}
    </div>
  );
}
