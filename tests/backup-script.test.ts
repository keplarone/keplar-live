import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** The backup script against a fake Neon SQL endpoint (an in-memory "database"). Proves the file format, verification and failure paths; it does NOT prove anything about real Neon. */
const DB: Record<string, Record<string, unknown>[]> = {
  keplar_rows: Array.from({ length: 2503 }, (_, i) => ({ collection: "chat_threads", workspace_id: `ws${i % 7}`, id: `r${i}`, data: { n: i } })),
  keplar_users: [{ id: "u1", email: "a@b.co" }, { id: "u2", email: "c@d.co" }],
  empty_table: [],
};
let lastRestoreSql: { q: string; p: unknown[] }[] = [];
function fake(): Promise<{ url: string; close: () => void }> {
  const server = http.createServer((req, res) => {
    let b = "";
    req.on("data", (d) => (b += d));
    req.on("end", () => {
      const { query, params } = JSON.parse(b) as { query: string; params: unknown[] };
      const out = (rows: unknown[]) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ rows })); };
      if (/information_schema\.tables/.test(query)) return out(Object.keys(DB).sort().map((t) => ({ table_name: t })));
      let m = /SELECT count\(\*\)::text AS n FROM "(\w+)"/.exec(query);
      if (m) return out([{ n: String(DB[m[1]].length) }]);
      m = /FROM "(\w+)" ORDER BY ctid LIMIT (\d+) OFFSET (\d+)/.exec(query);
      if (m) return out(DB[m[1]].slice(Number(m[3]), Number(m[3]) + Number(m[2])).map((r) => ({ j: JSON.stringify(r) })));
      if (/INSERT INTO/.test(query)) { lastRestoreSql.push({ q: query, p: params }); return out([]); }
      res.statusCode = 500; res.end("{}");
    });
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r({ url: `http://127.0.0.1:${(server.address() as { port: number }).port}/sql`, close: () => server.close() })));
}
/** Async spawn: the fake database lives in this process, so a blocking spawnSync would deadlock it. */
const run = (args: string[], env: Record<string, string>) =>
  new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const c = spawn("node", ["scripts/backup-db.mjs", ...args], { env: { PATH: process.env.PATH ?? "", ...env } as unknown as NodeJS.ProcessEnv });
    let stdout = "", stderr = "";
    c.stdout.on("data", (d) => (stdout += d));
    c.stderr.on("data", (d) => (stderr += d));
    c.on("close", (status) => resolve({ status, stdout, stderr }));
  });

test("export writes a gzip file + manifest with exact row counts and verifies it by reading it back", async () => {
  const f = await fake();
  const dir = mkdtempSync(join(tmpdir(), "kp-bk-"));
  try {
    const r = await run(["--out", dir], { BACKUP_DATABASE_URL: "postgres://u:p@ep-test.neon.tech/db", BACKUP_SQL_ENDPOINT: f.url });
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.match(r.stdout, /3 tables, 2505 rows, verified by reading it back \(NOT encrypted\)/);
    const files = readdirSync(dir);
    assert.equal(files.length, 2);
    const man = JSON.parse(readFileSync(join(dir, files.find((x) => x.endsWith(".manifest.json"))!), "utf8"));
    assert.deepEqual(man.tables, { empty_table: { rows: 0 }, keplar_rows: { rows: 2503 }, keplar_users: { rows: 2 } });
    assert.ok(!r.stdout.includes("postgres://") && !r.stderr.includes("postgres://"), "connection string never printed");
    // verify mode works offline, and detects tampering
    const file = join(dir, files.find((x) => x.endsWith(".jsonl.gz"))!);
    assert.equal((await run(["--verify", file], {})).status, 0);
    writeFileSync(file, Buffer.concat([readFileSync(file), Buffer.from("x")]));
    const bad = await run(["--verify", file], {});
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /checksum does not match/);
  } finally { f.close(); }
});

test("encrypted export needs the passphrase to verify; a wrong one fails", async () => {
  const f = await fake();
  const dir = mkdtempSync(join(tmpdir(), "kp-bk-"));
  try {
    const env = { BACKUP_DATABASE_URL: "postgres://u:p@ep-test.neon.tech/db", BACKUP_SQL_ENDPOINT: f.url, BACKUP_PASSPHRASE: "correct horse" };
    const r = await run(["--out", dir], env);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /\(encrypted\)/);
    const file = join(dir, readdirSync(dir).find((x) => x.endsWith(".enc"))!);
    assert.equal((await run(["--verify", file], { BACKUP_PASSPHRASE: "correct horse" })).status, 0);
    assert.equal((await run(["--verify", file], { BACKUP_PASSPHRASE: "wrong" })).status, 1);
    assert.equal((await run(["--verify", file], {})).status, 1);
    assert.doesNotMatch(readFileSync(file).toString("latin1"), /a@b\.co/, "no plaintext in an encrypted file");
  } finally { f.close(); }
});

test("a database error fails the run with exit 1 and writes no backup", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kp-bk-"));
  const r = await run(["--out", dir], { BACKUP_DATABASE_URL: "postgres://u:p@ep-test.neon.tech/db", BACKUP_SQL_ENDPOINT: "http://127.0.0.1:9/sql" });
  assert.equal(r.status, 1);
  assert.deepEqual(readdirSync(dir), []);
  assert.equal((await run([], {})).status, 1, "no URL configured");
});

test("--keep prunes old backups and their manifests", async () => {
  const f = await fake();
  const dir = mkdtempSync(join(tmpdir(), "kp-bk-"));
  try {
    for (const s of ["20260101T000000Z", "20260102T000000Z", "20260103T000000Z"]) { writeFileSync(join(dir, `keplar-${s}.jsonl.gz`), "x"); writeFileSync(join(dir, `keplar-${s}.manifest.json`), "{}"); }
    const r = await run(["--out", dir, "--keep", "2"], { BACKUP_DATABASE_URL: "postgres://u:p@ep-test.neon.tech/db", BACKUP_SQL_ENDPOINT: f.url });
    assert.equal(r.status, 0, r.stderr);
    const left = readdirSync(dir);
    assert.ok(!left.some((x) => x.includes("20260101") || x.includes("20260102")), left.join(","));
  } finally { f.close(); }
});

test("restore refuses without --confirm, refuses the production URL, and issues one parameterised insert per row", async () => {
  const f = await fake();
  const dir = mkdtempSync(join(tmpdir(), "kp-bk-"));
  try {
    const base = { BACKUP_DATABASE_URL: "postgres://u:p@ep-test.neon.tech/db", BACKUP_SQL_ENDPOINT: f.url };
    assert.equal((await run(["--out", dir], base)).status, 0);
    const file = join(dir, readdirSync(dir).find((x) => x.endsWith(".jsonl.gz"))!);
    assert.equal((await run(["--restore", file], base)).status, 1);
    assert.equal((await run(["--restore", file, "--confirm"], { ...base, BACKUP_RESTORE_URL: "postgres://x:y@h/db", DATABASE_URL: "postgres://x:y@h/db" })).status, 1);
    lastRestoreSql = [];
    const ok = await run(["--restore", file, "--confirm"], { ...base, BACKUP_RESTORE_URL: "postgres://scratch:y@ep-scratch.neon.tech/db" });
    assert.equal(ok.status, 0, ok.stderr);
    assert.equal(lastRestoreSql.length, 2505);
    assert.match(lastRestoreSql[0].q, /INSERT INTO "\w+" SELECT \* FROM jsonb_populate_record\(NULL::"\w+", \$1::jsonb\)/);
  } finally { f.close(); }
});

test("Neon branch mode: creates and reads back a branch via the API (mock), fails clearly without credentials", async () => {
  const server = http.createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.method === "POST" && req.headers.authorization === "Bearer k") { res.end(JSON.stringify({ branch: { id: "br-1" } })); return; }
    if (req.method === "GET" && req.url?.endsWith("/branches/br-1")) { res.end(JSON.stringify({ branch: { id: "br-1" } })); return; }
    res.statusCode = 401; res.end(JSON.stringify({ message: "nope" }));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const ok = await run(["--neon-branch"], { NEON_API_KEY: "k", NEON_PROJECT_ID: "p", NEON_API_BASE: base });
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /Neon branch backup-\d{8}T\d{6}Z \(br-1\) created and read back/);
    assert.equal((await run(["--neon-branch"], { NEON_API_KEY: "wrong", NEON_PROJECT_ID: "p", NEON_API_BASE: base })).status, 1);
    assert.equal((await run(["--neon-branch"], {})).status, 1);
  } finally { server.close(); }
});
