"use client";
/** One live session: the shared Y.Doc, presence, the transport, follow mode, and the session actions (save, pull, split). */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { api } from "../api";
import { filesOf, fingerprint, metaOf, pushTerm, termOf, toB64, type TermLine } from "@/lib/collab/doc";
import { initialsOf, type CollabAction, type CollabRole } from "@/lib/collab/roles";
import { RelayProvider, SocketProvider, type CollabLink, type LinkStatus, type Transport } from "./collab-client";

export type SessionInfo = {
  site: { id: string; name: string; kind: "site" | "app"; headVersion: number; publishedVersion: number | null; slug: string };
  me: { id: string; name: string; color: string; role: CollabRole; roleName: string; via: "owner" | "team" | "invite"; actions: CollabAction[] };
  room: { room: string; base: number; head: number; behind: boolean; dirty: boolean; seq: number; changed: { path: string; added: number; removed: number; status: string }[] };
  transport: Transport;
  backend: "postgres" | "memory";
  branches: { id: string; parentId: string; parentName: string; childId: string; baseVersion: number; byName: string; at: string; childWorkspaceId: string }[];
  baseFingerprints: Record<string, string>;
  livePreview: string | null;
};

export type Peer = { clientId: number; userId: string; name: string; initials: string; color: string; role: string; file?: string; line?: number; viewport?: number; following?: number | null; typing?: number; tab?: string; me: boolean };

type Local = { file?: string; line?: number; viewport?: number; following?: number | null; typing?: number; tab?: string };

function useDocVersion(doc: Y.Doc | null) {
  const ver = useRef(0);
  const sub = useCallback((fn: () => void) => {
    if (!doc) return () => undefined;
    let raf = 0;
    const h = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; ver.current++; fn(); }); };
    doc.on("update", h);
    return () => { doc.off("update", h); if (raf) cancelAnimationFrame(raf); };
  }, [doc]);
  return useSyncExternalStore(sub, () => ver.current, () => 0);
}

export function useLiveSession(siteId: string, opts: { tab?: string } = {}) {
  const [info, setInfo] = useState<SessionInfo | null>(null);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);
  const [status, setStatus] = useState<LinkStatus>("connecting");
  const [synced, setSynced] = useState(false);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [following, setFollowing] = useState<number | null>(null);
  const [fingerprints, setFingerprints] = useState<Record<string, string>>({});
  const [doc, setDoc] = useState<Y.Doc | null>(null);
  const [awareness, setAwareness] = useState<Awareness | null>(null);
  const link = useRef<CollabLink | null>(null);
  const reload = useRef(0);
  const [nonce, setNonce] = useState(0);
  /** Bumps only when file contents change (not for terminal lines or presence): drives the preview reload and the instant critic. */
  const [filesVer, setFilesVer] = useState(0);

  const load = useCallback(async () => {
    const r = await api<SessionInfo>(`/api/collab/${siteId}`);
    setInfo(r);
    setFingerprints(r.baseFingerprints ?? {});
    return r;
  }, [siteId]);

  useEffect(() => {
    let dead = false;
    const myLoad = ++reload.current;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a reconnect clears the last error before opening the session again
    setError(null);
    let cleanup = () => undefined as void;
    (async () => {
      let r: SessionInfo;
      try { r = await load(); } catch (e) { if (!dead) setError({ message: (e as Error).message, status: (e as { status?: number }).status }); return; }
      if (dead || myLoad !== reload.current) return;
      const d = new Y.Doc();
      const aw = new Awareness(d);
      aw.setLocalState({ clientId: d.clientID, user: { id: r.me.id, name: r.me.name, color: r.me.color, colorLight: `${r.me.color}33`, role: r.me.role }, tab: opts.tab ?? "live" });
      const readOnly = !r.me.actions.includes("edit");
      const l: CollabLink = r.transport.mode === "websocket"
        ? new SocketProvider(r.transport, d, aw, async () => { const n = await api<SessionInfo>(`/api/collab/${siteId}`); return n.transport.mode === "websocket" ? n.transport : null; })
        : new RelayProvider(siteId, d, aw, readOnly);
      link.current = l;
      const offStatus = l.onStatus((st, sy) => { setStatus(st); setSynced(sy); });
      const onAw = () => {
        const out: Peer[] = [];
        aw.getStates().forEach((raw, id) => {
          const st = raw as { user?: { id?: string; name?: string; color?: string; role?: string } } & Local;
          if (!st?.user?.name) return;
          out.push({ clientId: id, userId: st.user.id ?? String(id), name: st.user.name, initials: initialsOf(st.user.name), color: st.user.color ?? "#888", role: st.user.role ?? "editor", file: st.file, line: st.line, viewport: st.viewport, following: st.following ?? null, typing: st.typing, tab: st.tab, me: id === d.clientID });
        });
        out.sort((a, b) => Number(b.me) - Number(a.me) || a.name.localeCompare(b.name));
        setPeers(out);
      };
      aw.on("change", onAw);
      onAw();
      const fm = filesOf(d);
      const onFiles = () => setFilesVer((n) => n + 1);
      fm.observeDeep(onFiles);
      setDoc(d);
      setAwareness(aw);
      cleanup = () => { offStatus(); aw.off("change", onAw); fm.unobserveDeep(onFiles); l.destroy(); aw.destroy(); d.destroy(); };
    })();
    return () => { dead = true; cleanup(); link.current = null; setDoc(null); setAwareness(null); setSynced(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, nonce]);

  const ver = useDocVersion(doc);
  const files = useMemo(() => {
    void ver;
    if (!doc) return [] as { path: string; size: number; changed: boolean }[];
    const out: { path: string; size: number; changed: boolean }[] = [];
    filesOf(doc).forEach((t, path) => { const text = t.toString(); out.push({ path, size: text.length, changed: fingerprints[path] !== fingerprint(text) }); });
    for (const p of Object.keys(fingerprints)) if (!filesOf(doc).has(p)) out.push({ path: p, size: 0, changed: true });
    return out.sort((a, b) => order(a.path) - order(b.path) || a.path.localeCompare(b.path));
  }, [doc, ver, fingerprints]);
  const term = useMemo(() => { void ver; return doc ? termOf(doc).toArray() : ([] as TermLine[]); }, [doc, ver]);
  const base = useMemo(() => { void ver; return doc ? Number(metaOf(doc).get("base") ?? info?.room.base ?? 0) : info?.room.base ?? 0; }, [doc, ver, info]);

  const setLocal = useCallback((patch: Local) => {
    if (!awareness) return;
    const cur = awareness.getLocalState() ?? {};
    const changed = Object.entries(patch).some(([k, v]) => (cur as Record<string, unknown>)[k] !== v);
    if (changed) awareness.setLocalState({ ...cur, ...patch });
  }, [awareness]);

  const follow = useCallback((clientId: number | null) => { setFollowing(clientId); setLocal({ following: clientId }); }, [setLocal]);
  // the person you follow left: stop following
  // eslint-disable-next-line react-hooks/set-state-in-effect -- presence is external state: clears follow mode (and our awareness field) when they leave
  useEffect(() => { if (following !== null && !peers.some((p) => p.clientId === following)) follow(null); }, [peers, following, follow]);

  const me = info?.me ?? null;
  const say = useCallback((lines: Omit<TermLine, "id" | "at" | "by" | "color">[]) => {
    if (!doc || !me) return;
    pushTerm(doc, lines.map((l) => ({ ...l, by: me.name.split(/[\s@]/)[0] || me.name, color: me.color })));
  }, [doc, me]);

  const contributors = useCallback(() => [...new Set(peers.filter((p) => !p.me && p.role !== "viewer").map((p) => p.name))], [peers]);

  const save = useCallback(async (message?: string) => {
    if (!doc || !info) throw new Error("Not connected yet.");
    await link.current?.flush();
    const r = await api<{ version: number; changed: SessionInfo["room"]["changed"]; headVersion: number; baseFingerprints: Record<string, string> }>(`/api/collab/${siteId}`, {
      method: "POST",
      body: JSON.stringify({ action: "save", message, contributors: contributors(), ...(info.transport.mode === "websocket" ? { state: toB64(Y.encodeStateAsUpdate(doc)) } : {}) }),
    });
    metaOf(doc).set("base", r.version);
    setFingerprints(r.baseFingerprints);
    setInfo((i) => (i ? { ...i, site: { ...i.site, headVersion: r.headVersion }, room: { ...i.room, base: r.version, head: r.headVersion, behind: false, dirty: false } } : i));
    return r;
  }, [doc, info, siteId, contributors]);

  const pull = useCallback(async () => {
    await link.current?.flush();
    const r = await api<{ room: SessionInfo["room"]; baseFingerprints: Record<string, string> }>(`/api/collab/${siteId}`, { method: "POST", body: JSON.stringify({ action: "pull" }) });
    setFingerprints(r.baseFingerprints);
    setInfo((i) => (i ? { ...i, room: r.room } : i));
    return r.room;
  }, [siteId]);

  const split = useCallback(async () => {
    if (!doc || !info) throw new Error("Not connected yet.");
    await link.current?.flush();
    return api<{ site: { id: string; name: string; headVersion: number } }>(`/api/collab/${siteId}`, { method: "POST", body: JSON.stringify({ action: "split", ...(info.transport.mode === "websocket" ? { state: toB64(Y.encodeStateAsUpdate(doc)) } : {}) }) });
  }, [doc, info, siteId]);

  const refresh = useCallback(async () => { try { await load(); } catch { /* keep the last good info */ } }, [load]);
  const reconnect = useCallback(() => setNonce((n) => n + 1), []);
  const liveFilesNow = useCallback(() => {
    const out: Record<string, string> = {};
    if (doc) filesOf(doc).forEach((t, p) => { out[p] = t.toString(); });
    return out;
  }, [doc]);

  return { info, error, status, synced, peers, doc, awareness, files, filesVer, term, base, following, follow, setLocal, say, save, pull, split, refresh, reconnect, liveFilesNow, can: (a: CollabAction) => Boolean(info?.me.actions.includes(a)) };
}

const order = (p: string) => (p === "index.html" ? 0 : /\.html?$/.test(p) ? 1 : /\.css$/.test(p) ? 2 : /^(app|main|index)\.(m?jsx?|tsx?)$/.test(p) ? 3 : 4);
export type LiveSession = ReturnType<typeof useLiveSession>;
