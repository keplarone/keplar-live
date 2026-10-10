# Database (Neon) outage

Signals: `/api/health` returns `ok:false` or slow `roundTripMs`; sign-in/chat saves fail; `[neon]` log lines.

1. Check Neon status and the project in the Neon console (compute suspended? connection limit? quota?).
2. Behaviour while it is down: sessions fall back to the signed cookie (users stay signed in), operator controls use the last known state, chat answers still work for signed-out use, saves/billing writes fail with friendly errors. Whop webhooks return 500 so Whop retries (handlers are idempotent by webhook id).
3. Compute stuck or storage full: restart/scale the compute in Neon; increase the plan if needed.
4. Corruption or bad migration: restore from a branch / point in time, see [backup-restore.md](backup-restore.md). Do not delete production data to "fix" things.
5. After recovery: check `/api/health`, then `/admin` (spend and calls recording again), then replay missed Whop events from the Whop dashboard if any failed.
