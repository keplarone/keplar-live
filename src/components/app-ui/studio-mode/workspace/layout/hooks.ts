"use client";
/**
 * The shell's bridge hooks, ported from StudioView, BlenderView and StudioOverlay (same calls, same order, same guards):
 * connection status subscriptions, optional auto-connect, Studio place selection (list_roblox_studios), the Blender file as
 * the place, the overlay window's state, the account (overlay), a ticking clock, and the desktop spring drag.
 */
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { resultText, type BlenderBridge, type BlenderStatus, type OverlayState, type StudioBridge, type StudioOverlayApi, type StudioStatus } from "@/lib/desktop/studio-bridge";
import { blenderPlace, parsePlaces, type Place } from "../../useStudioAgent";

/* ── Roblox Studio ─────────────────────────────────────────────────────────────────────────────────────────────── */

export type RobloxConnection = {
  status: StudioStatus | null;
  /** Open places (null until listed, and while not connected). */
  places: Place[] | null;
  busy: boolean;
  refreshing: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refreshPlaces: () => Promise<void>;
};

/**
 * Studio status (status() + onStatus), connect/disconnect, and the place list once connected (the first place is picked, or
 * the one already picked when it is still open). `autoConnect` connects when idle (the overlay does; the page asks first).
 */
export function useRobloxConnection(
  bridge: StudioBridge | null,
  enabled: boolean,
  setPlace: (p: Place | null) => void,
  current: Place | null,
  autoConnect: boolean,
): RobloxConnection {
  const [status, setStatus] = useState<StudioStatus | null>(null);
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const currentId = useRef<string | null>(current?.id ?? null);
  useEffect(() => { currentId.current = current?.id ?? null; }, [current]);

  useEffect(() => {
    if (!bridge || !enabled) return;
    let live = true;
    void bridge.status().then((st) => {
      if (!live) return;
      setStatus(st);
      if (st.state === "idle" && autoConnect) void bridge.connect().then((n) => { if (live) setStatus(n); });
    });
    const off = bridge.onStatus((st) => setStatus(st));
    return () => { live = false; off(); };
  }, [bridge, enabled, autoConnect]);

  const pick = useCallback((list: Place[]) => {
    setPlaces(list);
    setPlace(list.find((p) => p.id === currentId.current) ?? list[0] ?? null);
  }, [setPlace]);

  const connected = status?.state === "connected";
  useEffect(() => {
    if (!connected || !bridge) return;
    let live = true;
    void bridge.call("list_roblox_studios", {}).then((r) => { if (live) pick(r.ok ? parsePlaces(resultText(r)) : []); });
    return () => { live = false; };
  }, [connected, bridge, pick]);

  const refreshPlaces = useCallback(async () => {
    if (!bridge) return;
    setRefreshing(true);
    try {
      const r = await bridge.call("list_roblox_studios", {});
      pick(r.ok ? parsePlaces(resultText(r)) : []);
    } finally {
      setRefreshing(false);
    }
  }, [bridge, pick]);

  const connect = useCallback(async () => {
    if (!bridge) return;
    setBusy(true);
    try { setStatus(await bridge.connect()); } finally { setBusy(false); }
  }, [bridge]);
  const disconnect = useCallback(async () => {
    if (!bridge) return;
    setBusy(true);
    try { setStatus(await bridge.disconnect()); } finally { setBusy(false); }
  }, [bridge]);

  return { status, places: connected ? places : null, busy, refreshing, connect, disconnect, refreshPlaces };
}

/* ── Blender ───────────────────────────────────────────────────────────────────────────────────────────────────── */

export type BlenderConnection = {
  status: BlenderStatus | null;
  busy: boolean;
  /** The add-on setup's progress or result ("Installing the Keplar add-on in Blender…", then setup()'s message). */
  note: string;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  setup: () => Promise<void>;
};

/** Blender status, connect (clears the note), setup (installs the add-on), disconnect; the open .blend file becomes the place. */
export function useBlenderConnection(bb: BlenderBridge | null, enabled: boolean, setPlace: (p: Place | null) => void, autoConnect: boolean): BlenderConnection {
  const [status, setStatus] = useState<BlenderStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!bb || !enabled) return;
    let live = true;
    void bb.status().then((st) => {
      if (!live) return;
      setStatus(st);
      if (st.state !== "connected" && st.state !== "connecting" && autoConnect) void bb.connect().then((n) => { if (live) setStatus(n); });
    });
    const off = bb.onStatus((st) => setStatus(st));
    return () => { live = false; off(); };
  }, [bb, enabled, autoConnect]);

  // Connected: this file's saved chat comes back right away (not only on the first request).
  const file = status?.state === "connected" ? status.file ?? null : null;
  useEffect(() => { if (file !== null) setPlace(blenderPlace(file)); }, [file, setPlace]);

  const connect = useCallback(async () => {
    if (!bb) return;
    setBusy(true);
    setNote("");
    try { setStatus(await bb.connect()); } finally { setBusy(false); }
  }, [bb]);
  const setup = useCallback(async () => {
    if (!bb) return;
    setBusy(true);
    setNote("Installing the Keplar add-on in Blender…");
    try { setNote((await bb.setup()).message); } finally { setBusy(false); }
  }, [bb]);
  const disconnect = useCallback(async () => {
    if (!bb) return;
    setBusy(true);
    try { setStatus(await bb.disconnect()); } finally { setBusy(false); }
  }, [bb]);

  return { status, busy, note, connect, disconnect, setup };
}

/* ── Overlay window ────────────────────────────────────────────────────────────────────────────────────────────── */

/** The floating overlay window's state (open / collapsed / see-through), or null before it is known or without the API. */
export function useOverlayWindow(api: StudioOverlayApi | null | undefined): OverlayState | null {
  const [state, setState] = useState<OverlayState | null>(null);
  useEffect(() => {
    if (!api) return;
    let live = true;
    void api.state().then((o) => { if (live) setState(o); });
    const off = api.onState((o) => setState(o));
    return () => { live = false; off(); };
  }, [api]);
  return state;
}

/* ── Account (overlay: it has no app shell around it to pass plan and sign-in) ─────────────────────────────────── */

export function useAccount(): { plan: string; signedIn: boolean } | null {
  const [account, setAccount] = useState<{ plan: string; signedIn: boolean } | null>(null);
  useEffect(() => {
    let live = true;
    void fetch("/api/compute", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { plan?: string; signedIn?: boolean } | null) => { if (live) setAccount({ plan: d?.plan ?? "free", signedIn: Boolean(d?.signedIn) }); })
      .catch(() => { if (live) setAccount({ plan: "free", signedIn: false }); });
    return () => { live = false; };
  }, []);
  return account;
}

/* ── Clock ─────────────────────────────────────────────────────────────────────────────────────────────────────── */

/** Date.now(), refreshed every `ms` while `active` (and once when it turns active). */
export function useNow(active: boolean, ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const t = window.setInterval(tick, ms);
    return () => { window.clearTimeout(first); window.clearInterval(t); };
  }, [active, ms]);
  return now;
}

/* ── Desktop spring drag (keplar-desktop 0.2.4+, src/main/studio/overlay-drag.ts) ──────────────────────────────── */

/** Elements inside the drag handle that keep their own pointer behaviour (they never start a drag). */
const INTERACTIVE = "button, a, input, select, textarea, [role='menu'], [role='menuitemradio'], [role='separator'], [data-no-drag]";

/**
 * "spring": the desktop app moves the window itself on a critically damped spring (dragStart / dragEnd); the handle must not
 * carry -webkit-app-region: drag, which would swallow the pointer events. "region": older apps and Linux Wayland, where the
 * handle is an app-region drag area. Starts as "region" and switches once the app confirms spring drag is available.
 */
export function useSpringDrag(api: StudioOverlayApi | null | undefined): {
  mode: "spring" | "region";
  handleProps: {
    "data-drag": "spring" | "region";
    onPointerDown?: (e: ReactPointerEvent<HTMLElement>) => void;
    onPointerUp?: () => void;
    onPointerCancel?: () => void;
    onLostPointerCapture?: () => void;
  };
} {
  const o = api;
  const [spring, setSpring] = useState(false);
  const dragging = useRef(false);

  useEffect(() => {
    if (!o?.supports?.springDrag || typeof o.dragAvailable !== "function" || typeof o.dragStart !== "function" || typeof o.dragEnd !== "function") return;
    let live = true;
    void o.dragAvailable().then((ok) => { if (live) setSpring(Boolean(ok)); }).catch(() => { /* stays app-region */ });
    return () => { live = false; };
  }, [o]);

  const end = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    void o?.dragEnd?.().catch(() => {});
  }, [o]);

  useEffect(() => {
    if (!spring) return;
    window.addEventListener("blur", end);
    return () => window.removeEventListener("blur", end);
  }, [spring, end]);

  if (!spring || !o?.dragStart) return { mode: "region", handleProps: { "data-drag": "region" } };
  const start = o.dragStart;
  return {
    mode: "spring",
    handleProps: {
      "data-drag": "spring",
      onPointerDown: (e) => {
        if (e.button !== 0 || (e.target as HTMLElement).closest(INTERACTIVE)) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        dragging.current = true;
        void start({ x: e.clientX, y: e.clientY }).then((r) => { if (!r.dragging) dragging.current = false; }).catch(() => { dragging.current = false; });
      },
      onPointerUp: end,
      onPointerCancel: end,
      onLostPointerCapture: end,
    },
  };
}
