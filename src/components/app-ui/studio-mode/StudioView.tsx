"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { TwoTone } from "@/components/page/TwoTone";
import { resultText, STUDIO_PLANS, studioBridge, type StudioStatus } from "@/lib/desktop/studio-bridge";
import { StudioDock } from "./StudioDock";
import s from "./studio-mode.module.css";

type Place = { name: string; id?: string };
const noSubscribe = () => () => {};

/** Parses list_roblox_studios ({"studios":[...]}) into named places; tolerant of the shape changing. */
function parsePlaces(text: string): Place[] {
  try {
    const j = JSON.parse(text) as { studios?: unknown[] };
    return (j.studios ?? []).map((x, i) => {
      if (typeof x === "string") return { name: x };
      const o = (x ?? {}) as Record<string, unknown>;
      const name = String(o.placeName ?? o.name ?? o.title ?? `Studio ${i + 1}`);
      const id = o.id ?? o.studioId ?? o.placeId;
      return id === undefined ? { name } : { name, id: String(id) };
    });
  } catch {
    return [];
  }
}

const LABEL: Record<StudioStatus["state"], string> = {
  idle: "Not connected",
  connecting: "Connecting…",
  connected: "Connected",
  missing: "Studio not found",
  unsupported: "Not available here",
  error: "Could not connect",
};

/**
 * Roblox Studio mode (desktop app only, Lite and up): connect to Roblox Studio on this computer through the desktop app's bridge,
 * show what is open, and once connected, the chat dock (StudioDock) where Keplar plans and builds with the person's approval.
 */
export function StudioView({ plan, signedIn }: { plan: string; signedIn: boolean | null }) {
  // The desktop bridge is fixed for the page's life; the server render (and the first client render) see none.
  const bridge = useSyncExternalStore(noSubscribe, studioBridge, () => null);
  const [status, setStatus] = useState<StudioStatus | null>(null);
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [busy, setBusy] = useState(false);
  const allowed = signedIn === true && STUDIO_PLANS.has(plan);

  const refreshPlaces = useCallback(async () => {
    if (!bridge) return;
    const r = await bridge.call("list_roblox_studios", {});
    setPlaces(r.ok ? parsePlaces(resultText(r)) : []);
  }, [bridge]);

  useEffect(() => {
    if (!bridge || !allowed) return;
    let live = true;
    void bridge.status().then((st) => { if (live) setStatus(st); });
    const off = bridge.onStatus((st) => setStatus(st));
    return () => { live = false; off(); };
  }, [bridge, allowed]);

  const connected = status?.state === "connected";
  useEffect(() => {
    if (!connected || !bridge) return;
    let live = true;
    void bridge.call("list_roblox_studios", {}).then((r) => { if (live) setPlaces(r.ok ? parsePlaces(resultText(r)) : []); });
    return () => { live = false; };
  }, [connected, bridge]);
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

  const head = (
    <header className={s.head}>
      <span className={s.kicker}>Desktop app · Lite and up</span>
      <h1 className={s.title}><TwoTone text="Build in Roblox Studio" /></h1>
      <p className={s.lede}>Keplar plans the work and builds it in Studio on this computer: scripts, models, lighting, UI and effects. You approve every major change.</p>
    </header>
  );

  if (!bridge) {
    return (
      <div className={s.wrap}>
        {head}
        <section className={s.card}>
          <h2 className={s.cardTitle}>Open this in the Keplar desktop app</h2>
          <p className={s.text}>Studio mode talks to Roblox Studio on your computer, so it runs in the Keplar desktop app for Windows and macOS, not in a browser tab.</p>
          <Link href="/download" className={s.primary}>Download Keplar for desktop</Link>
        </section>
      </div>
    );
  }
  if (signedIn === false) {
    return (
      <div className={s.wrap}>
        {head}
        <section className={s.card}>
          <h2 className={s.cardTitle}>Sign in to use Studio mode</h2>
          <p className={s.text}>Studio mode is part of Keplar Lite, Plus and Pro.</p>
          <Link href="/signin?next=/app/studio" className={s.primary}>Sign in</Link>
        </section>
      </div>
    );
  }
  if (signedIn === true && !allowed) {
    return (
      <div className={s.wrap}>
        {head}
        <section className={s.card}>
          <h2 className={s.cardTitle}>Studio mode comes with Lite and up</h2>
          <p className={s.text}>Upgrade to Keplar Lite, Plus or Pro to build in Roblox Studio with Keplar.</p>
          <Link href="/pricing" className={s.primary}>See plans</Link>
        </section>
      </div>
    );
  }

  const st = status?.state ?? "idle";
  return (
    <div className={s.wrap}>
      {head}
      <section className={s.card} aria-live="polite">
        <div className={s.statusRow}>
          <span className={s.dot} data-state={st} aria-hidden="true" />
          <span className={s.statusLabel}>{LABEL[st]}</span>
          {status?.server ? <span className={s.meta}>{status.server} · {status.tools.length} tools</span> : null}
        </div>
        {status?.message ? <p className={s.text}>{status.message}</p> : null}
        {st === "connected" ? (
          <div className={s.places}>
            <div className={s.placesHead}>
              <h2 className={s.cardTitle}>Open in Studio</h2>
              <button type="button" className={s.ghost} onClick={() => void refreshPlaces()}>Refresh</button>
            </div>
            {shownPlaces === null ? <p className={s.text}>Looking for open places…</p> : shownPlaces.length ? (
              <ul className={s.placeList}>{shownPlaces.map((p, i) => <li key={`${p.id ?? ""}-${i}`}>{p.name}</li>)}</ul>
            ) : (
              <p className={s.text}>No place is open. Open a place in Roblox Studio, then refresh.</p>
            )}
          </div>
        ) : st === "unsupported" ? null : (
          <p className={s.text}>Have Roblox Studio installed and open. Keplar starts Studio&apos;s own connection on this computer; nothing is sent anywhere until you ask Keplar to build.</p>
        )}
        <div className={s.actions}>
          {st === "connected" ? (
            <button type="button" className={s.ghost} onClick={() => void disconnect()} disabled={busy}>Disconnect</button>
          ) : st !== "unsupported" ? (
            <button type="button" className={s.primary} onClick={() => void connect()} disabled={busy || st === "connecting"}>{st === "idle" ? "Connect to Roblox Studio" : "Try again"}</button>
          ) : null}
        </div>
      </section>
      {st === "connected" ? <StudioDock bridge={bridge} /> : null}
    </div>
  );
}
