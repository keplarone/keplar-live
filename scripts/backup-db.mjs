#!/usr/bin/env node
/**
 * Keplar database export, restore and Neon branch snapshot. Zero dependencies (Node 20+); talks to Neon's HTTP SQL endpoint like the app does.
 *
 *   node scripts/backup-db.mjs                     export every table in schema public to backups/keplar-<UTC stamp>.jsonl.gz (+ .manifest.json), then VERIFY it
 *   node scripts/backup-db.mjs --verify <file>     re-read a backup file and check it against its manifest (no database needed)
 *   node scripts/backup-db.mjs --neon-branch       create a copy-on-write Neon branch "backup-<stamp>" through the Neon API (needs NEON_API_KEY, NEON_PROJECT_ID)
 *   node scripts/backup-db.mjs --restore <file> --confirm   load a backup into BACKUP_RESTORE_URL (an EMPTY scratch database with the app's tables created)
 *   flags: --out <dir> (default ./backups)  --keep <n> (keep the newest n backups, default 14; 0 = keep all)
 *
 * Env: BACKUP_DATABASE_URL (preferred: a role that can read every row, i.e. the owner or a BYPASSRLS read-only role) or DATABASE_URL.
 *      BACKUP_PASSPHRASE (optional): encrypts the file with AES-256-GCM (scrypt key). Without it the file is PLAIN TEXT personal data: store it accordingly.
 * Exit code 0 only if every step succeeded. A failed verify deletes nothing and exits 1.
 * HONESTY: this repo has never run this against the production database (no credentials in CI). Run it once, verify, and restore-test it into a scratch branch before trusting it.
 * Cron: see docs/runbooks/backup-restore.md.
 */
import { createHash, createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import { join, basename } from "node:path";

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const outDir = opt("--out", "backups");
const keep = Number(opt("--keep", "14"));
const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
const die = (m) => { console.error(`backup: ${m}`); process.exit(1); };
const sha = (buf) => createHash("sha256").update(buf).digest("hex");

/* ── SQL over HTTP (same protocol as src/lib/create/platform/neon.ts) ── */
function sqlClient(url) {
  const endpoint = process.env.BACKUP_SQL_ENDPOINT || `https://${new URL(url).hostname}/sql`;
  return async (query, params = []) => {
    const res = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", "neon-connection-string": url, "neon-raw-text-output": "true" }, body: JSON.stringify({ query, params }), signal: AbortSignal.timeout(60_000) });
    const j = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`database returned HTTP ${res.status}${j?.code ? ` (${j.code})` : ""}`);
    return j?.rows ?? [];
  };
}
const ident = (n) => `"${String(n).replace(/"/g, '""')}"`;

/* ── encryption (optional) ── */
const MAGIC = Buffer.from("KPBK1");
function encrypt(buf, pass) {
  const salt = randomBytes(16), iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", scryptSync(pass, salt, 32), iv);
  const body = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([MAGIC, salt, iv, c.getAuthTag(), body]);
}
function decrypt(buf, pass) {
  if (!buf.subarray(0, 5).equals(MAGIC)) throw new Error("not an encrypted Keplar backup");
  const salt = buf.subarray(5, 21), iv = buf.subarray(21, 33), tag = buf.subarray(33, 49);
  const d = createDecipheriv("aes-256-gcm", scryptSync(pass, salt, 32), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(buf.subarray(49)), d.final()]);
}

/** File content: one JSON object per line: {"t":"table","r":{...row}}. */
function readBackup(file) {
  let buf = readFileSync(file);
  if (buf.subarray(0, 5).equals(MAGIC)) {
    if (!process.env.BACKUP_PASSPHRASE) throw new Error("this backup is encrypted: set BACKUP_PASSPHRASE");
    buf = decrypt(buf, process.env.BACKUP_PASSPHRASE);
  }
  const text = gunzipSync(buf).toString("utf8");
  const counts = {};
  const lines = text.length ? text.trimEnd().split("\n") : [];
  for (const l of lines) { const o = JSON.parse(l); counts[o.t] = (counts[o.t] ?? 0) + 1; }
  return { lines, counts };
}

function verify(file) {
  const manifestFile = file.replace(/\.(jsonl\.gz|jsonl\.gz\.enc)$/, "") + ".manifest.json";
  if (!existsSync(manifestFile)) throw new Error(`manifest not found: ${manifestFile}`);
  const m = JSON.parse(readFileSync(manifestFile, "utf8"));
  const fileSha = sha(readFileSync(file));
  if (fileSha !== m.fileSha256) throw new Error("file checksum does not match the manifest (file changed or truncated)");
  const { counts } = readBackup(file);
  for (const [t, info] of Object.entries(m.tables)) if ((counts[t] ?? 0) !== info.rows) throw new Error(`table ${t}: file has ${counts[t] ?? 0} rows, manifest says ${info.rows}`);
  for (const t of Object.keys(counts)) if (!m.tables[t]) throw new Error(`table ${t} is in the file but not in the manifest`);
  return m;
}

async function exportAll() {
  const url = process.env.BACKUP_DATABASE_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) die("set BACKUP_DATABASE_URL (or DATABASE_URL)");
  const q = sqlClient(url);
  const tables = (await q("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name")).map((r) => r.table_name);
  if (!tables.length) die("no tables found in schema public (wrong database, or a role that cannot see them)");
  const PAGE = 2000;
  const lines = [];
  const info = {};
  for (const t of tables) {
    const total = Number((await q(`SELECT count(*)::text AS n FROM ${ident(t)}`))[0].n);
    let got = 0;
    for (let off = 0; off < total; off += PAGE) {
      const rows = await q(`SELECT row_to_json(x)::text AS j FROM (SELECT * FROM ${ident(t)} ORDER BY ctid LIMIT ${PAGE} OFFSET ${off}) x`);
      for (const r of rows) { lines.push(JSON.stringify({ t, r: JSON.parse(r.j) })); got++; }
      if (!rows.length) break;
    }
    // Rows can be added while we read; a table that has FEWER rows than counted means a read problem.
    if (got < total) throw new Error(`table ${t}: read ${got} of ${total} rows`);
    info[t] = { rows: got };
  }
  let buf = gzipSync(Buffer.from(lines.join("\n") + (lines.length ? "\n" : "")));
  let ext = "jsonl.gz";
  if (process.env.BACKUP_PASSPHRASE) { buf = encrypt(buf, process.env.BACKUP_PASSPHRASE); ext = "jsonl.gz.enc"; }
  mkdirSync(outDir, { recursive: true, mode: 0o700 });
  const base = join(outDir, `keplar-${stamp()}`);
  const file = `${base}.${ext}`;
  writeFileSync(file, buf, { mode: 0o600 });
  const manifest = { createdAt: new Date().toISOString(), tool: "scripts/backup-db.mjs", encrypted: ext.endsWith(".enc"), tables: info, totalRows: lines.length, fileSha256: sha(buf), note: "Rows read table by table, not one snapshot: rows written during the export may be missing or present in only some tables." };
  writeFileSync(`${base}.manifest.json`, JSON.stringify(manifest, null, 2), { mode: 0o600 });
  return { file, manifest };
}

function prune() {
  if (!(keep > 0) || !existsSync(outDir)) return 0;
  const files = readdirSync(outDir).filter((f) => /^keplar-\d{8}T\d{6}Z\.jsonl\.gz(\.enc)?$/.test(f)).sort();
  const old = files.slice(0, Math.max(0, files.length - keep));
  for (const f of old) { unlinkSync(join(outDir, f)); const m = join(outDir, f.replace(/\.jsonl\.gz(\.enc)?$/, ".manifest.json")); if (existsSync(m)) unlinkSync(m); }
  return old.length;
}

async function neonBranch() {
  const key = process.env.NEON_API_KEY, project = process.env.NEON_PROJECT_ID;
  if (!key || !project) die("set NEON_API_KEY and NEON_PROJECT_ID");
  const base = process.env.NEON_API_BASE || "https://console.neon.tech/api/v2";
  const name = `backup-${stamp()}`;
  const res = await fetch(`${base}/projects/${project}/branches`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ branch: { name } }) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) die(`Neon API returned HTTP ${res.status}${j?.message ? `: ${String(j.message).slice(0, 120)}` : ""}`);
  const id = j?.branch?.id;
  if (!id) die("Neon API did not return a branch id");
  const check = await fetch(`${base}/projects/${project}/branches/${id}`, { headers: { authorization: `Bearer ${key}` } });
  const c = await check.json().catch(() => ({}));
  if (!check.ok || c?.branch?.id !== id) die("branch was created but could not be read back");
  console.log(`backup: Neon branch ${name} (${id}) created and read back. Delete it in the console when no longer needed (branches count toward storage).`);
}

async function restore(file) {
  if (!flag("--confirm")) die("restore writes into a database: pass --confirm, and set BACKUP_RESTORE_URL to an EMPTY scratch database");
  const url = process.env.BACKUP_RESTORE_URL;
  if (!url) die("set BACKUP_RESTORE_URL");
  if (url === process.env.DATABASE_URL || url === process.env.POSTGRES_URL) die("refusing: BACKUP_RESTORE_URL equals the app's DATABASE_URL. Restore into a scratch branch, never straight into production.");
  verify(file);
  const q = sqlClient(url);
  const { lines } = readBackup(file);
  let n = 0;
  for (const l of lines) {
    const { t, r } = JSON.parse(l);
    await q(`INSERT INTO ${ident(t)} SELECT * FROM jsonb_populate_record(NULL::${ident(t)}, $1::jsonb)`, [JSON.stringify(r)]);
    n++;
  }
  console.log(`backup: restored ${n} rows into the target. Check row counts and sign in before trusting it.`);
}

try {
  if (flag("--neon-branch")) await neonBranch();
  else if (flag("--restore")) await restore(opt("--restore", ""));
  else if (flag("--verify")) {
    const f = opt("--verify", "");
    if (!f) die("--verify needs a file");
    const m = verify(f);
    console.log(`backup: ${basename(f)} verified: ${Object.keys(m.tables).length} tables, ${m.totalRows} rows, checksum matches, created ${m.createdAt}.`);
  } else {
    const { file, manifest } = await exportAll();
    const m = verify(file); // never report success for a file we have not read back
    const removed = prune();
    console.log(`backup: wrote ${file} (${statSync(file).size} bytes), ${Object.keys(m.tables).length} tables, ${manifest.totalRows} rows, verified by reading it back${manifest.encrypted ? " (encrypted)" : " (NOT encrypted)"}.${removed ? ` Pruned ${removed} old backup(s).` : ""}`);
  }
} catch (e) {
  die(e instanceof Error ? e.message : "failed");
}
