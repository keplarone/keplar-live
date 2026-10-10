"use client";
/**
 * Browser side of a live session. Two interchangeable transports drive one Y.Doc + y-protocols Awareness:
 *
 *  RelayProvider     works on Vercel with no extra service. One long-lived NDJSON stream down (exact catch-up by state vector,
 *                    then merged updates and presence), batched POSTs up (≤ 2.5/s, updates + presence in one request), a
 *                    state-vector resync every 20 s that heals anything a dropped stream missed, BroadcastChannel so other
 *                    tabs in the same browser see keystrokes instantly, and a keepalive "leave" so your cursor vanishes on close.
 *  SocketProvider    the y-websocket protocol (Hocuspocus, y-websocket, y-partykit) when KEPLAR_COLLAB_WS_URL is configured.
 *
 * Both expose the same tiny surface: status, peers, onStatus, destroy.
 */
import * as Y from "yjs";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { fromB64, toB64 } from "@/lib/collab/doc";

export type LinkStatus = "connecting" | "live" | "reconnecting" | "offline";
export type Transport = { mode: "relay"; room: string } | { mode: "websocket"; room: string; url: string; token: string; expiresAt: number };
export interface CollabLink {
  readonly status: LinkStatus;
  readonly synced: boolean;
  onStatus(fn: (s: LinkStatus, synced: boolean) => void): () => void;
  /** Push everything pending right now (before a save, so the server has your last keystroke). */
  flush(): Promise<void>;
  destroy(): void;
}

const PUSH_EVERY = 400;
const RESYNC_EVERY = 20_000;
const AW_BEAT = 12_000;

abstract class Base implements CollabLink {
  status: LinkStatus = "connecting";
  synced = false;
  private fns = new Set<(s: LinkStatus, synced: boolean) => void>();
  onStatus(fn: (s: LinkStatus, synced: boolean) => void) { this.fns.add(fn); fn(this.status, this.synced); return () => { this.fns.delete(fn); }; }
  protected set(s: LinkStatus, synced = this.synced) {
    if (s === this.status && synced === this.synced) return;
    this.status = s; this.synced = synced;
    for (const f of this.fns) f(s, synced);
  }
  abstract flush(): Promise<void>;
  abstract destroy(): void;
}

export class RelayProvider extends Base {
  private pending: Uint8Array[] = [];
  private awDirty = true;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastPush = 0;
  private seq = 0;
  private stopped = false;
  private ctl: AbortController | null = null;
  private bc: BroadcastChannel | null = null;
  private beats: ReturnType<typeof setInterval>[] = [];
  private inflight: Promise<void> | null = null;
  private backoff = 800;

  constructor(private siteId: string, private doc: Y.Doc, private awareness: Awareness, private readOnly: boolean) {
    super();
    doc.on("update", this.onDoc);
    awareness.on("update", this.onAw);
    try {
      this.bc = new BroadcastChannel(`keplar-collab:${siteId}`);
      this.bc.onmessage = (e: MessageEvent<{ t: string; d: Uint8Array }>) => { if (e.data?.t === "u") Y.applyUpdate(doc, e.data.d, this); };
    } catch { this.bc = null; }
    this.beats.push(setInterval(() => void this.resync(), RESYNC_EVERY));
    this.beats.push(setInterval(() => { this.awDirty = true; this.schedule(); }, AW_BEAT));
    if (typeof window !== "undefined") window.addEventListener("pagehide", this.leave);
    void this.loop();
  }

  private onDoc = (u: Uint8Array, origin: unknown) => {
    if (origin === this || this.readOnly) return;
    this.pending.push(u);
    this.bc?.postMessage({ t: "u", d: u });
    this.schedule();
  };
  private onAw = (_c: unknown, origin: unknown) => { if (origin === "local") { this.awDirty = true; this.schedule(); } };

  private schedule() {
    if (this.timer || this.stopped) return;
    this.timer = setTimeout(() => { this.timer = null; void this.push(); }, Math.max(0, PUSH_EVERY - (Date.now() - this.lastPush)));
  }

  private localAw() {
    const st = this.awareness.getLocalState();
    return st ? { ...st, clientId: this.doc.clientID } : null;
  }

  private async push(): Promise<void> {
    if (this.inflight) { await this.inflight; if (this.pending.length || this.awDirty) this.schedule(); return; }
    if (!this.pending.length && !this.awDirty) return;
    const ups = this.pending.splice(0);
    const sendAw = this.awDirty;
    this.awDirty = false;
    this.lastPush = Date.now();
    this.inflight = (async () => {
      try {
        const res = await fetch(`/api/collab/${this.siteId}/sync`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client: String(this.doc.clientID), ...(ups.length ? { u: [toB64(ups.length === 1 ? ups[0] : Y.mergeUpdates(ups))] } : {}), ...(sendAw ? { aw: this.localAw() } : {}) }) });
        if (res.status === 403 && ups.length) { this.readOnly = true; return; }
        if (!res.ok) throw new Error(String(res.status));
      } catch {
        // keep the edits: they go out with the next push (Yjs merges duplicates, so a retry can never double-apply)
        this.pending.unshift(...ups);
        if (sendAw) this.awDirty = true;
        this.set("reconnecting");
        setTimeout(() => this.schedule(), 1500);
      } finally {
        this.inflight = null;
      }
    })();
    return this.inflight;
  }

  async flush() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    await this.push();
    if (this.inflight) await this.inflight;
  }

  private async resync() {
    if (this.stopped || typeof document !== "undefined" && document.hidden) return;
    try {
      const res = await fetch(`/api/collab/${this.siteId}/sync`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client: String(this.doc.clientID), sv: toB64(Y.encodeStateVector(this.doc)) }) });
      const j = (await res.json()) as { diff?: { d: string; seq: number } };
      if (j.diff) { Y.applyUpdate(this.doc, fromB64(j.diff.d), this); this.seq = Math.max(this.seq, j.diff.seq); }
    } catch { /* the stream loop handles reconnection */ }
  }

  private applyPresence(states: Record<string, unknown>[]) {
    const aw = this.awareness;
    const seen = new Set<number>();
    const added: number[] = [], updated: number[] = [], removed: number[] = [];
    for (const raw of states) {
      const id = Number(raw.clientId);
      if (!Number.isFinite(id) || !id || id === this.doc.clientID) continue;
      seen.add(id);
      const u = (raw.user ?? {}) as { color?: string };
      const st = { ...raw, user: { ...u, colorLight: `${u.color ?? "#888888"}33` } };
      const prev = aw.states.get(id);
      if (!prev) added.push(id);
      else if (JSON.stringify(prev) !== JSON.stringify(st)) updated.push(id);
      aw.states.set(id, st);
      aw.meta.set(id, { clock: (aw.meta.get(id)?.clock ?? 0) + 1, lastUpdated: Date.now() });
    }
    for (const id of [...aw.states.keys()]) if (id !== this.doc.clientID && !seen.has(id)) { aw.states.delete(id); aw.meta.delete(id); removed.push(id); }
    if (added.length || updated.length || removed.length) {
      aw.emit("change", [{ added, updated, removed }, "remote"]);
      aw.emit("update", [{ added, updated, removed }, "remote"]);
    }
  }

  private async loop() {
    while (!this.stopped) {
      this.ctl = new AbortController();
      try {
        const q = new URLSearchParams({ since: String(this.seq), sv: toB64(Y.encodeStateVector(this.doc)) });
        const res = await fetch(`/api/collab/${this.siteId}/sync?${q}`, { signal: this.ctl.signal, cache: "no-store" });
        if (res.status === 401 || res.status === 403 || res.status === 404) { this.set("offline"); return; }
        if (!res.ok || !res.body) throw new Error(String(res.status));
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i: number;
          while ((i = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, i).trim();
            buf = buf.slice(i + 1);
            if (!line) continue;
            const ev = JSON.parse(line) as { t: string; seq?: number; d?: string; states?: Record<string, unknown>[] };
            if ((ev.t === "sync" || ev.t === "u") && ev.d) Y.applyUpdate(this.doc, fromB64(ev.d), this);
            if (ev.seq) this.seq = Math.max(this.seq, ev.seq);
            if (ev.t === "sync") { this.backoff = 800; this.set("live", true); this.awDirty = true; this.schedule(); }
            if (ev.t === "aw" && ev.states) this.applyPresence(ev.states);
          }
        }
        // a normal end of a stream window: reconnect at once
      } catch (e) {
        if (this.stopped) return;
        if ((e as Error).name !== "AbortError") {
          this.set(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "reconnecting");
          await new Promise((r) => setTimeout(r, this.backoff));
          this.backoff = Math.min(this.backoff * 1.8, 10_000);
        }
      }
    }
  }

  private leave = () => {
    try {
      void fetch(`/api/collab/${this.siteId}/sync`, { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ client: String(this.doc.clientID), aw: null, ...(this.pending.length ? { u: [toB64(Y.mergeUpdates(this.pending))] } : {}) }) });
    } catch { /* closing */ }
  };

  destroy() {
    if (this.stopped) return;
    this.leave();
    this.stopped = true;
    this.ctl?.abort();
    if (this.timer) clearTimeout(this.timer);
    for (const b of this.beats) clearInterval(b);
    this.doc.off("update", this.onDoc);
    this.awareness.off("update", this.onAw);
    this.bc?.close();
    if (typeof window !== "undefined") window.removeEventListener("pagehide", this.leave);
    this.set("offline", false);
  }
}

/** y-websocket wire protocol (message 0 = sync, 1 = awareness). Token travels in the query string, verified by the server. */
export class SocketProvider extends Base {
  private ws: WebSocket | null = null;
  private stopped = false;
  private backoff = 600;
  constructor(private t: Extract<Transport, { mode: "websocket" }>, private doc: Y.Doc, private awareness: Awareness, private refresh: () => Promise<Extract<Transport, { mode: "websocket" }> | null>) {
    super();
    doc.on("update", this.onDoc);
    awareness.on("update", this.onAw);
    this.connect();
  }
  private send(buf: Uint8Array) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(new Uint8Array(buf)); }
  private onDoc = (u: Uint8Array, origin: unknown) => {
    if (origin === this) return;
    const e = encoding.createEncoder();
    encoding.writeVarUint(e, 0);
    syncProtocol.writeUpdate(e, u);
    this.send(encoding.toUint8Array(e));
  };
  private onAw = ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }) => {
    const e = encoding.createEncoder();
    encoding.writeVarUint(e, 1);
    encoding.writeVarUint8Array(e, encodeAwarenessUpdate(this.awareness, [...added, ...updated, ...removed]));
    this.send(encoding.toUint8Array(e));
  };
  private async connect() {
    if (this.stopped) return;
    if (Date.now() > this.t.expiresAt - 30_000) { const n = await this.refresh().catch(() => null); if (n) this.t = n; }
    const ws = new WebSocket(`${this.t.url}/${encodeURIComponent(this.t.room)}?token=${encodeURIComponent(this.t.token)}`);
    ws.binaryType = "arraybuffer";
    this.ws = ws;
    ws.onopen = () => {
      this.backoff = 600;
      const e = encoding.createEncoder();
      encoding.writeVarUint(e, 0);
      syncProtocol.writeSyncStep1(e, this.doc);
      this.send(encoding.toUint8Array(e));
      const a = encoding.createEncoder();
      encoding.writeVarUint(a, 1);
      encoding.writeVarUint8Array(a, encodeAwarenessUpdate(this.awareness, [this.doc.clientID]));
      this.send(encoding.toUint8Array(a));
      this.set("live");
    };
    ws.onmessage = (m) => {
      const d = decoding.createDecoder(new Uint8Array(m.data as ArrayBuffer));
      const kind = decoding.readVarUint(d);
      if (kind === 0) {
        const e = encoding.createEncoder();
        encoding.writeVarUint(e, 0);
        const r = syncProtocol.readSyncMessage(d, e, this.doc, this);
        if (r === syncProtocol.messageYjsSyncStep2) this.set("live", true);
        if (encoding.length(e) > 1) this.send(encoding.toUint8Array(e));
      } else if (kind === 1) applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(d), this);
    };
    ws.onclose = () => {
      if (this.stopped) return;
      removeAwarenessStates(this.awareness, [...this.awareness.getStates().keys()].filter((k) => k !== this.doc.clientID), this);
      this.set("reconnecting", this.synced);
      setTimeout(() => void this.connect(), this.backoff);
      this.backoff = Math.min(this.backoff * 1.8, 10_000);
    };
  }
  async flush() { /* websocket sends every update immediately */ }
  destroy() {
    this.stopped = true;
    removeAwarenessStates(this.awareness, [this.doc.clientID], "local");
    this.doc.off("update", this.onDoc);
    this.awareness.off("update", this.onAw);
    this.ws?.close();
    this.set("offline", false);
  }
}
