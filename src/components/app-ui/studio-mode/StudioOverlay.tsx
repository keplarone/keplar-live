"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { KeplarSymbol } from "@/components/brand";
import { blenderBridge, resultText, STUDIO_PLANS, studioBridge, type BlenderStatus, type OverlayState, type StudioStatus } from "@/lib/desktop/studio-bridge";
import { GlassIconButton, GlassLayer, GlassSwitch, morphGlass, useAnchoredMorph, useSceneTone } from "./liquid-glass/glass";
import g from "./liquid-glass/glass.module.css";
import { SolarCore } from "./SolarCore";
import { solarPulse, solarState } from "./solar-state";
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
  const [draft, setDraft] = useState(0);
  const [keys, setKeys] = useState(0);
  const [aboutOpen, setAboutOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLButtonElement>(null);
  const aboutRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  // A specular highlight follows the pointer across the glass (CSS variables, at most once per frame).
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    let raf = 0;
    let x = 0, y = 0;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      x = ((e.clientX - r.left) / r.width) * 100; y = ((e.clientY - r.top) / r.height) * 100;
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; el.style.setProperty("--mx", `${x.toFixed(1)}%`); el.style.setProperty("--my", `${y.toFixed(1)}%`); el.dataset.lit = ""; });
    };
    const onLeave = () => { delete el.dataset.lit; };
    el.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerleave", onLeave);
    return () => { cancelAnimationFrame(raf); el.removeEventListener("pointermove", onMove); el.removeEventListener("pointerleave", onLeave); };
  }, [win.collapsed]);

  useEffect(() => {
    if (!aboutOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setAboutOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aboutOpen]);
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
  const solar = solarState(a, draft);
  const pulse = solarPulse(a);
  const active = a.items.length > 0;
  const finishedRun = a.finished && !a.running;
  const scene = useSceneTone(a.viewport?.image);
  const aboutShown = useAnchoredMorph(aboutOpen, aboutRef, badgeRef);
  // Over a bright scene the glass darkens itself and bends less, so its text stays readable.
  const overLight = scene === "bright";
  /** Build: the button's glass travels up and becomes the execution strip (its final shape, while the stage is still resizing). */
  const launch = (button: { left: number; top: number; width: number; height: number }) => {
    const panel = panelRef.current, stage = stageRef.current;
    if (!panel || !stage) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const body = stage.parentElement?.getBoundingClientRect();
      if (!body) return;
      void morphGlass(button, { left: body.left + 12, top: body.top + 6, width: body.width - 24, height: 64 }, panel, { radiusTo: 16 });
    }));
  };

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
    <div className={s.panel} ref={panelRef} data-solar={solar} data-scene={scene}>
      <div className={s.aura} aria-hidden="true"><span data-a="1" /><span data-a="2" /><span data-a="3" /></div>
      <div className={s.glass} aria-hidden="true" />
      <div className={s.rim} aria-hidden="true" />
      <header className={s.head}>
        <svg className={s.grip} width="10" height="16" viewBox="0 0 12 18" fill="currentColor" aria-hidden="true"><circle cx="3" cy="3" r="1.5" /><circle cx="9" cy="3" r="1.5" /><circle cx="3" cy="9" r="1.5" /><circle cx="9" cy="9" r="1.5" /><circle cx="3" cy="15" r="1.5" /><circle cx="9" cy="15" r="1.5" /></svg>
        <span className={s.mark} data-busy={tone === "busy" || undefined}><KeplarSymbol size={18} /></span>
        <span className={s.headText}>
          <span className={s.name}>
            Keplar Studio
            <button ref={badgeRef} type="button" className={`${g.surface} ${s.solar}`} onClick={() => setAboutOpen((v) => !v)} aria-expanded={aboutOpen} aria-controls="solar-about"><GlassLayer host={badgeRef} radius={999} look={{ displacement: 30, aberration: 1.2, overLight }} />Solar 5.8 Ultra</button>
          </span>
          <span className={s.status}><span className={s.dot} data-tone={tone} aria-hidden="true" />{statusText}</span>
        </span>
        {!isBlender ? (
          <GlassIconButton overLight={overLight} onClick={() => void a.refreshViewport()} disabled={!connected || a.looking} aria-label="Let Keplar look at Studio again" title="Look again">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
          </GlassIconButton>
        ) : null}
        <GlassIconButton overLight={overLight} onClick={() => void bridge?.overlay?.seeThrough(!win.seeThrough)} aria-pressed={win.seeThrough} aria-label="See-through" title="See-through">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" /></svg>
        </GlassIconButton>
        <GlassIconButton overLight={overLight} onClick={() => void bridge?.overlay?.collapse(true)} aria-label="Collapse to a pill" title="Collapse">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 12h12" /></svg>
        </GlassIconButton>
        <GlassIconButton overLight={overLight} onClick={() => void bridge?.overlay?.close()} aria-label="Close the overlay and go back to Keplar" title="Back to Keplar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </GlassIconButton>
      </header>
      {bb ? (
        <div className={s.switchRow}>
          <GlassSwitch overLight={overLight} label="Work in" value={isBlender ? "blender" : "studio"} options={[{ value: "studio", label: APP.studio }, { value: "blender", label: APP.blender }]} onChange={(t) => pick(t)} disabled={a.running} disabledTitle="Finish or stop this build first" />
        </div>
      ) : null}
      <div className={s.progress} aria-hidden="true"><span style={{ width: `${a.running && !pct ? 8 : pct}%` }} data-live={a.running || undefined} /></div>
      {aboutShown ? (
        <div ref={aboutRef} id="solar-about" className={`${g.surface} ${s.about}`} role="dialog" aria-label="About Solar 5.8 Ultra">
          <GlassLayer host={aboutRef} radius={18} look={{ displacement: 56, blur: 0.12, overLight }} />
          <strong>Solar 5.8 Ultra</strong>
          <p>Keplar&apos;s building experience for Roblox Studio and Blender: it looks at your place, plans, makes changes through Keplar&apos;s tools and asks before risky ones.</p>
          <p className={s.aboutNote}>Solar is Keplar&apos;s name for this experience, not a separately trained model.</p>
          <button type="button" className={s.aboutClose} onClick={() => setAboutOpen(false)}>Close</button>
        </div>
      ) : null}
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
          <div ref={stageRef} className={`${active ? g.surface : ""} ${s.stage}`} data-mode={active ? "strip" : "hero"} data-done={finishedRun || undefined}>
            {active ? <GlassLayer host={stageRef} radius={16} look={{ displacement: 52, blur: 0.1, overLight }} /> : null}
            <SolarCore state={solar} pulse={pulse} typing={keys} className={s.coreCanvas} />
            {active ? (
              <div className={s.stageText} aria-live="polite">
                <span className={s.stageState}>{statusText}</span>
                {finishedRun ? (
                  <span className={s.stageMeta}>{a.stats.changes} {a.stats.changes === 1 ? "change" : "changes"} · {a.stats.steps} {a.stats.steps === 1 ? "step" : "steps"} · {a.units.toLocaleString()} credits</span>
                ) : a.plan.length ? <span className={s.stageMeta}>{done} of {a.plan.length} steps · {pct}%</span> : <span className={s.stageMeta}>Solar 5.8 Ultra</span>}
              </div>
            ) : null}
          </div>
          {a.plan.length ? (
            <details className={s.timeline} open={a.running || undefined}>
              <summary>Plan <span>{done}/{a.plan.length}</span></summary>
              <ol>
                {a.plan.map((p, i) => <li key={i} data-state={p.state} style={{ ["--i" as string]: i }}><span aria-hidden="true" />{p.text}</li>)}
              </ol>
            </details>
          ) : null}
          {!isBlender && a.viewport ? (
            <figure className={s.view} data-looking={a.looking || undefined}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a data URL from Studio */}
              <img src={a.viewport.image} alt="What Keplar sees in Studio" />
              <span className={s.scan} aria-hidden="true" />
            </figure>
          ) : null}
          <StudioDock key={isBlender ? "blender" : "studio"} a={a} compact canPlayTest={!isBlender} onTyping={(n) => { setDraft(n); setKeys((k) => k + 1); }} onLaunch={launch} />
        </div>
      )}
    </div>
  );
}
