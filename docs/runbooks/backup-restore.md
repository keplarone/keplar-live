# Backup and restore (Neon)

What lives where: all product data is in Neon Postgres (`keplar_rows` JSON documents, `keplar_users`, `keplar_sessions`, `inquiries`). Payments live in Whop; email in Resend. Generated media on Vercel is NOT durable yet (R2 not wired).

**Backups are Neon's:** point-in-time restore (history window depends on the Neon plan; check the project's *Restore* tab) and branching.

Take a manual safety copy before any risky operation: Neon console -> Branches -> *Create branch* from `main` (copy-on-write, instant, name `pre-<change>-<date>`). Delete it after the change is verified.

Restore options:
1. **Look first, no risk:** create a branch from a past point in time (Neon -> Restore -> *Create branch at a timestamp*). Query it to find the correct rows.
2. **Surgical:** copy the specific rows from the recovered branch back with SQL.
3. **Full restore:** Neon -> Restore -> restore `main` to the timestamp (this rewinds all data after that time; users lose newer data). Requires the operator's explicit decision. Afterwards: `/api/health`, sign in, check `/admin`.

Test the procedure quarterly: create a branch from yesterday, count rows in `keplar_users`, delete the branch. Recorded in CHECKPOINTS.
Export for a user (data request): until the self-serve export exists, run SQL for `keplar_rows` where `workspace_id = <ws>` plus their `keplar_users` row, and email it to the verified address.

## Scripted export and Neon branch snapshot (`scripts/backup-db.mjs`)

**Status: NOT VERIFIED IN PRODUCTION.** The script is tested against a fake database only (`tests/backup-script.test.ts`). Nobody has yet run it against the real Neon database, and no scheduled backup is running. Until the founder runs the checks below and records the date here, assume the only protection is Neon's own point-in-time restore window (check the Neon *Restore* tab for its length on your plan).

```
BACKUP_DATABASE_URL=postgres://…  BACKUP_PASSPHRASE=…  node scripts/backup-db.mjs --out /secure/backups --keep 14
node scripts/backup-db.mjs --verify /secure/backups/keplar-<stamp>.jsonl.gz.enc
NEON_API_KEY=…  NEON_PROJECT_ID=…  node scripts/backup-db.mjs --neon-branch
```

- `BACKUP_DATABASE_URL` must be a role that can read every row (the owner, or a read-only role with BYPASSRLS): `keplar_rows` has row-level security, and a normal app role would export nothing or little. The script fails if a table reads fewer rows than it counted, but it cannot detect rows hidden by RLS: compare the counts in the manifest with a `SELECT count(*)` run in the Neon console as the owner.
- Output: `keplar-<UTC stamp>.jsonl.gz[.enc]` plus `.manifest.json` (per-table row counts, SHA-256 of the file). Every run re-reads the file it wrote and checks it against the manifest before saying success. Tables are read one after another, not in one snapshot.
- The file contains personal data and any credentials stored in the database. Set `BACKUP_PASSPHRASE` (AES-256-GCM) and keep the file off Vercel and out of git (`backups/` is git-ignored). Keep the passphrase somewhere other than next to the file. The restore needs it.
- `--neon-branch` creates a copy-on-write Neon branch `backup-<stamp>` through the Neon API and reads it back. It lives inside the same Neon project, so it does **not** protect against losing the project or the account. Delete old ones.
- Restore: `BACKUP_RESTORE_URL=<scratch database with the app's tables created> node scripts/backup-db.mjs --restore <file> --confirm`. It refuses to run against the app's own `DATABASE_URL`. The restore path has never run against a real Postgres: rehearse it into a scratch Neon branch before you need it.

### Run it on a schedule (cron)
Vercel cron cannot do this (no durable disk, short time limit). Use any machine you control, e.g. weekly at 03:10 UTC:

```
10 3 * * 0  cd /path/to/keplar && BACKUP_DATABASE_URL=… BACKUP_PASSPHRASE=… node scripts/backup-db.mjs --out /secure/backups --keep 8 >> /var/log/keplar-backup.log 2>&1 || mail -s "Keplar backup FAILED" team@keplar.one < /dev/null
```
The script exits 1 on any failure so cron/monitoring can alert. A scheduler you sign up for (cron host, uptime monitor, off-site storage) is a founder action: see docs/known-gaps.md.

### Founder checklist to make this real
1. Run the export once; confirm the row counts against the Neon console. 2. Run `--verify`. 3. Restore into a scratch Neon branch and sign in against it. 4. Schedule it and store the output off-site. 5. Write the date of step 3 here: `Last restore test: never`.
