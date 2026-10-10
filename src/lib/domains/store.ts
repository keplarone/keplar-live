/**
 * Custom domain rows. Postgres table `keplar_domains` (created on first use, like keplar_images) whenever DATABASE_URL is
 * set; a JSON file under the data dir for local development and tests without a database.
 * `hostname` is globally unique: that unique index is what guarantees one owner per domain, even under concurrent adds.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { ensureSchema, neonConfigured, neonQuery, parseData } from "@/lib/create/platform/neon";
import { DATA_DIR } from "@/lib/create/platform/store";

import type { Routing } from "./diagnose";

export type DomainStatus = "pending" | "verifying" | "active" | "error";

export type DomainVerification = {
  /** Vercel's view of the project domain. */
  vercel?: { verified: boolean; challenges: { type: string; domain: string; value: string; reason: string }[]; apexName: string };
  /** DNS Vercel says to set (rank 1 first). */
  config?: { misconfigured: boolean; configuredBy: string | null; ipv4: string[]; cname: string[]; conflicts?: { name: string; type: string; value: string }[] };
  /** What live DNS showed at the last check (Google + Cloudflare) and the problems found. */
  routing?: Routing;
  /** Why the last check did not reach active (plain language, no provider internals). */
  reason?: string;
};

export type DomainRow = {
  id: string;
  userId: string;
  workspaceId: string;
  /** The Create site (sb_sites id) this domain serves. */
  siteId: string;
  hostname: string;
  status: DomainStatus;
  ownershipToken: string;
  ownershipVerified: boolean;
  verification: DomainVerification;
  lastError: string | null;
  lastCheckedAt: string | null;
  nextCheckAt: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InsertResult = "ok" | "duplicate" | "limit";

export interface DomainStore {
  insertIfUnderLimit(row: DomainRow, limit: number): Promise<InsertResult>;
  get(id: string): Promise<DomainRow | null>;
  findByHostname(hostname: string): Promise<DomainRow | null>;
  listByWorkspace(workspaceId: string): Promise<DomainRow[]>;
  listBySite(workspaceId: string, siteId: string): Promise<DomainRow[]>;
  update(id: string, patch: Partial<DomainRow>): Promise<DomainRow | null>;
  remove(id: string): Promise<boolean>;
  /** Rows whose next check is due, oldest first. */
  listDue(nowIso: string, limit: number): Promise<DomainRow[]>;
}

/* ── Postgres ── */
const COLS = `id, user_id, workspace_id, project_id, hostname, status, ownership_token, ownership_verified, verification, last_error,
  to_char(last_checked_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS last_checked_at,
  to_char(next_check_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS next_check_at,
  to_char(verified_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS verified_at,
  to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
  to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at`;

const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
const fromSql = (r: Record<string, unknown>): DomainRow => ({
  id: String(r.id),
  userId: String(r.user_id),
  workspaceId: String(r.workspace_id),
  siteId: String(r.project_id),
  hostname: String(r.hostname),
  status: String(r.status) as DomainStatus,
  ownershipToken: String(r.ownership_token),
  ownershipVerified: r.ownership_verified === true || r.ownership_verified === "true" || r.ownership_verified === "t",
  verification: parseData<DomainVerification>(r.verification ?? "{}"),
  lastError: str(r.last_error),
  lastCheckedAt: str(r.last_checked_at),
  nextCheckAt: str(r.next_check_at),
  verifiedAt: str(r.verified_at),
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
});

let ready: Promise<void> | null = null;
/** Migration: idempotent, runs once per instance. */
export function ensureDomainsTable(): Promise<void> {
  ready ??= (async () => {
    await ensureSchema();
    await neonQuery(`CREATE TABLE IF NOT EXISTS keplar_domains (
      id text PRIMARY KEY,
      user_id text NOT NULL,
      workspace_id text NOT NULL,
      project_id text NOT NULL,
      hostname text NOT NULL,
      status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verifying', 'active', 'error')),
      ownership_token text NOT NULL,
      ownership_verified boolean NOT NULL DEFAULT false,
      verification jsonb NOT NULL DEFAULT '{}'::jsonb,
      last_error text,
      last_checked_at timestamptz,
      next_check_at timestamptz,
      verified_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT keplar_domains_hostname_lower CHECK (hostname = lower(hostname))
    )`);
    await neonQuery("CREATE UNIQUE INDEX IF NOT EXISTS keplar_domains_hostname ON keplar_domains (hostname)");
    await neonQuery("CREATE INDEX IF NOT EXISTS keplar_domains_ws ON keplar_domains (workspace_id)");
    await neonQuery("CREATE INDEX IF NOT EXISTS keplar_domains_user ON keplar_domains (user_id)");
    await neonQuery("CREATE INDEX IF NOT EXISTS keplar_domains_project ON keplar_domains (project_id)");
    await neonQuery("CREATE INDEX IF NOT EXISTS keplar_domains_due ON keplar_domains (next_check_at) WHERE status IN ('pending', 'verifying', 'active')");
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

const SQL_COLUMNS: Record<keyof DomainRow, [string, string]> = {
  id: ["id", "text"], userId: ["user_id", "text"], workspaceId: ["workspace_id", "text"], siteId: ["project_id", "text"], hostname: ["hostname", "text"],
  status: ["status", "text"], ownershipToken: ["ownership_token", "text"], ownershipVerified: ["ownership_verified", "boolean"], verification: ["verification", "jsonb"],
  lastError: ["last_error", "text"], lastCheckedAt: ["last_checked_at", "timestamptz"], nextCheckAt: ["next_check_at", "timestamptz"], verifiedAt: ["verified_at", "timestamptz"],
  createdAt: ["created_at", "timestamptz"], updatedAt: ["updated_at", "timestamptz"],
};
const sqlValue = (k: keyof DomainRow, v: unknown) => (k === "verification" ? JSON.stringify(v ?? {}) : v === undefined ? null : v);

const sqlStore: DomainStore = {
  async insertIfUnderLimit(row, limit) {
    await ensureDomainsTable();
    const keys = Object.keys(SQL_COLUMNS) as (keyof DomainRow)[];
    const cols = keys.map((k) => SQL_COLUMNS[k][0]).join(", ");
    const vals = keys.map((k, i) => `$${i + 1}::${SQL_COLUMNS[k][1]}`).join(", ");
    const params = keys.map((k) => sqlValue(k, row[k]));
    params.push(row.workspaceId, limit);
    const r = await neonQuery(
      `INSERT INTO keplar_domains (${cols}) SELECT ${vals} WHERE (SELECT count(*) FROM keplar_domains WHERE workspace_id = $${keys.length + 1}) < $${keys.length + 2}::int ON CONFLICT (hostname) DO NOTHING RETURNING id`,
      params,
    );
    if (r.length) {
      // Two inserts racing past the count check can both land. Settle it deterministically: only the first `limit` rows
      // (by created_at, id) stay; a row outside that window removes itself.
      const keep = await neonQuery("SELECT id FROM keplar_domains WHERE workspace_id = $1 ORDER BY created_at, id LIMIT $2::int", [row.workspaceId, limit]);
      if (!keep.some((k) => k.id === row.id)) {
        await neonQuery("DELETE FROM keplar_domains WHERE id = $1", [row.id]);
        return "limit";
      }
      return "ok";
    }
    return (await this.findByHostname(row.hostname)) ? "duplicate" : "limit";
  },
  async get(id) {
    await ensureDomainsTable();
    const r = await neonQuery(`SELECT ${COLS} FROM keplar_domains WHERE id = $1`, [id]);
    return r[0] ? fromSql(r[0]) : null;
  },
  async findByHostname(hostname) {
    await ensureDomainsTable();
    const r = await neonQuery(`SELECT ${COLS} FROM keplar_domains WHERE hostname = $1`, [hostname.toLowerCase()]);
    return r[0] ? fromSql(r[0]) : null;
  },
  async listByWorkspace(workspaceId) {
    await ensureDomainsTable();
    return (await neonQuery(`SELECT ${COLS} FROM keplar_domains WHERE workspace_id = $1 ORDER BY created_at, id`, [workspaceId])).map(fromSql);
  },
  async listBySite(workspaceId, siteId) {
    await ensureDomainsTable();
    return (await neonQuery(`SELECT ${COLS} FROM keplar_domains WHERE workspace_id = $1 AND project_id = $2 ORDER BY created_at, id`, [workspaceId, siteId])).map(fromSql);
  },
  async update(id, patch) {
    await ensureDomainsTable();
    const keys = (Object.keys(patch) as (keyof DomainRow)[]).filter((k) => k !== "id" && k in SQL_COLUMNS && patch[k] !== undefined);
    const sets = keys.map((k, i) => `${SQL_COLUMNS[k][0]} = $${i + 2}::${SQL_COLUMNS[k][1]}`);
    sets.push("updated_at = now()");
    const r = await neonQuery(`UPDATE keplar_domains SET ${sets.join(", ")} WHERE id = $1 RETURNING ${COLS}`, [id, ...keys.map((k) => sqlValue(k, patch[k]))]);
    return r[0] ? fromSql(r[0]) : null;
  },
  async remove(id) {
    await ensureDomainsTable();
    return (await neonQuery("DELETE FROM keplar_domains WHERE id = $1 RETURNING id", [id])).length > 0;
  },
  async listDue(nowIso, limit) {
    await ensureDomainsTable();
    return (await neonQuery(`SELECT ${COLS} FROM keplar_domains WHERE status IN ('pending', 'verifying', 'active') AND next_check_at IS NOT NULL AND next_check_at <= $1::timestamptz ORDER BY next_check_at LIMIT $2::int`, [nowIso, limit])).map(fromSql);
  },
};

/* ── local JSON file (development, tests) ── */
const file = () => path.join(DATA_DIR, "keplar-domains.json");
let chain: Promise<unknown> = Promise.resolve();
async function withFile<T>(fn: (rows: DomainRow[]) => T | Promise<T>, write: boolean): Promise<T> {
  const run = chain.then(async () => {
    let rows: DomainRow[] = [];
    try {
      rows = JSON.parse(await fs.readFile(file(), "utf8")) as DomainRow[];
    } catch {
      rows = [];
    }
    const out = await fn(rows);
    if (write) {
      await fs.mkdir(path.dirname(file()), { recursive: true });
      await fs.writeFile(file(), JSON.stringify(rows));
    }
    return out;
  });
  chain = run.catch(() => undefined);
  return run;
}
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const byCreated = (a: DomainRow, b: DomainRow) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

const fileStore: DomainStore = {
  insertIfUnderLimit: (row, limit) =>
    withFile((rows) => {
      if (rows.some((r) => r.hostname === row.hostname)) return "duplicate" as const;
      if (rows.filter((r) => r.workspaceId === row.workspaceId).length >= limit) return "limit" as const;
      rows.push(clone(row));
      return "ok" as const;
    }, true),
  get: (id) => withFile((rows) => clone(rows.find((r) => r.id === id) ?? null), false),
  findByHostname: (h) => withFile((rows) => clone(rows.find((r) => r.hostname === h.toLowerCase()) ?? null), false),
  listByWorkspace: (ws) => withFile((rows) => clone(rows.filter((r) => r.workspaceId === ws).sort(byCreated)), false),
  listBySite: (ws, site) => withFile((rows) => clone(rows.filter((r) => r.workspaceId === ws && r.siteId === site).sort(byCreated)), false),
  update: (id, patch) =>
    withFile((rows) => {
      const r = rows.find((x) => x.id === id);
      if (!r) return null;
      Object.assign(r, clone(patch), { id: r.id, updatedAt: new Date().toISOString() });
      return clone(r);
    }, true),
  remove: (id) =>
    withFile((rows) => {
      const i = rows.findIndex((r) => r.id === id);
      if (i < 0) return false;
      rows.splice(i, 1);
      return true;
    }, true),
  listDue: (nowIso, limit) => withFile((rows) => clone(rows.filter((r) => r.status !== "error" && r.nextCheckAt && r.nextCheckAt <= nowIso).sort((a, b) => (a.nextCheckAt ?? "").localeCompare(b.nextCheckAt ?? "")).slice(0, limit)), false),
};

export const domainStore = (): DomainStore => (neonConfigured() ? sqlStore : fileStore);
