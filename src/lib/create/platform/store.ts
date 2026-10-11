/**
 * Repository layer. Every record is tenant-scoped by `workspaceId`.
 *
 * - Postgres (Neon) when DATABASE_URL is set: one `keplar_rows` table, JSONB
 *   documents keyed by (collection, workspace_id, id), reached over Neon's
 *   HTTP SQL endpoint (no driver dependency). See ./neon.ts and docs/accounts-billing.md.
 * - Otherwise a JSON file per collection under .data/. That is durable on a
 *   normal server but NOT on Vercel (the filesystem is per-instance and
 *   ephemeral), so features that need durable data check `storeDurable()`
 *   and show "not set up yet" instead of pretending.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { ensureSchema, neonConfigured, neonQuery, parseData } from "./neon";

export type Row = { id: string; workspaceId: string };

export interface Collection<T extends Row> {
  list(workspaceId: string, filter?: (row: T) => boolean): Promise<T[]>;
  get(workspaceId: string, id: string): Promise<T | null>;
  insert(row: T): Promise<T>;
  update(workspaceId: string, id: string, patch: Partial<T>): Promise<T | null>;
  remove(workspaceId: string, id: string): Promise<boolean>;
  /** Cross-tenant lookup for system paths only (host routing, webhooks). */
  findSystem(pred: (row: T) => boolean): Promise<T | null>;
  /**
   * Cross-tenant lookup by one field (dotted path, e.g. "ownerEmail" or "billing.subscriptionId").
   * Postgres answers it from an index instead of scanning the collection. `ci` compares case-insensitively.
   */
  findSystemBy(field: string, value: string, opts?: { ci?: boolean }): Promise<T | null>;
  /**
   * Atomically add to numeric fields of one row, creating it from `init` (which must include the
   * numeric fields at 0) when missing. Concurrent callers never lose an increment.
   * Fields are code constants (validated); returns the row after the change.
   */
  increment(workspaceId: string, id: string, deltas: Record<string, number>, init: T): Promise<T>;
  /** Insert only when (workspaceId, id) is free. Returns the stored row and whether this call created it. */
  insertIfAbsent(row: T): Promise<{ row: T; inserted: boolean }>;
  /**
   * Sum a numeric field over a tenant's rows whose ISO-timestamp field `range.field` is in [gte, lt).
   * Postgres sums in SQL instead of shipping every row to the server.
   */
  sum(workspaceId: string, field: string, range?: { field: string; gte?: string; lt?: string }): Promise<number>;
  /** Cross-tenant scan for system jobs only (the agent scheduler). Postgres: bypass-RLS read-only role. */
  listSystem(pred?: (row: T) => boolean): Promise<T[]>;
  /**
   * Cross-tenant, time-bounded scan for admin reporting. Rows whose ISO field `field` is >= gte (and < lt),
   * newest first, at most `limit` (default 20,000). Postgres filters and limits in SQL.
   */
  listSystemRange(range: { field: string; gte: string; lt?: string }, limit?: number): Promise<T[]>;
  /**
   * Retention: delete (cross-tenant, system jobs only) up to `limit` rows whose ISO field `field` is < `lt`.
   * Rows without the field are never touched. Returns how many rows were deleted.
   */
  purgeSystemBefore(field: string, lt: string, limit?: number): Promise<number>;
}

/**
 * KEPLAR_DATA_DIR lets tests and scripts use a throwaway store. On Vercel the
 * deployment filesystem is read-only except /tmp, so the file store falls back
 * to an ephemeral per-instance /tmp directory there.
 */
export const DATA_DIR =
  process.env.KEPLAR_DATA_DIR || (process.env.VERCEL ? "/tmp/keplar-data" : path.join(process.cwd(), ".data"));

// Serialise writes per file so concurrent requests don't clobber each other.
const locks = new Map<string, Promise<unknown>>();
function withLock<R>(key: string, fn: () => Promise<R>): Promise<R> {
  const prev = locks.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(key, next.catch(() => undefined));
  return next;
}

class FileCollection<T extends Row> implements Collection<T> {
  private file: string;
  constructor(name: string) {
    this.file = path.join(DATA_DIR, "keplar", `${name}.json`);
  }
  private async read(): Promise<T[]> {
    try {
      return JSON.parse(await fs.readFile(this.file, "utf8")) as T[];
    } catch {
      return [];
    }
  }
  private async write(rows: T[]) {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(rows, null, 2));
    // Windows can briefly lock the destination while another reader or antivirus holds it.
    // Retry the atomic replacement; never delete the last good copy to make room.
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          await fs.rename(tmp, this.file);
          break;
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (attempt >= 5 || !["EPERM", "EACCES", "EBUSY"].includes(code ?? "")) throw error;
          await delay(20 * 2 ** attempt);
        }
      }
    } finally {
      await fs.unlink(tmp).catch(() => {});
    }
  }
  async list(workspaceId: string, filter?: (row: T) => boolean) {
    const rows = (await this.read()).filter((r) => r.workspaceId === workspaceId);
    return filter ? rows.filter(filter) : rows;
  }
  async get(workspaceId: string, id: string) {
    return (await this.read()).find((r) => r.workspaceId === workspaceId && r.id === id) ?? null;
  }
  insert(row: T) {
    return withLock(this.file, async () => {
      const rows = await this.read();
      rows.push(row);
      await this.write(rows);
      return row;
    });
  }
  update(workspaceId: string, id: string, patch: Partial<T>) {
    return withLock(this.file, async () => {
      const rows = await this.read();
      const i = rows.findIndex((r) => r.workspaceId === workspaceId && r.id === id);
      if (i < 0) return null;
      rows[i] = { ...rows[i], ...patch, id: rows[i].id, workspaceId: rows[i].workspaceId };
      await this.write(rows);
      return rows[i];
    });
  }
  remove(workspaceId: string, id: string) {
    return withLock(this.file, async () => {
      const rows = await this.read();
      const next = rows.filter((r) => !(r.workspaceId === workspaceId && r.id === id));
      if (next.length === rows.length) return false;
      await this.write(next);
      return true;
    });
  }
  async findSystem(pred: (row: T) => boolean) {
    return (await this.read()).find(pred) ?? null;
  }
  async listSystem(pred?: (row: T) => boolean) {
    const rows = await this.read();
    return pred ? rows.filter(pred) : rows;
  }
  async listSystemRange(range: { field: string; gte: string; lt?: string }, limit = 20_000) {
    checkField(range.field);
    const at = (r: T) => String((r as Record<string, unknown>)[range.field] ?? "");
    return (await this.read())
      .filter((r) => at(r) >= range.gte && (range.lt === undefined || at(r) < range.lt))
      .sort((a, b) => (at(a) < at(b) ? 1 : -1))
      .slice(0, limit);
  }
  purgeSystemBefore(field: string, lt: string, limit = 5000) {
    checkField(field);
    return withLock(this.file, async () => {
      const rows = await this.read();
      const at = (r: T) => (r as Record<string, unknown>)[field];
      let n = 0;
      const next = rows.filter((r) => {
        const v = at(r);
        if (n < limit && typeof v === "string" && v < lt) {
          n++;
          return false;
        }
        return true;
      });
      if (n) await this.write(next);
      return n;
    });
  }
  insertIfAbsent(row: T) {
    return withLock(this.file, async () => {
      const rows = await this.read();
      const cur = rows.find((r) => r.workspaceId === row.workspaceId && r.id === row.id);
      if (cur) return { row: cur, inserted: false };
      rows.push(row);
      await this.write(rows);
      return { row, inserted: true };
    });
  }
  async sum(workspaceId: string, field: string, range?: { field: string; gte?: string; lt?: string }) {
    checkField(field);
    if (range) checkField(range.field);
    const rows = await this.list(workspaceId, (r) => {
      if (!range) return true;
      const at = String((r as Record<string, unknown>)[range.field] ?? "");
      return (range.gte === undefined || at >= range.gte) && (range.lt === undefined || at < range.lt);
    });
    return rows.reduce((t, r) => t + (Number((r as Record<string, unknown>)[field]) || 0), 0);
  }
  async findSystemBy(field: string, value: string, opts: { ci?: boolean } = {}) {
    checkField(field);
    const norm = (v: unknown) => (typeof v === "string" ? (opts.ci ? v.toLowerCase() : v) : null);
    const want = norm(value);
    return (await this.read()).find((r) => norm(field.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | null | undefined)?.[k], r)) === want) ?? null;
  }
  increment(workspaceId: string, id: string, deltas: Record<string, number>, init: T) {
    return withLock(this.file, async () => {
      for (const k of Object.keys(deltas)) checkField(k);
      const rows = await this.read();
      let i = rows.findIndex((r) => r.workspaceId === workspaceId && r.id === id);
      if (i < 0) {
        rows.push({ ...init, id, workspaceId });
        i = rows.length - 1;
      }
      const cur = rows[i] as Record<string, unknown>;
      for (const [k, d] of Object.entries(deltas)) cur[k] = (Number(cur[k]) || 0) + d;
      await this.write(rows);
      return rows[i];
    });
  }
}

/** Field paths are code constants; validate anyway because Postgres inlines them into SQL. */
function checkField(field: string) {
  if (!/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)*$/.test(field)) throw new Error("Invalid field path.");
}

class NeonCollection<T extends Row> implements Collection<T> {
  constructor(private name: string) {}
  private async rows(where: string, params: unknown[]): Promise<T[]> {
    await ensureSchema();
    const r = await neonQuery(`SELECT data FROM keplar_rows WHERE collection = $1${where}`, [this.name, ...params]);
    return r.map((x) => parseData<T>(x.data));
  }
  async list(workspaceId: string, filter?: (row: T) => boolean) {
    const rows = await this.rows(" AND workspace_id = $2", [workspaceId]);
    return filter ? rows.filter(filter) : rows;
  }
  async get(workspaceId: string, id: string) {
    return (await this.rows(" AND workspace_id = $2 AND id = $3", [workspaceId, id]))[0] ?? null;
  }
  async insert(row: T) {
    await ensureSchema();
    await neonQuery("INSERT INTO keplar_rows (collection, workspace_id, id, data) VALUES ($1, $2, $3, $4::jsonb) ON CONFLICT (collection, workspace_id, id) DO UPDATE SET data = EXCLUDED.data", [this.name, row.workspaceId, row.id, JSON.stringify(row)]);
    return row;
  }
  /** One atomic statement (shallow merge, like the file store), so concurrent updates to different fields don't overwrite each other. */
  async update(workspaceId: string, id: string, patch: Partial<T>) {
    await ensureSchema();
    const { id: _i, workspaceId: _w, ...rest } = patch as Record<string, unknown>;
    void _i;
    void _w;
    const cleared = Object.keys(rest).filter((k) => rest[k] === undefined);
    const r = await neonQuery(
      "UPDATE keplar_rows SET data = (data || $4::jsonb) - $5::text[] WHERE collection = $1 AND workspace_id = $2 AND id = $3 RETURNING data",
      [this.name, workspaceId, id, JSON.stringify(rest), `{${cleared.map((k) => JSON.stringify(k)).join(",")}}`],
    );
    return r[0] ? parseData<T>(r[0].data) : null;
  }
  async remove(workspaceId: string, id: string) {
    await ensureSchema();
    const r = await neonQuery("DELETE FROM keplar_rows WHERE collection = $1 AND workspace_id = $2 AND id = $3 RETURNING id", [this.name, workspaceId, id]);
    return r.length > 0;
  }
  async findSystem(pred: (row: T) => boolean) {
    return (await this.rows("", [])).find(pred) ?? null;
  }
  async listSystem(pred?: (row: T) => boolean) {
    const rows = await this.rows("", []);
    return pred ? rows.filter(pred) : rows;
  }
  async listSystemRange(range: { field: string; gte: string; lt?: string }, limit = 20_000) {
    checkField(range.field);
    const at = `(data #>> '{${range.field.split(".").join(",")}}') COLLATE "C"`;
    const params: unknown[] = [range.gte];
    let where = ` AND ${at} >= $2`;
    if (range.lt !== undefined) where += ` AND ${at} < $${params.push(range.lt) + 1}`;
    const lim = Math.max(1, Math.min(100_000, Math.floor(limit)));
    return this.rows(`${where} ORDER BY ${at} DESC LIMIT ${lim}`, params);
  }
  async purgeSystemBefore(field: string, lt: string, limit = 5000) {
    await ensureSchema();
    checkField(field);
    const at = `(data #>> '{${field.split(".").join(",")}}') COLLATE "C"`;
    const lim = Math.max(1, Math.min(50_000, Math.floor(limit)));
    const r = await neonQuery(
      `DELETE FROM keplar_rows WHERE ctid IN (SELECT ctid FROM keplar_rows WHERE collection = $1 AND ${at} IS NOT NULL AND ${at} < $2 LIMIT ${lim}) RETURNING id`,
      [this.name, lt],
    );
    return r.length;
  }
  async increment(workspaceId: string, id: string, deltas: Record<string, number>, init: T) {
    await ensureSchema();
    const keys = Object.keys(deltas);
    keys.forEach(checkField);
    if (keys.some((k) => k.includes("."))) throw new Error("increment fields must be top-level.");
    // $1 collection, $2 workspace, $3 id, $4 initial document (numeric fields already at their delta), then one delta per field.
    const sets = keys.map((k, i) => `'${k}', COALESCE((keplar_rows.data ->> '${k}')::numeric, 0) + $${i + 5}::numeric`).join(", ");
    const r = await neonQuery(
      `INSERT INTO keplar_rows (collection, workspace_id, id, data) VALUES ($1, $2, $3, $4::jsonb) ON CONFLICT (collection, workspace_id, id) DO UPDATE SET data = keplar_rows.data || jsonb_build_object(${sets}) RETURNING data`,
      [this.name, workspaceId, id, JSON.stringify({ ...init, id, workspaceId, ...Object.fromEntries(keys.map((k) => [k, deltas[k]])) }), ...keys.map((k) => String(deltas[k]))],
    );
    return parseData<T>(r[0].data);
  }
  async insertIfAbsent(row: T) {
    await ensureSchema();
    const r = await neonQuery("INSERT INTO keplar_rows (collection, workspace_id, id, data) VALUES ($1, $2, $3, $4::jsonb) ON CONFLICT (collection, workspace_id, id) DO NOTHING RETURNING id", [this.name, row.workspaceId, row.id, JSON.stringify(row)]);
    if (r.length > 0) return { row, inserted: true };
    return { row: (await this.get(row.workspaceId, row.id)) ?? row, inserted: false };
  }
  async sum(workspaceId: string, field: string, range?: { field: string; gte?: string; lt?: string }) {
    await ensureSchema();
    checkField(field);
    const params: unknown[] = [this.name, workspaceId];
    let where = "";
    if (range) {
      checkField(range.field);
      const at = `(data #>> '{${range.field.split(".").join(",")}}') COLLATE "C"`; // C collation = plain ISO-string order, same as the file store
      if (range.gte !== undefined) where += ` AND ${at} >= $${params.push(range.gte)}`;
      if (range.lt !== undefined) where += ` AND ${at} < $${params.push(range.lt)}`;
    }
    const r = await neonQuery(`SELECT COALESCE(SUM((data #>> '{${field.split(".").join(",")}}')::numeric), 0)::text AS total FROM keplar_rows WHERE collection = $1 AND workspace_id = $2${where}`, params);
    return Number(r[0]?.total ?? 0) || 0;
  }
  async findSystemBy(field: string, value: string, opts: { ci?: boolean } = {}) {
    checkField(field);
    const expr = field === "id" ? "id" : `data #>> '{${field.split(".").join(",")}}'`;
    const lhs = opts.ci ? `lower(${expr})` : expr;
    const rhs = opts.ci ? "lower($2)" : "$2";
    return (await this.rows(` AND ${lhs} = ${rhs} LIMIT 1`, [value]))[0] ?? null;
  }
}

/** True when records survive between requests: Postgres, or a real (non-Vercel) server's disk. */
export function storeDurable(): boolean {
  return neonConfigured() || !process.env.VERCEL;
}

const cache = new Map<string, Collection<Row>>();

export function collection<T extends Row>(name: string): Collection<T> {
  if (!cache.has(name)) {
    const backend = neonConfigured() ? new NeonCollection<T>(name) : new FileCollection<T>(name);
    cache.set(name, backend as unknown as Collection<Row>);
  }
  return cache.get(name) as unknown as Collection<T>;
}
