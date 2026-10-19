/**
 * Versioned setup for the side SQL tables (users, sessions, credentials, 2FA, passkeys).
 *
 * One ordered list of statements that already existed as CREATE TABLE / CREATE INDEX IF NOT EXISTS.
 * Each statement runs once, then a row in keplar_sql_setup records the version. Running again is a no-op.
 * The list cannot add a column, drop, or rename: those statements are refused before anything is sent.
 * The ADD COLUMN statements that already ship in persist.ts stay there; they are not part of this list.
 */
import { neonQuery } from "@/lib/create/platform/neon";
import { logEvent } from "@/lib/ops/log";

export const SQL_SETUP_ID = "side";

export type SqlStep = { version: number; sql: string };
export type SqlQuery = (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

/** Bookkeeping only. A new table, created with IF NOT EXISTS, never an existing one. */
export const SQL_SETUP_TABLE =
  "CREATE TABLE IF NOT EXISTS keplar_sql_setup (id text PRIMARY KEY, version integer NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())";

/**
 * The statements previously inlined in persist.ts, credentials.ts, mfa/store.ts, and passkeys/store.ts,
 * in the order those modules created the tables. Text is unchanged.
 */
export const SIDE_SQL: readonly SqlStep[] = [
  { version: 1, sql: "CREATE TABLE IF NOT EXISTS keplar_users (id text PRIMARY KEY, email text NOT NULL, name text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), last_login timestamptz, providers jsonb NOT NULL DEFAULT '[]'::jsonb, sessions_valid_after timestamptz)" },
  { version: 2, sql: "CREATE UNIQUE INDEX IF NOT EXISTS keplar_users_email ON keplar_users (email)" },
  { version: 3, sql: "CREATE TABLE IF NOT EXISTS keplar_sessions (id text PRIMARY KEY, user_id text NOT NULL, created_at timestamptz NOT NULL, last_seen timestamptz NOT NULL, expires_at timestamptz NOT NULL, user_agent text NOT NULL DEFAULT '', ip_hash text NOT NULL DEFAULT '', provider text NOT NULL DEFAULT '', remember boolean NOT NULL DEFAULT true, revoked_at timestamptz)" },
  { version: 4, sql: "CREATE INDEX IF NOT EXISTS keplar_sessions_user ON keplar_sessions (user_id, revoked_at)" },
  { version: 5, sql: "CREATE TABLE IF NOT EXISTS keplar_magic_used (jti text PRIMARY KEY, expires_at timestamptz NOT NULL)" },
  { version: 6, sql: "CREATE TABLE IF NOT EXISTS keplar_deleted_logins (email_key text PRIMARY KEY, deleted_at timestamptz NOT NULL DEFAULT now())" },
  { version: 7, sql: "CREATE TABLE IF NOT EXISTS keplar_credentials (email text PRIMARY KEY, password_hash text NOT NULL, name text NOT NULL DEFAULT '', verified_at timestamptz, terms_accepted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())" },
  { version: 8, sql: "CREATE TABLE IF NOT EXISTS keplar_mfa (user_id text PRIMARY KEY, secret_enc text NOT NULL, enabled_at timestamptz, last_step bigint NOT NULL DEFAULT 0, recovery jsonb NOT NULL DEFAULT '[]'::jsonb, created_at timestamptz NOT NULL DEFAULT now())" },
  { version: 9, sql: "CREATE TABLE IF NOT EXISTS keplar_passkeys (id text PRIMARY KEY, user_id text NOT NULL, public_key text NOT NULL, counter bigint NOT NULL DEFAULT 0, transports jsonb NOT NULL DEFAULT '[]'::jsonb, name text NOT NULL DEFAULT 'Passkey', device_type text NOT NULL DEFAULT 'singleDevice', backed_up boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), last_used_at timestamptz)" },
  { version: 10, sql: "CREATE INDEX IF NOT EXISTS keplar_passkeys_user ON keplar_passkeys (user_id)" },
  { version: 11, sql: "CREATE TABLE IF NOT EXISTS keplar_webauthn_challenges (id text PRIMARY KEY, challenge text NOT NULL, user_id text, purpose text NOT NULL, expires_at timestamptz NOT NULL)" },
];

const ALLOWED = /^CREATE (UNIQUE )?INDEX IF NOT EXISTS |^CREATE TABLE IF NOT EXISTS /i;

/** Throws before a query when a statement could change an existing table. */
export function assertSqlSetup(steps: readonly SqlStep[]): void {
  const seen = new Set<number>();
  for (const [i, step] of steps.entries()) {
    const sql = step.sql.trim();
    const version = step.version;
    if (version !== i + 1 || seen.has(version)) {
      logEvent("error", "sql.setup.refused", { reason: "version_order" });
      throw new Error("SQL setup refused a statement that is not a create-if-not-exists.");
    }
    seen.add(version);
    if (!ALLOWED.test(sql) || sql.includes(";") || /\b(ALTER|DROP|TRUNCATE|RENAME)\b/i.test(sql)) {
      logEvent("error", "sql.setup.refused", { reason: "not_create", version });
      throw new Error("SQL setup refused a statement that is not a create-if-not-exists.");
    }
  }
}

function versionOf(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isInteger(n) && n >= 0 && n <= 1_000_000 ? n : 0;
}

/**
 * Runs any statements newer than the recorded version. A failure leaves the version at the last one that finished,
 * so the next call continues there. `query` is injectable for tests; production uses Neon.
 */
export async function applySqlSetup(steps: readonly SqlStep[], opts: { id?: string; query?: SqlQuery } = {}): Promise<{ version: number; applied: number }> {
  assertSqlSetup(steps);
  assertSqlSetup([{ version: 1, sql: SQL_SETUP_TABLE }]);
  const id = opts.id ?? SQL_SETUP_ID;
  const query = opts.query ?? ((sql, params) => neonQuery(sql, params));
  await query(SQL_SETUP_TABLE);
  const rows = await query("SELECT version FROM keplar_sql_setup WHERE id = $1", [id]);
  let current = versionOf(rows[0]?.version);
  const start = current;
  for (const step of steps) {
    if (step.version <= current) continue;
    try {
      await query(step.sql);
      await query(
        "INSERT INTO keplar_sql_setup (id, version) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, applied_at = now()",
        [id, step.version],
      );
    } catch (error) {
      logEvent("error", "sql.setup.failed", { id, version: step.version, name: error instanceof Error ? error.name : "unknown" });
      throw error;
    }
    current = step.version;
  }
  const applied = current - start;
  logEvent("info", "sql.setup", { id, version: current, applied });
  return { version: current, applied };
}

let pending: Promise<{ version: number; applied: number }> | null = null;

/** Once per process. A database blip is retried once; a refused statement is not. A failure clears the latch. */
export function ensureSideSql(): Promise<{ version: number; applied: number }> {
  pending ??= (async () => {
    try {
      return await applySqlSetup(SIDE_SQL);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("SQL setup refused")) throw error;
      await new Promise((r) => setTimeout(r, 300));
      return await applySqlSetup(SIDE_SQL);
    }
  })().catch((error) => {
    pending = null;
    throw error;
  });
  return pending;
}
