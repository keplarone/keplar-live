/**
 * Storage for desktop sign-in requests. Vercel serves each request from a different instance, so the real store is a
 * table in Neon; with no database (local dev) a process-wide Map stands in. Both implement the same atomic operations,
 * which are what make codes single use: the check and the state change are ONE statement.
 * Times are epoch milliseconds, passed in by the caller so tests control the clock.
 */
import { neonConfigured, neonQuery } from "@/lib/create/platform/neon";
import { appOf, type DesktopApp, type Status } from "./core";

export type Row = {
  id: string;
  challenge: string;
  label: string;
  /** Which desktop app started it (Keplar One or Keplar Business): decides the link scheme and where the session is issued. */
  app: DesktopApp;
  createdAt: number;
  expiresAt: number;
  status: Status;
  userId: string | null;
  email: string | null;
  name: string | null;
  codeHash: string | null;
  codeExpiresAt: number | null;
  finishHash: string | null;
  finishExpiresAt: number | null;
  attempts: number;
};

export type Who = { userId: string; email: string; name: string | null };
/** A redeemed finish ticket: whose session to start, and for which app. */
export type Finished = Who & { app: DesktopApp };

export interface DesktopAuthStore {
  create(row: Row, now: number): Promise<void>;
  get(id: string): Promise<Row | null>;
  /** pending|approved -> approved with a fresh code (a retry replaces the previous, unused code). False if gone/expired/finished. */
  approve(id: string, who: Who, codeHash: string, codeExpiresAt: number, now: number): Promise<boolean>;
  /** Move from one of `from` to `to`. */
  transition(id: string, from: Status[], to: Status): Promise<boolean>;
  /** Count a wrong guess; returns the new total. */
  bump(id: string): Promise<number>;
  /** approved + this code + unexpired + this challenge -> used, with a finish ticket. Exactly one caller can win. */
  exchange(id: string, codeHash: string, challenge: string, finishHash: string, finishExpiresAt: number, now: number): Promise<boolean>;
  /** used + this ticket + unexpired -> finished. Exactly one caller can win. */
  finish(finishHash: string, now: number): Promise<Finished | null>;
}

/* ───────────── memory ───────────── */

const g = globalThis as unknown as { __keplarDesktopAuth?: Map<string, Row> };
const mem = () => (g.__keplarDesktopAuth ??= new Map());

export const memoryStore: DesktopAuthStore = {
  async create(row, now) {
    const m = mem();
    for (const [k, v] of m) if (v.expiresAt < now - 3_600_000) m.delete(k);
    if (m.size > 5000) m.clear();
    m.set(row.id, { ...row });
  },
  async get(id) {
    const r = mem().get(id);
    return r ? { ...r } : null;
  },
  async approve(id, who, codeHash, codeExpiresAt, now) {
    const r = mem().get(id);
    if (!r || (r.status !== "pending" && r.status !== "approved") || r.expiresAt <= now) return false;
    Object.assign(r, { status: "approved", userId: who.userId, email: who.email, name: who.name, codeHash, codeExpiresAt });
    return true;
  },
  async transition(id, from, to) {
    const r = mem().get(id);
    if (!r || !from.includes(r.status)) return false;
    r.status = to;
    return true;
  },
  async bump(id) {
    const r = mem().get(id);
    if (!r) return 0;
    r.attempts += 1;
    return r.attempts;
  },
  async exchange(id, codeHash, challenge, finishHash, finishExpiresAt, now) {
    const r = mem().get(id);
    if (!r || r.status !== "approved" || r.codeHash !== codeHash || r.challenge !== challenge || (r.codeExpiresAt ?? 0) <= now || r.expiresAt <= now) return false;
    Object.assign(r, { status: "used", codeHash: null, finishHash, finishExpiresAt });
    return true;
  },
  async finish(finishHash, now) {
    for (const r of mem().values()) {
      if (r.status === "used" && r.finishHash === finishHash && (r.finishExpiresAt ?? 0) > now && r.userId && r.email) {
        r.status = "finished";
        r.finishHash = null;
        return { userId: r.userId, email: r.email, name: r.name, app: r.app };
      }
    }
    return null;
  },
};

/* ───────────── Postgres (Neon) ───────────── */

let ready: Promise<void> | null = null;
const ensure = (): Promise<void> => {
  ready ??= (async () => {
    await neonQuery(
      "CREATE TABLE IF NOT EXISTS keplar_desktop_auth (id text PRIMARY KEY, challenge text NOT NULL, label text NOT NULL DEFAULT '', created_at bigint NOT NULL, expires_at bigint NOT NULL, status text NOT NULL, user_id text, email text, name text, code_hash text, code_expires_at bigint, finish_hash text, finish_expires_at bigint, attempts integer NOT NULL DEFAULT 0)",
    );
    await neonQuery("CREATE INDEX IF NOT EXISTS keplar_desktop_auth_finish ON keplar_desktop_auth (finish_hash) WHERE finish_hash IS NOT NULL");
    // Added for the Keplar Business desktop app; existing rows (and older deploys, which never write it) are Keplar One.
    await neonQuery("ALTER TABLE keplar_desktop_auth ADD COLUMN IF NOT EXISTS app text NOT NULL DEFAULT 'one'");
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
};
const q = async (sql: string, params: unknown[] = []) => {
  await ensure();
  return neonQuery(sql, params);
};
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const toRow = (r: Record<string, unknown>): Row => ({
  id: String(r.id),
  challenge: String(r.challenge),
  label: String(r.label ?? ""),
  app: appOf(r.app),
  createdAt: Number(r.created_at),
  expiresAt: Number(r.expires_at),
  status: String(r.status) as Status,
  userId: str(r.user_id),
  email: str(r.email),
  name: str(r.name),
  codeHash: str(r.code_hash),
  codeExpiresAt: num(r.code_expires_at),
  finishHash: str(r.finish_hash),
  finishExpiresAt: num(r.finish_expires_at),
  attempts: Number(r.attempts ?? 0),
});

export const sqlStore: DesktopAuthStore = {
  async create(row, now) {
    await q("DELETE FROM keplar_desktop_auth WHERE expires_at < $1", [String(now - 3_600_000)]).catch(() => undefined);
    await q(
      "INSERT INTO keplar_desktop_auth (id, challenge, label, app, created_at, expires_at, status) VALUES ($1,$2,$3,$4,$5,$6,'pending')",
      [row.id, row.challenge, row.label, row.app, String(row.createdAt), String(row.expiresAt)],
    );
  },
  async get(id) {
    const rows = await q("SELECT * FROM keplar_desktop_auth WHERE id = $1", [id]);
    return rows[0] ? toRow(rows[0]) : null;
  },
  async approve(id, who, codeHash, codeExpiresAt, now) {
    const rows = await q(
      "UPDATE keplar_desktop_auth SET status='approved', user_id=$2, email=$3, name=$4, code_hash=$5, code_expires_at=$6 WHERE id=$1 AND status IN ('pending','approved') AND expires_at > $7 RETURNING id",
      [id, who.userId, who.email, who.name, codeHash, String(codeExpiresAt), String(now)],
    );
    return rows.length === 1;
  },
  async transition(id, from, to) {
    const rows = await q("UPDATE keplar_desktop_auth SET status=$2 WHERE id=$1 AND status = ANY($3::text[]) RETURNING id", [id, to, `{${from.join(",")}}`]);
    return rows.length === 1;
  },
  async bump(id) {
    const rows = await q("UPDATE keplar_desktop_auth SET attempts = attempts + 1 WHERE id=$1 RETURNING attempts", [id]);
    return rows[0] ? Number(rows[0].attempts) : 0;
  },
  async exchange(id, codeHash, challenge, finishHash, finishExpiresAt, now) {
    const rows = await q(
      "UPDATE keplar_desktop_auth SET status='used', code_hash=NULL, finish_hash=$4, finish_expires_at=$5 WHERE id=$1 AND status='approved' AND code_hash=$2 AND challenge=$3 AND code_expires_at > $6 AND expires_at > $6 RETURNING id",
      [id, codeHash, challenge, finishHash, String(finishExpiresAt), String(now)],
    );
    return rows.length === 1;
  },
  async finish(finishHash, now) {
    const rows = await q(
      "UPDATE keplar_desktop_auth SET status='finished', finish_hash=NULL WHERE finish_hash=$1 AND status='used' AND finish_expires_at > $2 RETURNING user_id, email, name, app",
      [finishHash, String(now)],
    );
    const r = rows[0];
    return r && r.user_id && r.email ? { userId: String(r.user_id), email: String(r.email), name: str(r.name), app: appOf(r.app) } : null;
  },
};

export const defaultStore = (): DesktopAuthStore => (neonConfigured() ? sqlStore : memoryStore);
