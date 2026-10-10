/**
 * The data plane for generated apps: one set of Postgres tables shared by every app, every row keyed by (app_id, env).
 * app_id is always the server-resolved site id (never a client value) and env is "draft" (the builder preview) or "live" (the
 * published app), so a preview never touches live data and one app can never address another app's rows.
 *
 * Production: Neon over HTTP (src/lib/create/platform/neon.ts), the same database as the rest of Keplar.
 * Local development without DATABASE_URL: an in-process Postgres (PGlite, a dev dependency) persisted under the data dir,
 * so the SQL is identical everywhere. Every value comes back as text (Neon raw-text mode), callers parse.
 */
import path from "node:path";
import { neonConfigured, neonQuery } from "@/lib/create/platform/neon";
import { DATA_DIR } from "@/lib/create/platform/store";

type Rows = Record<string, string | null>[];
type Local = { query: (q: string, p?: unknown[]) => Promise<{ rows: unknown[] }>; exec: (q: string) => Promise<unknown> };
let local: Promise<Local> | null = null;

async function localDb(): Promise<Local> {
  local ??= (async () => {
    const mod = "@electric-sql/pglite";
    const { PGlite } = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ mod)) as { PGlite: new (dir?: string) => Local & { waitReady: Promise<void> } };
    const db = new PGlite(process.env.KEPLAR_APPDB_MEMORY === "1" ? undefined : path.join(DATA_DIR, "appdb"));
    await db.waitReady;
    return db;
  })();
  return local;
}

const text = (v: unknown): string | null => (v === null || v === undefined ? null : typeof v === "object" ? (v instanceof Date ? v.toISOString() : v instanceof Uint8Array ? Buffer.from(v).toString("base64") : JSON.stringify(v)) : String(v));

export async function appSql(query: string, params: unknown[] = []): Promise<Rows> {
  if (neonConfigured()) return (await neonQuery(query, params)) as Rows;
  const db = await localDb();
  const r = await db.query(query, params.map((p) => (p === undefined ? null : p)));
  return (r.rows as Record<string, unknown>[]).map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, text(v)])));
}

let ready: Promise<void> | null = null;
export function ensureAppSchema(): Promise<void> {
  ready ??= (async () => {
    const run = async () => {
      await appSql("CREATE TABLE IF NOT EXISTS app_records (app_id text NOT NULL, env text NOT NULL, col text NOT NULL, id text NOT NULL, owner_id text, data jsonb NOT NULL, uniq text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (app_id, env, col, id))");
      await appSql("CREATE INDEX IF NOT EXISTS app_records_list ON app_records (app_id, env, col, created_at DESC)");
      await appSql("CREATE INDEX IF NOT EXISTS app_records_owner ON app_records (app_id, env, col, owner_id)");
      await appSql("CREATE INDEX IF NOT EXISTS app_records_data ON app_records USING gin (data jsonb_path_ops)");
      await appSql("CREATE UNIQUE INDEX IF NOT EXISTS app_records_uniq ON app_records (app_id, env, col, uniq) WHERE uniq IS NOT NULL");
      await appSql("CREATE TABLE IF NOT EXISTS app_users (app_id text NOT NULL, env text NOT NULL, id text NOT NULL, email text NOT NULL, pass_hash text, name text NOT NULL DEFAULT '', role text NOT NULL DEFAULT 'member', profile jsonb NOT NULL DEFAULT '{}'::jsonb, verified boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (app_id, env, id))");
      await appSql("CREATE UNIQUE INDEX IF NOT EXISTS app_users_email ON app_users (app_id, env, lower(email))");
      await appSql("CREATE TABLE IF NOT EXISTS app_sessions (token_hash text PRIMARY KEY, app_id text NOT NULL, env text NOT NULL, user_id text NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now())");
      await appSql("CREATE INDEX IF NOT EXISTS app_sessions_user ON app_sessions (app_id, env, user_id)");
      await appSql("CREATE TABLE IF NOT EXISTS app_magic (token_hash text PRIMARY KEY, app_id text NOT NULL, env text NOT NULL, email text NOT NULL, expires_at timestamptz NOT NULL, used boolean NOT NULL DEFAULT false)");
      await appSql("CREATE TABLE IF NOT EXISTS app_files (app_id text NOT NULL, env text NOT NULL, id text NOT NULL, owner_id text, name text NOT NULL, mime text NOT NULL, size integer NOT NULL, data bytea NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (app_id, env, id))");
      await appSql("CREATE TABLE IF NOT EXISTS app_usage (app_id text NOT NULL, env text NOT NULL, day date NOT NULL, kind text NOT NULL, n integer NOT NULL DEFAULT 0, usd double precision NOT NULL DEFAULT 0, PRIMARY KEY (app_id, env, day, kind))");
    };
    await run().catch(async () => {
      await new Promise((r) => setTimeout(r, 300));
      await run();
    });
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

/** Removes everything an app stored (both environments, or one). Used when a site is purged and by "Reset preview data". */
export async function deleteAppData(appId: string, env?: "draft" | "live" | "qa") {
  await ensureAppSchema();
  const where = env ? "app_id = $1 AND env = $2" : "app_id = $1";
  const p = env ? [appId, env] : [appId];
  for (const t of ["app_records", "app_users", "app_sessions", "app_magic", "app_files", "app_usage"]) await appSql(`DELETE FROM ${t} WHERE ${where}`, p);
}
