import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

/**
 * Restore rehearsal: the real scripts/backup-db.mjs exports from one real Postgres engine (PGlite) and restores into another, both
 * behind the Neon HTTP SQL protocol, using the app's own DDL. Proves the round trip on Postgres; it does NOT prove the production
 * Neon database or its credentials (docs/runbooks/backup-restore.md).
 */
const SCHEMA = [
  "CREATE TABLE keplar_rows (collection text NOT NULL, workspace_id text NOT NULL, id text NOT NULL, data jsonb NOT NULL, PRIMARY KEY (collection, workspace_id, id))",
  "CREATE TABLE keplar_users (id text PRIMARY KEY, email text NOT NULL, name text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), last_login timestamptz, providers jsonb NOT NULL DEFAULT '[]'::jsonb, sessions_valid_after timestamptz, onboarding_required boolean NOT NULL DEFAULT false, onboarding_step integer NOT NULL DEFAULT 0)",
  "CREATE UNIQUE INDEX keplar_users_email ON keplar_users (email)",
  "CREATE TABLE keplar_sessions (id text PRIMARY KEY, user_id text NOT NULL, created_at timestamptz NOT NULL, last_seen timestamptz NOT NULL, expires_at timestamptz NOT NULL, user_agent text NOT NULL DEFAULT '', ip_hash text NOT NULL DEFAULT '', provider text NOT NULL DEFAULT '', remember boolean NOT NULL DEFAULT true, revoked_at timestamptz)",
  "CREATE TABLE keplar_daily_use (key text NOT NULL, day date NOT NULL, used integer NOT NULL DEFAULT 0, PRIMARY KEY (key, day))",
  "CREATE TABLE keplar_mfa (user_id text PRIMARY KEY, secret_enc text NOT NULL, enabled_at timestamptz, last_step bigint NOT NULL DEFAULT 0, recovery jsonb NOT NULL DEFAULT '[]'::jsonb, created_at timestamptz NOT NULL DEFAULT now())",
  "CREATE TABLE keplar_images (id text PRIMARY KEY, workspace_id text NOT NULL, content_type text NOT NULL, bytes integer NOT NULL, is_public boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), data bytea NOT NULL)",
  "CREATE TABLE keplar_collab_log (seq bigserial PRIMARY KEY, room text NOT NULL, client text NOT NULL, data text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())",
];
const TABLES = ["keplar_collab_log", "keplar_daily_use", "keplar_images", "keplar_mfa", "keplar_rows", "keplar_sessions", "keplar_users"];

async function seed(db: PGlite) {
  for (let i = 0; i < 2600; i++) {
    await db.query("INSERT INTO keplar_rows VALUES ($1, $2, $3, $4)", [
      i % 3 ? "chat_threads" : "workspaces",
      `ws${i % 11}`,
      `r${i}`,
      JSON.stringify({ n: i, title: `Thread ${i} — café ☕ "quoted" \\ back`, nested: { ok: i % 2 === 0, list: [1, null, "x"] }, empty: null, big: 9007199254740991 }),
    ]);
  }
  await db.query("INSERT INTO keplar_users (id, email, name, created_at, last_login, providers, onboarding_step) VALUES ('u1', 'a@b.co', 'Zoë O''Brien', '2026-01-02T03:04:05.678Z', NULL, '[\"google\"]', 3), ('u2', 'c@d.co', '', '2026-05-06T07:08:09Z', '2026-10-01T00:00:00Z', '[]', 0)");
  await db.query("INSERT INTO keplar_sessions VALUES ('s1', 'u1', now(), now(), now() + interval '30 days', 'Mozilla/5.0', 'h1', 'google', true, NULL), ('s2', 'u2', now(), now(), now(), '', '', '', false, now())");
  await db.query("INSERT INTO keplar_daily_use VALUES ('u1:chat', '2026-10-18', 41), ('u2:chat', '2026-10-19', 0)");
  await db.query("INSERT INTO keplar_mfa (user_id, secret_enc, enabled_at, last_step, recovery) VALUES ('u1', 'enc:abc', now(), 59321488, '[\"h1\",\"h2\"]')");
  await db.query("INSERT INTO keplar_images (id, workspace_id, content_type, bytes, data) VALUES ('img1', 'ws1', 'image/png', 6, $1)", [new Uint8Array([0, 255, 10, 13, 92, 34])]);
  await db.query("INSERT INTO keplar_collab_log (room, client, data) VALUES ('room1', 'c1', 'AAEC'), ('room1', 'c2', 'AwQF'), ('room2', 'c1', 'Bgc=')");
}

/** Every row of every table as canonical text, so the two databases can be compared exactly. */
async function dump(db: PGlite) {
  const out: Record<string, string[]> = {};
  for (const t of TABLES) out[t] = (await db.query<{ j: string }>(`SELECT row_to_json(x)::text AS j FROM "${t}" x ORDER BY 1`)).rows.map((r) => r.j).sort();
  return out;
}

const text = (v: unknown) => (v === null || v === undefined ? null : typeof v === "object" ? (v instanceof Date ? v.toISOString() : JSON.stringify(v)) : String(v));
/** One Neon-style HTTP endpoint; the neon-connection-string header picks the database, as on Neon. */
function emulator(dbs: Record<string, PGlite>): Promise<{ url: string; close: () => void }> {
  const server = http.createServer((req, res) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", async () => {
      res.setHeader("content-type", "application/json");
      const db = dbs[String(req.headers["neon-connection-string"])];
      if (!db) { res.statusCode = 404; res.end(JSON.stringify({ message: "unknown database" })); return; }
      try {
        const { query, params } = JSON.parse(b) as { query: string; params: unknown[] };
        const r = await db.query<Record<string, unknown>>(query, params);
        res.end(JSON.stringify({ rows: r.rows.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, text(v)]))) }));
      } catch (e) {
        res.statusCode = 400;
        res.end(JSON.stringify({ message: (e as Error).message, code: (e as { code?: string }).code }));
      }
    });
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r({ url: `http://127.0.0.1:${(server.address() as { port: number }).port}/sql`, close: () => server.close() })));
}
const run = (args: string[], env: Record<string, string>) =>
  new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const c = spawn("node", ["scripts/backup-db.mjs", ...args], { env: { PATH: process.env.PATH ?? "", ...env } as unknown as NodeJS.ProcessEnv });
    let stdout = "", stderr = "";
    c.stdout.on("data", (d) => (stdout += d));
    c.stderr.on("data", (d) => (stderr += d));
    c.on("close", (status) => resolve({ status, stdout, stderr }));
  });

test("restore rehearsal: encrypted export from one Postgres restores byte-for-byte into an empty one, sequences included", { timeout: 180_000 }, async () => {
  const source = new PGlite(), target = new PGlite();
  for (const db of [source, target]) for (const s of SCHEMA) await db.exec(s);
  await seed(source);
  const SRC = "postgres://owner:pw@ep-source.neon.tech/keplar", DST = "postgres://owner:pw@ep-scratch.neon.tech/keplar";
  const neon = await emulator({ [SRC]: source, [DST]: target });
  const dir = mkdtempSync(join(tmpdir(), "kp-restore-"));
  try {
    const env = { BACKUP_SQL_ENDPOINT: neon.url, BACKUP_PASSPHRASE: "rehearsal passphrase" };
    const exp = await run(["--out", dir], { ...env, BACKUP_DATABASE_URL: SRC });
    assert.equal(exp.status, 0, exp.stderr);
    assert.match(exp.stdout, /7 tables, 2611 rows, verified by reading it back \(encrypted\)/);
    const file = join(dir, readdirSync(dir).find((f) => f.endsWith(".enc"))!);

    assert.equal((await run(["--restore", file, "--confirm"], { ...env, BACKUP_RESTORE_URL: SRC, DATABASE_URL: SRC })).status, 1, "never restores over the app database");
    const rst = await run(["--restore", file, "--confirm"], { ...env, BACKUP_RESTORE_URL: DST, DATABASE_URL: SRC });
    assert.equal(rst.status, 0, rst.stderr);
    assert.match(rst.stdout, /restored 2611 rows/);
    assert.match(rst.stdout, /reset 1 sequence/);

    assert.deepEqual(await dump(target), await dump(source), "every row of every table is identical after the round trip");
    const img = await target.query<{ data: Uint8Array }>("SELECT data FROM keplar_images WHERE id = 'img1'");
    assert.deepEqual([...img.rows[0].data], [0, 255, 10, 13, 92, 34], "binary columns survive");
    const next = await target.query<{ seq: string }>("INSERT INTO keplar_collab_log (room, client, data) VALUES ('room3', 'c9', 'x') RETURNING seq::text");
    assert.equal(next.rows[0].seq, "4", "the app can insert after a restore: serial sequences continue past restored ids");

    const again = await run(["--restore", file, "--confirm"], { ...env, BACKUP_RESTORE_URL: DST });
    assert.equal(again.status, 1, "a non-empty target fails loudly instead of half-merging");
  } finally {
    neon.close();
    await source.close();
    await target.close();
  }
});
