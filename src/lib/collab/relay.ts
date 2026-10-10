/**
 * Durable relay for live sessions, built for Vercel serverless (no long-lived sockets): every Yjs update is appended to a
 * per-room log in Postgres, every browser reads the log from its cursor over a streamed response (SSE), and presence
 * (awareness) is a short-TTL row per participant. Without DATABASE_URL an in-process store is used (local dev and tests).
 *
 * Correctness does not depend on the log being read perfectly in order: Yjs updates are idempotent and commutative, readers
 * re-read a small overlap window, and clients periodically re-sync by state vector (`diffFor`), so every peer converges.
 * The log is compacted into one merged update once it grows past COMPACT_AT rows.
 */
import * as Y from "yjs";
import { neonConfigured, neonQuery } from "@/lib/create/platform/neon";
import { fromB64, toB64 } from "./doc";

export const COMPACT_AT = 300;
export const AWARENESS_TTL_MS = 30_000;
export const OVERLAP = 24;

export type LogRow = { seq: number; client: string; data: Uint8Array };
export type AwRow = { client: string; state: Record<string, unknown>; at: number };

export interface RelayStore {
  /** Creates the room at `base` if absent; true when this call created it (the creator seeds it). */
  claimRoom(room: string, base: number): Promise<boolean>;
  getRoom(room: string): Promise<{ base: number } | null>;
  /** Compare-and-set of the room's base version: only one caller wins a re-base. */
  casBase(room: string, from: number, to: number): Promise<boolean>;
  append(room: string, client: string, data: Uint8Array): Promise<number>;
  since(room: string, after: number, limit?: number): Promise<LogRow[]>;
  all(room: string): Promise<LogRow[]>;
  replaceUpTo(room: string, upTo: number, merged: Uint8Array): Promise<void>;
  count(room: string): Promise<number>;
  putAwareness(room: string, client: string, state: Record<string, unknown> | null): Promise<void>;
  awareness(room: string): Promise<AwRow[]>;
  dropRoom(room: string): Promise<void>;
}

/* ── in-process (dev, tests) ── */
type MemRoom = { base: number; log: LogRow[]; aw: Map<string, AwRow> };
const g = globalThis as unknown as { __keplarCollab?: { seq: number; rooms: Map<string, MemRoom> } };
const mem = () => (g.__keplarCollab ??= { seq: 0, rooms: new Map() });

export class MemoryRelay implements RelayStore {
  private r(room: string) { return mem().rooms.get(room); }
  async claimRoom(room: string, base: number) {
    if (this.r(room)) return false;
    mem().rooms.set(room, { base, log: [], aw: new Map() });
    return true;
  }
  async getRoom(room: string) { const r = this.r(room); return r ? { base: r.base } : null; }
  async casBase(room: string, from: number, to: number) {
    const r = this.r(room);
    if (!r || r.base !== from) return false;
    r.base = to;
    return true;
  }
  async append(room: string, client: string, data: Uint8Array) {
    const r = this.r(room);
    if (!r) throw new Error("room missing");
    const seq = ++mem().seq;
    r.log.push({ seq, client, data });
    return seq;
  }
  async since(room: string, after: number, limit = 500): Promise<LogRow[]> { const log: LogRow[] = this.r(room)?.log ?? []; return log.filter((x) => x.seq > after).slice(0, limit); }
  async all(room: string): Promise<LogRow[]> { const log: LogRow[] = this.r(room)?.log ?? []; return [...log]; }
  async replaceUpTo(room: string, upTo: number, merged: Uint8Array) {
    const r = this.r(room);
    if (!r) return;
    const seq = ++mem().seq;
    r.log = [...r.log.filter((x: LogRow) => x.seq > upTo), { seq, client: "compact", data: merged }].sort((a: LogRow, b: LogRow) => a.seq - b.seq);
  }
  async count(room: string) { return this.r(room)?.log.length ?? 0; }
  async putAwareness(room: string, client: string, state: Record<string, unknown> | null) {
    const r = this.r(room);
    if (!r) return;
    if (state) r.aw.set(client, { client, state, at: Date.now() });
    else r.aw.delete(client);
  }
  async awareness(room: string) {
    const r = this.r(room);
    const cut = Date.now() - AWARENESS_TTL_MS;
    return [...(r?.aw.values() ?? [])].filter((a) => a.at >= cut);
  }
  async dropRoom(room: string) { mem().rooms.delete(room); }
}

/* ── Postgres ── */
let schema: Promise<void> | null = null;
function ensure() {
  schema ??= (async () => {
    await neonQuery("CREATE TABLE IF NOT EXISTS keplar_collab_rooms (room text PRIMARY KEY, base integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())");
    await neonQuery("CREATE TABLE IF NOT EXISTS keplar_collab_log (seq bigserial PRIMARY KEY, room text NOT NULL, client text NOT NULL, data text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())");
    await neonQuery("CREATE INDEX IF NOT EXISTS keplar_collab_log_room ON keplar_collab_log (room, seq)");
    await neonQuery("CREATE TABLE IF NOT EXISTS keplar_collab_aw (room text NOT NULL, client text NOT NULL, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (room, client))");
  })().catch((e) => { schema = null; throw e; });
  return schema;
}
const rowOf = (r: Record<string, unknown>): LogRow => ({ seq: Number(r.seq), client: String(r.client), data: fromB64(String(r.data)) });

export class PgRelay implements RelayStore {
  async claimRoom(room: string, base: number) {
    await ensure();
    const r = await neonQuery("INSERT INTO keplar_collab_rooms (room, base) VALUES ($1, $2) ON CONFLICT (room) DO NOTHING RETURNING room", [room, base]);
    return r.length > 0;
  }
  async getRoom(room: string) {
    await ensure();
    const r = await neonQuery("SELECT base FROM keplar_collab_rooms WHERE room = $1", [room]);
    return r[0] ? { base: Number(r[0].base) } : null;
  }
  async casBase(room: string, from: number, to: number) {
    await ensure();
    const r = await neonQuery("UPDATE keplar_collab_rooms SET base = $3, updated_at = now() WHERE room = $1 AND base = $2 RETURNING room", [room, from, to]);
    return r.length > 0;
  }
  async append(room: string, client: string, data: Uint8Array) {
    await ensure();
    const r = await neonQuery("INSERT INTO keplar_collab_log (room, client, data) VALUES ($1, $2, $3) RETURNING seq", [room, client.slice(0, 64), toB64(data)]);
    return Number(r[0]?.seq ?? 0);
  }
  async since(room: string, after: number, limit = 500) {
    await ensure();
    return (await neonQuery("SELECT seq, client, data FROM keplar_collab_log WHERE room = $1 AND seq > $2 ORDER BY seq LIMIT $3", [room, after, limit])).map(rowOf);
  }
  async all(room: string) {
    await ensure();
    return (await neonQuery("SELECT seq, client, data FROM keplar_collab_log WHERE room = $1 ORDER BY seq", [room])).map(rowOf);
  }
  async replaceUpTo(room: string, upTo: number, merged: Uint8Array) {
    await ensure();
    await neonQuery("INSERT INTO keplar_collab_log (room, client, data) VALUES ($1, 'compact', $2)", [room, toB64(merged)]);
    await neonQuery("DELETE FROM keplar_collab_log WHERE room = $1 AND seq <= $2", [room, upTo]);
  }
  async count(room: string) {
    await ensure();
    const r = await neonQuery("SELECT count(*)::int AS n FROM keplar_collab_log WHERE room = $1", [room]);
    return Number(r[0]?.n ?? 0);
  }
  async putAwareness(room: string, client: string, state: Record<string, unknown> | null) {
    await ensure();
    if (!state) { await neonQuery("DELETE FROM keplar_collab_aw WHERE room = $1 AND client = $2", [room, client]); return; }
    await neonQuery("INSERT INTO keplar_collab_aw (room, client, data, updated_at) VALUES ($1, $2, $3::jsonb, now()) ON CONFLICT (room, client) DO UPDATE SET data = EXCLUDED.data, updated_at = now()", [room, client.slice(0, 64), JSON.stringify(state)]);
  }
  async awareness(room: string) {
    await ensure();
    const rows = await neonQuery(`SELECT client, data, extract(epoch from updated_at) * 1000 AS at FROM keplar_collab_aw WHERE room = $1 AND updated_at > now() - interval '${Math.round(AWARENESS_TTL_MS / 1000)} seconds'`, [room]);
    return rows.map((r) => ({ client: String(r.client), state: (typeof r.data === "string" ? JSON.parse(r.data) : r.data) as Record<string, unknown>, at: Number(r.at) }));
  }
  async dropRoom(room: string) {
    await ensure();
    await neonQuery("DELETE FROM keplar_collab_log WHERE room = $1", [room]);
    await neonQuery("DELETE FROM keplar_collab_aw WHERE room = $1", [room]);
    await neonQuery("DELETE FROM keplar_collab_rooms WHERE room = $1", [room]);
  }
}

let override: RelayStore | null = null;
export const setRelayForTests = (r: RelayStore | null) => { override = r; };
export const relay = (): RelayStore => override ?? (neonConfigured() ? new PgRelay() : new MemoryRelay());
export const relayBackend = () => (override ? "test" : neonConfigured() ? "postgres" : "memory");

/** The merged state of a room as one update, and the highest seq it covers. */
export async function roomState(room: string, store = relay()): Promise<{ update: Uint8Array; seq: number; rows: number }> {
  const rows = await store.all(room);
  if (!rows.length) return { update: new Uint8Array([0, 0]), seq: 0, rows: 0 };
  return { update: rows.length === 1 ? rows[0].data : Y.mergeUpdates(rows.map((r) => r.data)), seq: rows[rows.length - 1].seq, rows: rows.length };
}

/** What a peer with state vector `sv` is missing (exact catch-up, independent of log order). */
export async function diffFor(room: string, sv: Uint8Array | null, store = relay()) {
  const { update, seq } = await roomState(room, store);
  return { update: sv && sv.length ? Y.diffUpdate(update, sv) : update, seq };
}

export async function maybeCompact(room: string, store = relay()) {
  if ((await store.count(room)) < COMPACT_AT) return false;
  const { update, seq } = await roomState(room, store);
  await store.replaceUpTo(room, seq, update);
  return true;
}
