"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { TwoTone } from "@/components/page/TwoTone";
import { resultText, STUDIO_PLANS, studioBridge, type OverlayState, type StudioStatus } from "@/lib/desktop/studio-bridge";
import { StudioDock } from "./StudioDock";
import { StudioPanel } from "./StudioPanel";
import { parsePlaces, useStudioAgent, type Place } from "./useStudioAgent";
import s from "./studio-mode.module.css";

const noSubscribe = () => () => {};

const LABEL: Record<StudioStatus["state"], string> = {
  idle: "Not connected",
  connecting: "Connecting…",
  connected: "Connected",
  missing: "Studio not found",
  unsupported: "Not available here",
  error: "Could not connect",
};

/** Starting points on the welcome screen. Picking one fills the request box once Keplar is connected. */
export const STUDIO_IDEAS = [
  { title: "Neon sci-fi city", line: "Towers, sky lanes with flying cars, rain and holo signs", tone: "city", prompt: "Build a dense neon sci-fi city: varied towers with neon trim, streets with props and holographic signs, flying cars on looping sky lanes, rain, and a moody night lighting setup." },
  { title: "Obby with checkpoints", line: "20 stages that get harder, a timer and a leaderboard", tone: "obby", prompt: "Make a 20-stage obby that gets harder as you go, with checkpoints, a run timer, a stage counter UI and a leaderboard for best times." },
  { title: "Tycoon shop UI", line: "Animated shop, currency counter, works on phones", tone: "shop", prompt: "Design a polished tycoon shop UI: animated open/close, item cards with prices, a currency counter that ticks up, hover and press feedback, and a layout that works on phones." },
  { title: "Sword slash VFX", line: "Layered trail, sparks and impact burst on hit", tone: "vfx", prompt: "Create a sword slash effect: a layered trail while swinging, sparks, and an impact burst with a short camera shake when it hits something." },
] as const;

const CAN_DO = ["Scripts and systems", "Maps and models", "Lighting and mood", "UI that works on phones", "Particles, beams, trails", "Fixes from your play tests", "Creator Store assets"];

/** The soft colour fields behind the Studio page (decorative, still when reduced motion is on). */
export function StudioAura() {
  return (
    <div className={s.aura} aria-hidden="true">
      <span data-a="1" />
      <span data-a="2" />
      <span data-a="3" />
    </div>
  );
}

/** The skyline picture on the welcome screen (decorative). */
function Skyline() {
  return (
    <div className={s.skyline} aria-hidden="true">
      <span className={s.skyLane} />
      {[52, 74, 40, 84, 60, 70, 48].map((h, i) => <span key={i} className={s.tower} data-i={i} style={{ height: `${h}%` }} />)}
      <span className={s.skyChat}>
        <span className={s.skyBubble}>Built the north district: 24 towers with neon trim.</span>
        <span className={s.skyChip}><span className={s.okDot} />Checked 3 screenshots · 0 errors</span>
      </span>
    </div>
  );
}

/**
 * Roblox Studio mode (desktop app only, Lite and up). Before connecting: a welcome with the three steps and ideas to start
 * from. Connected: the chat dock with a side panel showing what Keplar sees (viewport), the plan, changes and the run. The
 * build can move into a small always-on-top overlay over Studio (desktop app 0.1.7+); this page then says so.
 */
export function StudioView({ plan, signedIn }: { plan: string; signedIn: boolean | null }) {
  // The desktop bridge is fixed for the page's life; the server render (and the first client render) see none.
  const bridge = useSyncExternalStore(noSubscribe, studioBridge, () => null);
  const [status, setStatus] = useState<StudioStatus | null>(null);
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [overlay, setOverlay] = useState<OverlayState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const allowed = signedIn === true && STUDIO_PLANS.has(plan);
  const a = useStudioAgent(bridge);
  const { setPlace } = a;

  useEffect(() => {
    if (!bridge || !allowed) return;
    let live = true;
    void bridge.status().then((st) => { if (live) setStatus(st); });
    const off = bridge.onStatus((st) => setStatus(st));
    const offOverlay = bridge.overlay?.onState((o) => setOverlay(o));
    void bridge.overlay?.state().then((o) => { if (live) setOverlay(o); });
    return () => { live = false; off(); offOverlay?.(); };
  }, [bridge, allowed]);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(t);
  }, []);

  const connected = status?.state === "connected";
  const refreshPlaces = useCallback(async () => {
    if (!bridge) return;
    const r = await bridge.call("list_roblox_studios", {});
    const list = r.ok ? parsePlaces(resultText(r)) : [];
    setPlaces(list);
    setPlace(list[0] ?? null);
  }, [bridge, setPlace]);
  useEffect(() => {
    if (!connected || !bridge) return;
    let live = true;
    void bridge.call("list_roblox_studios", {}).then((r) => {
      if (!live) return;
      const list = r.ok ? parsePlaces(resultText(r)) : [];
      setPlaces(list);
      setPlace(list[0] ?? null);
    });
    return () => { live = false; };
  }, [connected, bridge, setPlace]);
  const shownPlaces = connected ? places : null;

  const connect = async () => {
    if (!bridge) return;
    setBusy(true);
    try { setStatus(await bridge.connect()); } finally { setBusy(false); }
  };
  const disconnect = async () => {
    if (!bridge) return;
    setBusy(true);
    try { setStatus(await bridge.disconnect()); } finally { setBusy(false); }
  };
  const pickIdea = (prompt: string) => {
    setDraft(prompt);
    if (!connected) void connect();
  };

  const kicker = <span className={s.kicker}>Desktop app · Lite and up</span>;

  if (!bridge || signedIn === false || (signedIn === true && !allowed)) {
    const card = !bridge
      ? { title: "Open this in the Keplar desktop app", text: "Studio mode talks to Roblox Studio on your computer, so it runs in the Keplar desktop app for Windows and macOS, not in a browser tab.", href: "/download", cta: "Download Keplar for desktop" }
      : signedIn === false
        ? { title: "Sign in to use Studio mode", text: "Studio mode is part of Keplar Lite, Plus and Pro.", href: "/signin?next=/app/studio", cta: "Sign in" }
        : { title: "Studio mode comes with Lite and up", text: "Upgrade to Keplar Lite, Plus or Pro to build in Roblox Studio with Keplar.", href: "/pricing", cta: "See plans" };
    return (
      <div className={s.wrap}>
        <StudioAura />
        <header className={s.head}>
          {kicker}
          <h1 className={s.title}><TwoTone text="Build in Roblox Studio" /></h1>
          <p className={s.lede}>Keplar plans the work and builds it in Studio on this computer: scripts, models, lighting, UI and effects. You approve every major change.</p>
        </header>
        <section className={s.card}>
          <h2 className={s.cardTitle}>{card.title}</h2>
          <p className={s.text}>{card.text}</p>
          <Link href={card.href} className={s.primary}>{card.cta}</Link>
        </section>
      </div>
    );
  }

  const st = status?.state ?? "idle";

  if (st !== "connected") {
    return (
      <div className={s.wrap} data-wide="">
        <StudioAura />
        <header className={s.hero}>
          <div className={s.heroText}>
            {kicker}
            <h1 className={s.heroTitle}><TwoTone text="Build in Roblox Studio" /></h1>
            <p className={s.lede}>Describe a game, a map, a UI or an effect. Keplar looks at your place, plans it, builds it in Studio on this computer and asks before every major change. Then you play-test it and say what to change.</p>
            <div className={s.heroActions} aria-live="polite">
              {st !== "unsupported" ? (
                <button type="button" className={s.primary} data-size="lg" onClick={() => void connect()} disabled={busy || st === "connecting"}>
                  {st === "connecting" ? "Connecting…" : st === "idle" ? "Connect to Roblox Studio" : "Try again"}
                </button>
              ) : null}
              <span className={s.statusLine}><span className={s.dot} data-state={st} aria-hidden="true" />{status?.message ?? (st === "idle" ? "Open Roblox Studio, then connect" : LABEL[st])}</span>
            </div>
            {draft ? <p className={s.draftNote}>Ready to build: “{draft.slice(0, 80)}{draft.length > 80 ? "…" : ""}”</p> : null}
          </div>
          <Skyline />
        </header>

        <section className={s.block} aria-labelledby="studio-how">
          <h2 id="studio-how" className={s.blockTitle}><TwoTone text="Three steps to your first build" /></h2>
          <ol className={s.steps}>
            <li><span className={s.stepNum}>1</span><strong>Open a place in Studio</strong><span>Any place works, from an empty Baseplate to a game you are already making.</span></li>
            <li><span className={s.stepNum}>2</span><strong>Connect</strong><span>Keplar starts Studio&apos;s own connection on this computer. Nothing is sent anywhere until you ask for a build.</span></li>
            <li><span className={s.stepNum}>3</span><strong>Describe it, add references</strong><span>Screenshots or a short clip of a UI, effect or game you want to match. Approve each change as it goes.</span></li>
          </ol>
        </section>

        <section className={s.block} aria-labelledby="studio-ideas">
          <h2 id="studio-ideas" className={s.blockTitle}><TwoTone text="Start from an idea" /></h2>
          <div className={s.ideas}>
            {STUDIO_IDEAS.map((idea) => (
              <button key={idea.title} type="button" className={s.idea} data-pressed={draft === idea.prompt || undefined} aria-pressed={draft === idea.prompt} onClick={() => pickIdea(idea.prompt)}>
                <span className={s.ideaArt} data-tone={idea.tone} aria-hidden="true" />
                <span className={s.ideaTitle}>{idea.title}</span>
                <span className={s.ideaLine}>{idea.line}</span>
              </button>
            ))}
          </div>
        </section>

        <section className={s.split} aria-labelledby="studio-can">
          <div className={s.card} data-grow="">
            <h2 id="studio-can" className={s.cardTitle}>What Keplar does in Studio</h2>
            <ul className={s.chips}>{CAN_DO.map((c) => <li key={c}>{c}</li>)}</ul>
          </div>
          <div className={s.card}>
            <h3 className={s.cardTitle}>You stay in charge</h3>
            <p className={s.text}>It never deletes, publishes or touches data stores without asking. Pause or stop any time.</p>
          </div>
        </section>
      </div>
    );
  }

  const placeName = a.place?.name ?? shownPlaces?.[0]?.name ?? null;
  return (
    <div className={s.wrap} data-wide="" data-connected="">
      <StudioAura />
      <header className={s.bar}>
        <div className={s.barText}>
          {kicker}
          <h1 className={s.title}><TwoTone text="Build in Roblox Studio" /></h1>
        </div>
        <div className={s.barActions}>
          <span className={s.statusPill}>
            <span className={s.dot} data-state="connected" aria-hidden="true" />
            Connected
            {shownPlaces && shownPlaces.length > 1 ? (
              <select className={s.placeSelect} value={a.place?.id ?? ""} onChange={(e) => setPlace(shownPlaces.find((p) => p.id === e.target.value) ?? null)} aria-label="Place to build in" disabled={a.running}>
                {shownPlaces.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            ) : placeName ? <span className={s.placeName}>{placeName}</span> : null}
          </span>
          <button type="button" className={s.iconBtn} onClick={() => void refreshPlaces()} aria-label="Refresh the list of open places" title="Refresh places">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></svg>
          </button>
          {bridge.overlay ? <button type="button" className={s.ghost} onClick={() => void bridge.overlay?.open()} disabled={a.running}>Float over Studio</button> : null}
          <button type="button" className={s.ghost} onClick={() => void disconnect()} disabled={busy || a.running}>Disconnect</button>
        </div>
      </header>
      {shownPlaces && shownPlaces.length === 0 ? <p className={s.note} data-tone="warn">No place is open. Open a place in Roblox Studio, then refresh.</p> : null}
      {overlay?.open ? (
        <section className={s.card}>
          <h2 className={s.cardTitle}>Keplar is floating over Studio</h2>
          <p className={s.text}>Build from the overlay while you watch Studio. Close it to come back here.</p>
          <button type="button" className={s.primary} onClick={() => void bridge.overlay?.close()}>Bring it back here</button>
        </section>
      ) : (
        <div className={s.workspace}>
          <StudioDock a={a} draft={draft} onDraftUsed={() => setDraft("")} />
          <StudioPanel a={a} now={now} />
        </div>
      )}
    </div>
  );
}
