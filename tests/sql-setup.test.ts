import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applySqlSetup, assertSqlSetup, SIDE_SQL, SQL_SETUP_ID, SQL_SETUP_TABLE, type SqlQuery } from "@/lib/accounts/sql-setup";
import { installFakeNeon } from "./helpers/fake-neon";

const read = (p: string) => readFileSync(p, "utf8");

test("side SQL is the existing create-if-not-exists list, in order, and refuses anything that would change a table", () => {
  assert.deepEqual(SIDE_SQL.map((step) => step.version), SIDE_SQL.map((_, i) => i + 1));
  for (const name of ["keplar_users", "keplar_sessions", "keplar_magic_used", "keplar_deleted_logins", "keplar_credentials", "keplar_mfa", "keplar_passkeys", "keplar_webauthn_challenges"]) {
    assert.ok(SIDE_SQL.some((step) => step.sql.includes(`CREATE TABLE IF NOT EXISTS ${name} `)), name);
  }
  assertSqlSetup(SIDE_SQL);
  assertSqlSetup([{ version: 1, sql: SQL_SETUP_TABLE }]);
  for (const sql of [
    "ALTER TABLE keplar_users ADD COLUMN extra text",
    "DROP TABLE keplar_users",
    "CREATE TABLE keplar_users (id text)",
    "CREATE TABLE IF NOT EXISTS keplar_users (id text); DROP TABLE keplar_users",
    "TRUNCATE keplar_sessions",
  ]) {
    assert.throws(() => assertSqlSetup([{ version: 1, sql }]), /refused/, sql);
  }
  const setup = read("src/lib/accounts/sql-setup.ts");
  const statements = [...setup.matchAll(/"(CREATE[^"]+)"/g)].map((m) => m[1]);
  assert.ok(statements.length >= SIDE_SQL.length + 1);
  for (const sql of statements) assert.doesNotMatch(sql, /\b(ALTER|DROP|TRUNCATE|RENAME)\b/i, sql);
  const persist = read("src/lib/accounts/persist.ts");
  assert.match(persist, /ensureSideSql\(\)/);
  assert.match(persist, /ALTER TABLE keplar_users ADD COLUMN IF NOT EXISTS onboarding_required/);
  assert.doesNotMatch(persist, /CREATE TABLE IF NOT EXISTS keplar_users/);
  for (const file of ["src/lib/accounts/credentials.ts", "src/lib/accounts/mfa/store.ts", "src/lib/accounts/passkeys/store.ts"]) {
    assert.match(read(file), /ensureSideSql\(\)/, file);
    assert.doesNotMatch(read(file), /CREATE TABLE/, file);
  }
  assert.match(read("docs/architecture/sql-setup.md"), /keplar_sql_setup/);
});

test("versions apply in order, a failure stops on the last success, and a second run does nothing", async () => {
  let stored = 0;
  const ran: string[] = [];
  const lines: string[] = [];
  const orig = console.log;
  const origErr = console.error;
  const keep = (...args: unknown[]) => { lines.push(args.map(String).join(" ")); };
  console.log = keep;
  console.error = keep;
  const query: SqlQuery = async (sql, params = []) => {
    if (sql.startsWith("SELECT")) return stored ? [{ version: String(stored) }] : [];
    if (sql.startsWith("INSERT")) {
      stored = Number(params[1]);
      return [];
    }
    if (sql.includes("keplar_boom")) throw new Error("boom");
    if (sql.startsWith("CREATE") && !sql.includes("keplar_sql_setup")) ran.push(sql);
    return [];
  };
  try {
    const steps = [
      { version: 1, sql: "CREATE TABLE IF NOT EXISTS keplar_one (id text PRIMARY KEY)" },
      { version: 2, sql: "CREATE INDEX IF NOT EXISTS keplar_one_id ON keplar_one (id)" },
      { version: 3, sql: "CREATE TABLE IF NOT EXISTS keplar_boom (id text PRIMARY KEY)" },
    ];
    await assert.rejects(applySqlSetup(steps, { id: "unit", query }), /boom/);
    assert.equal(stored, 2, "the failed statement does not advance the version");
    assert.equal(ran.length, 2);
    const again = await applySqlSetup(steps.slice(0, 2), { id: "unit", query });
    assert.deepEqual(again, { version: 2, applied: 0 });
    const logged = lines.filter((line) => line.includes("sql.setup"));
    assert.ok(logged.some((line) => line.includes("sql.setup.failed") && line.includes("\"version\":3")));
    assert.ok(logged.some((line) => line.includes("\"event\":\"sql.setup\"") && line.includes("\"applied\":0")));
    assert.equal(logged.some((line) => /postgres:\/\//.test(line)), false);
  } finally {
    console.log = orig;
    console.error = origErr;
  }
});

test("the real statements create the tables and record version side", async (ctx) => {
  const fake = await installFakeNeon();
  if (!fake) return ctx.skip("PGlite not installed");
  const prev = process.env.DATABASE_URL;
  process.env.DATABASE_URL = fake.url;
  try {
    const { neonQuery } = await import("@/lib/create/platform/neon");
    const first = await applySqlSetup(SIDE_SQL, { query: neonQuery });
    assert.equal(first.version, SIDE_SQL.length);
    assert.equal(first.applied, SIDE_SQL.length);
    const row = await neonQuery("SELECT version FROM keplar_sql_setup WHERE id = $1", [SQL_SETUP_ID]);
    assert.equal(Number(row[0]?.version), SIDE_SQL.length);
    for (const name of ["keplar_users", "keplar_sessions", "keplar_credentials", "keplar_mfa", "keplar_passkeys", "keplar_webauthn_challenges"]) {
      const exists = await neonQuery("SELECT to_regclass($1) AS name", [name]);
      assert.equal(exists[0]?.name, name, name);
    }
    const before = fake.calls.n;
    const second = await applySqlSetup(SIDE_SQL, { query: neonQuery });
    assert.deepEqual(second, { version: SIDE_SQL.length, applied: 0 });
    assert.ok(fake.calls.n - before <= 2, "a current version only checks the version row");
  } finally {
    if (prev === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prev;
    fake.restore();
  }
});
