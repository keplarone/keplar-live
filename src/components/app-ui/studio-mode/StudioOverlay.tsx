"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { KeplarSymbol } from "@/components/brand";
import { blenderBridge, resultText, STUDIO_PLANS, studioBridge, type BlenderStatus, type OverlayState, type StudioStatus } from "@/lib/desktop/studio-bridge";
import { StudioDock } from "./StudioDock";
import { blenderPlace, OVERLAY_TARGET_KEY, overlayTarget, parsePlaces, setOverlayTarget, useStudioAgent } from "./useStudioAgent";
import s from "./studio-overlay.module.css";

const noSubscribe = () => () => {};
type Target = "studio" | "blender";
const APP: Record<Target, string> = { studio: "Studio", blender: "Blender" };

/**
 * The floating overlay (/app/studio/overlay): the build in a small always-on-top desktop window over Roblox Studio or Blender
 * (keplar-desktop src/main/studio/overlay.ts). The window is frameless and transparent; this page draws the panel, its draggable
 * header, and the collapsed pill. It connects by itself and runs its own build (useStudioAgent). Which app it works in is set by
 * the page that opened it (setOverlayTarget) and can be switched in the header when Blender is available (desktop app 0.1.8+).
 */
export function StudioOverlay() {
  const bridge = useSyncExternalStore(noSubscribe, studioBridge, () => null);
  const bb = useSyncExternalStore(noSubscribe, blenderBridge, () => null);
  const [target, setTarget] = useState<Target>(() => (typeof window === "undefined" ? "studio" : overlayTarget()));
  const [account, setAccount] = useState<{ plan: string; signedIn: boolean } | null>(null);
  const [studioStatus, setStudioStatus] = useState<StudioStatus | null>(null);
  const [blenderStatus, setBlenderStatus] = useState<BlenderStatus | null>(null);
  const [win, setWin] = useState<OverlayState>({ open: true, collapsed: false, seeThrough: false });
  const studio = useStudioAgent(bridge, "studio");
  const blender = useStudioAgent(bb, "blender");
  const isBlender = target === "blender" && Boolean(bb);
  const a = isBlender ? blender : studio;
  const status = isBlender ? blenderStatus : studioStatus;
  const allowed = !!account?.signedIn && STUDIO_PLANS.has(account.plan);
  const { setPlace: setStudioPlace } = studio;
  const { setPlace: setBlenderPlace } = blender;

  // The window is see-through: no page background, no site chrome.
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-overlay", "");
    return () => root.removeAttribute("data-overlay");
  }, []);

  // The main window picked the other app ("Float over Blender" / "Float over Studio") while this overlay was open.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === OVERLAY_TARGET_KEY) setTarget(overlayTarget()); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    let live = true;
    void fetch("/api/compute", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { plan?: string; signedIn?: boolean } | null) => { if (live) setAccount({ plan: d?.plan ?? "free", signedIn: Boolean(d?.signedIn) }); })
      .catch(() => { if (live) setAccount({ plan: "free", signedIn: false }); });
    return () => { live = false; };
  }, []);

  useEffect(() => bridge?.overlay?.onState((o) => setWin(o)), [bridge]);

  // Studio: status, and connect when idle (only while it is the app this overlay works in).
  useEffect(() => {
    if (!bridge || !allowed) return;
    let live = true;
    void bridge.status().then((st) => {
      if (!live) return;
      setStudioStatus(st);
      if (st.state === "idle" && !isBlender) void bridge.connect().then((n) => { if (live) setStudioStatus(n); });
    });
    const off = bridge.onStatus((st) => setStudioStatus(st));
    return () => { live = false; off(); };
  }, [bridge, allowed, isBlender]);

  // Blender: the same.
  useEffect(() => {
    if (!bb || !allowed) return;
    let live = true;
    void bb.status().then((st) => {
      if (!live) return;
      setBlenderStatus(st);
      if (st.state !== "connected" && st.state !== "connecting" && isBlender) void bb.connect().then((n) => { if (live) setBlenderStatus(n); });
    });
    const off = bb.onStatus((st) => setBlenderStatus(st));
    return () => { live = false; off(); };
  }, [bb, allowed, isBlender]);

  const studioConnected = studioStatus?.state === "connected";
  useEffect(() => {
    if (!studioConnected || !bridge) return;
    let live = true;
    void bridge.call("list_roblox_studios", {}).then((r) => { if (live) setStudioPlace(r.ok ? parsePlaces(resultText(r))[0] ?? null : null); });
    return () => { live = false; };
  }, [studioConnected, bridge, setStudioPlace]);

  // Blender: the open file's saved chat comes back when connected.
  const blenderFile = blenderStatus?.state === "connected" ? blenderStatus.file ?? null : null;
  useEffect(() => { if (blenderFile !== null) setBlenderPlace(blenderPlace(blenderFile)); }, [blenderFile, setBlenderPlace]);

  const pick = (t: Target) => { if (a.running) return; setOverlayTarget(t); setTarget(t); };

  const connected = status?.state === "connected";
  const app = APP[isBlender ? "blender" : "studio"];
  const statusText = !connected
    ? status?.state === "connecting" ? `Connecting to ${app}…` : status?.message ?? `Not connected to ${app}`
    : a.looking ? (isBlender ? "Reading the scene…" : "Looking at your place…")
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
        {bb ? (
          <span className={s.targets} role="group" aria-label="Work in">
            {(["studio", "blender"] as const).map((t) => (
              <button key={t} type="button" className={s.target} aria-pressed={(isBlender ? "blender" : "studio") === t} onClick={() => pick(t)} disabled={a.running} title={a.running ? "Finish or stop this build first" : undefined}>
                {APP[t]}
              </button>
            ))}
          </span>
        ) : null}
        {!isBlender ? (
          <button type="button" className={s.icon} onClick={() => void a.refreshViewport()} disabled={!connected || a.looking} aria-label="Let Keplar look at Studio again" title="Look again">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
          </button>
        ) : null}
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
        <p className={s.message}>{account.signedIn ? `${app} mode comes with Keplar Lite, Plus and Pro.` : `Sign in to Keplar in the main window to use ${app} mode.`}</p>
      ) : isBlender && blenderStatus && blenderStatus.state !== "connected" && blenderStatus.state !== "connecting" ? (
        <div className={s.message}>
          <p>{blenderStatus.message ?? "Open Blender with the Keplar add-on on."}</p>
          <button type="button" className={s.retry} onClick={() => void bb?.connect().then(setBlenderStatus)}>Try again</button>
        </div>
      ) : (
        <div className={s.body}>
          {!isBlender && a.viewport ? (
            <figure className={s.view} data-looking={a.looking || undefined}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a data URL from Studio */}
              <img src={a.viewport.image} alt="What Keplar sees in Studio" />
              <span className={s.scan} aria-hidden="true" />
            </figure>
          ) : null}
          <StudioDock key={isBlender ? "blender" : "studio"} a={a} compact canPlayTest={!isBlender} />
        </div>
      )}
    </div>
  );
}
