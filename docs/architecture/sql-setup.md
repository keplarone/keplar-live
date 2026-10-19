# Side SQL setup

`src/lib/accounts/sql-setup.ts` is the ordered setup for the tables that used to be created inline in `persist.ts`, `credentials.ts`, `mfa/store.ts`, and `passkeys/store.ts`.

Each statement is `CREATE TABLE IF NOT EXISTS` or `CREATE INDEX IF NOT EXISTS` / `CREATE UNIQUE INDEX IF NOT EXISTS`, with the same text as before. The module refuses anything else (an add column, a drop, a rename, a second statement) and does not send it. After each statement that runs, it writes one row in `keplar_sql_setup` (`id` `side`, integer `version`). The next process starts at that version. A failure leaves the version on the last statement that finished.

`keplar_sql_setup` is a new table, created with `CREATE TABLE IF NOT EXISTS`. It stores a setup id, an integer version, and when that version was recorded. It holds no personal data, and it does not change `keplar_users` or the other existing tables.

The `ADD COLUMN IF NOT EXISTS` statements already in `persist.ts` are not in this list. They keep running where they already did. This slice does not add a new change to an existing table.

A finished check logs `sql.setup` with the version and how many statements ran. A refused list logs `sql.setup.refused`. A statement that fails logs `sql.setup.failed` with the version and the error name.
