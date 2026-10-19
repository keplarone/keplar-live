# Keplar One: production reliability certification (Directive III)

Branch `cursor/production-reliability-dfc3`, based on `main` at `1c011fe`. Everything below is either verified in this repository (a test, a typecheck, a run) or explicitly marked as not verified. Nothing here claims complete security, zero defects or guaranteed uptime.

## Progress log

| Step | Commit | Evidence |
|---|---|---|
| Audit (billing, providers, multi-model, security, ops) | n/a | Findings table below, with files |
| Billing: atomic Apple notification claims; Refresh plan cannot revive a cancelled membership | `4f946be` | `tests/billing-integrity.test.ts` (5) |
| Providers: no retry after our own timeout, backoff on network errors, long Retry-After fails over, per-endpoint circuit breaker | `83c27a7` | `tests/provider-resilience.test.ts` (7) |
| Multi-model: disclose gateway substitutions; the summary counts only the models that answered | `70d6577` | `tests/model-attribution.test.ts` (4) |
| Incidents (SEV-1 to SEV-4), webhook/error counters, report-only billing reconciliation, 5-minute external checks | `e1a152e` | `tests/incidents.test.ts` (12), `tests/billing-reconcile.test.ts` (3) |
| Reliability Center at `/admin/reliability`; admin layout gated server-side; Luau health probe behind the ops secret | `787814c` | `tests/security-hardening-iii.test.ts` (3) |
| Backup restore rehearsal on real Postgres; restore refuses non-empty targets and resets sequences | `0c031e3` | `tests/backup-restore-pglite.test.ts` (1), `tests/backup-script.test.ts` (6) |

Baseline before this work: 3,121 of 3,123 tests passing, none failing (2 skipped or todo), `tsc` clean. The result after it is recorded in report 8.

---

## 1. Production readiness audit

Severity is about customer impact if the issue occurs in production.

| Sev | Finding | Where | Status |
|---|---|---|---|
| HIGH | *Refresh plan* re-granted a plan from an old Whop payment after the membership was cancelled or refunded | `src/app/api/billing/sync/route.ts`, `src/lib/billing/sync.ts` | **Fixed**: `refreshClaim` only accepts a payment whose period starts after `canceledAt`, and never for `unpaid` |
| HIGH | A paid chat call that timed out on our side was retried, so the provider could bill twice for one answer | `src/lib/orchestration/http.ts` | **Fixed**: our own timeout raises 408, which is final |
| HIGH | A gateway that served a different model than requested (OpenRouter fallback, `:free` swap) was shown as the requested model | `providers/shared.ts`, `openrouter.ts`, `openai-compat.ts` | **Fixed**: `servedBy.substituted`, plus a visible "Answered by X in place of Y" note |
| MEDIUM | Apple notification de-duplication was read-then-insert, so two deliveries could both apply | `src/lib/billing/apple-sync.ts` | **Fixed**: atomic `insertIfAbsent` claim; a stale claim is taken over after 2 minutes |
| MEDIUM | No backoff on network errors (immediate retries, a storm risk) | `http.ts` | **Fixed**: exponential backoff with jitter |
| MEDIUM | A long `Retry-After` was cut down to 4 s and retried early | `http.ts` | **Fixed**: a delay longer than `maxMs` fails over instead |
| MEDIUM | No circuit breaker: a dead endpoint was hit on every request | new `circuit.ts` | **Fixed**, but per instance (see the risk register) |
| MEDIUM | "Reasoned with N intelligences" counted the planned panel, not the models that answered | `KeplarTurn.tsx`, `model-status.ts` | **Fixed**: `processSummary` |
| MEDIUM | No billing reconciliation job | n/a | **Added** (report only): `src/lib/billing/reconcile.ts` |
| MEDIUM | No incident detection; alerts were ad hoc per subsystem | n/a | **Added**: `src/lib/ops/incidents.ts` |
| MEDIUM | Backup restore never exercised against Postgres; serial sequences not reset; a restore over a non-empty target half-merged | `scripts/backup-db.mjs` | **Fixed and rehearsed** on PGlite; not yet on Neon |
| LOW | A missing Apple notification UUID fell back to a timestamp id (no de-duplication) | `src/app/api/webhooks/apple/route.ts` | **Fixed**: hash of the signed payload |
| LOW | `/admin/*` layout rendered for non-admins (pages checked individually) | `src/app/admin/layout.tsx` | **Fixed**: `notFound()` for non-admins |
| LOW | Unauthenticated callers could trigger the Luau health probe (spend) | `src/app/api/health/route.ts` | **Fixed**: needs the ops secret |
| MEDIUM | Admin MFA is off unless `KEPLAR_ADMIN_REQUIRE_MFA=1` | `src/lib/accounts/admin*` | Open: founder decision |
| MEDIUM | Rate limits and fan-out load shedding are per instance without Upstash Redis | `platform/ratelimit.ts` | Open: set `UPSTASH_REDIS_REST_URL`/`TOKEN` |
| LOW | `claimFromPayment` assumes a 31-day period from `paid_at` | `src/lib/billing/sync.ts` | Open (annual plans would be cut short if added) |
| LOW | Cron routes accept any `CRON_SECRET` length set by the operator; `opsAuthorized` requires 16+ | `src/app/api/cron/*` | Open |
| LOW | Apple "cancel at period end" is not modelled (access continues until expiry, which is correct, but is not shown) | `apple-sync.ts` | Open |
| LOW | Referral reward cap can race under concurrent redemptions | `src/lib/referrals` | Open |

## 2. Security findings report

Fixed in this pass, each with a regression test: the admin layout gate, the Luau probe behind `opsAuthorized`, atomic webhook claims (replays cannot double-apply), and Refresh plan not reviving revoked access (`tests/security-hardening-iii.test.ts`, `tests/billing-integrity.test.ts`).

Existing controls, unchanged and still covered by CI: secret scan of the source and build output, `npm audit --omit=dev --audit-level=high`, lockfile integrity, CodeQL, dependency review, the security checklist evidence check (`scripts/security-checklist.mjs --check`), HMAC-signed plan cookies, constant-time secret comparison, and the `security_events` audit trail.

Alerts and incident digests carry codes, counts and trace ids only; no email addresses, prompts or tokens (`incidents.test.ts`: "alerts never carry personal data"). Reconciliation reports carry workspace ids, not emails.

Open: admin MFA by default, per-instance rate limits, and the `DEV_SECRET` path in non-production builds. See the risk register.

## 3. AI reliability report

- **Timeouts:** 45 s per attempt. Our own timeout is final, because the provider may still be generating (and billing) the answer.
- **Retries:** at most 3 attempts. Only 429, 5xx and network errors are retried, with exponential backoff and jitter capped at 4 s. Other 4xx responses are final. A `Retry-After` longer than the cap fails over to the next model instead of waiting. A stream that has started is never retried.
- **Circuit breaker:** keyed by `host|model`. It opens after 5 failures in 60 s (`KEPLAR_CIRCUIT_FAILURES`, `_WINDOW_MS`), cools down for 30 s (`_COOLDOWN_MS`), then lets one probe through (half-open). Client errors and caller cancellations do not count. While open, calls fail in under a millisecond with 503 and the orchestrator fails over.
- **Cancellation:** a caller abort releases a half-open probe and is not counted as a failure.
- **Not done:** shared circuit state across instances (it lives in memory), and active synthetic provider health checks (health is inferred from real traffic in `model_calls`). Recoverable disconnects keep provider calls running so the answer can be resumed. That is deliberate, but it costs money if the user never returns.

Evidence: `tests/provider-resilience.test.ts` covers a 408 not retried, a 503 retried with backoff, a network error retried, a long Retry-After failing over, the breaker opening, half-open and closing, and an abort not counting.

## 4. Multi-model integrity report

- A substituted model is shown as "Answered by X in place of Y: the gateway substituted it…" in the answer's process notes (`served-model.ts`, `orchestrator.ts`, `live-synthesizer.ts`).
- The summary line reflects reality: "Answered by one model (1 of 3 responded)" or "Reasoned with 2 of 3 intelligences", never the planned panel size (`processSummary`).
- Dated suffixes, routing suffixes and a dropped vendor prefix are not treated as substitutions. A `:free` swap is.
- Evidence: `tests/model-attribution.test.ts`.
- Not verified: live gateway behaviour. The tests use recorded response shapes, not real OpenRouter calls.

## 5. Billing integrity report

- **Webhooks:** Whop was already idempotent. Apple is now idempotent through an atomic claim, and a crashed handler's claim is retaken after 2 minutes. Outcomes of the Whop, Apple and Stripe Connect webhooks are counted per hour (`system_webhook_hourly`), and failures raise a SEV-2.
- **Entitlements:** stay server-side (signed plan cookie, `planLapsed` at request time). Refresh plan can no longer re-grant after a cancellation.
- **Reconciliation:** runs daily (Vercel cron at 05:25 UTC and Inngest). It is **report only and never changes billing**. It looks for:
  - lapsed plans still marked paid;
  - revoked workspaces still marked paid;
  - free plans marked active;
  - refunded payments still marked paid;
  - ended Apple subscriptions still marked paid;
  - webhooks stuck in processing.

  Counts are stored for 90 days and shown in the Reliability Center. A non-zero result sends one alert.
- **Not done (needs approval or credentials):** comparison against Whop's and Apple's own records (a provider-side API pull), and any automated correction. No real charge, refund or subscription change was made in this work.

## 6. Cost control report

Existing controls, verified by their existing tests and unchanged:
- per-user hourly caps (`src/lib/ops/hourly.ts`);
- daily quotas (`usage/daily.ts`);
- the spend spike detector and the OpenRouter balance check (`telemetry.ts`, `openrouter-balance.ts`);
- the cost emergency runbook.

New:
- incident thresholds at 70% (SEV-3) and 90% (SEV-2) of the daily spend cap;
- no retry after a timeout (removes a double-billing path);
- the circuit breaker (stops paying for calls to a failing endpoint);
- the health probe that spends money now needs the ops secret.

Not done: per-feature cost budgets that are enforced, rather than only alerted on.

## 7. Database recovery report

- **Rehearsed (CI, every `npm test`):** `tests/backup-restore-pglite.test.ts`.
  - The real `scripts/backup-db.mjs` exports, with encryption, 2,611 rows across 7 app tables from one Postgres engine (PGlite) and restores them into another.
  - The data covers `jsonb`, `bytea`, unicode, timestamps, booleans, bigints and a `bigserial` column.
  - Every row matches exactly after the restore.
  - The app can insert afterwards, because sequences are reset.
  - Restoring over the app's `DATABASE_URL` is refused, and so is a non-empty target.
- **Bugs found by the rehearsal and fixed:** sequences were not advanced after a restore (the next insert would have collided), and a restore into a non-empty target failed part-way through instead of refusing up front.
- **Not verified:** a backup or restore of the real Neon database. No credentials are available to this environment. Neon point-in-time restore remains the primary protection. The founder checklist is in `docs/runbooks/backup-restore.md`. `Last restore test against Neon: never`.

## 8. End-to-end test report

- The full unit and integration suite (`npm test`), `npx tsc --noEmit` and `npx eslint . --quiet` were run on this branch. The results are under "Verification run" at the end of this file.
- The existing browser end-to-end scripts (`scripts/*-e2e.mjs`, `scripts/smoke-prod.mjs`, `scripts/route-smoke.mjs`) were **not re-run** in this pass. They need a running server and Chromium, and the changes here do not touch the pages they drive, apart from the admin layout gate.
- Not done: live purchase journeys through Whop or Apple. Those need real payments and approval.

## 9. Accessibility report

No UI was redesigned. The only visible changes are:
- the summary line and substitution notes, which are plain text in existing components;
- the Reliability Center, which uses the existing admin styles, semantic tables and headings, and a native `<details>` element.

The existing `scripts/axe-audit.mjs`, `tests/developers-a11y.test.ts` and `tests/i18n.test.ts` / `consent-i18n.test.ts` are unchanged. The axe audit was **not re-run** in this pass. New user-facing strings are in English only, like the rest of the answer process notes; they are not yet in the i18n catalogue.

## 10. Performance benchmark report

No benchmark was run in this pass, so no figures are claimed.

Overhead added on hot paths:
- **Per provider call:** one in-memory map lookup (the circuit breaker).
- **Per recorded error:** one counter increment, inside the existing write budget.
- **Per webhook:** one counter increment, done after the response is decided.
- **Per answer:** none beyond these, because the incident sweep and reconciliation run on schedules.

The Reliability Center makes about 10 parallel store reads per page view and is admin-only.

## 11. Incident response playbook

1. **Detect.**
   - The incident sweep runs every 5 minutes when Inngest is enabled. Otherwise it runs daily from Vercel cron, and every 5 minutes from the GitHub `Ops monitor` workflow once the `OPS_CHECK_SECRET` secret is set.
   - That workflow also fails if `/api/health` is not 200.
2. **Classify.** The sweep assigns severity:
   - SEV-1: service down, database unreachable, auth secret missing, or 50%+ of answers failing.
   - SEV-2: a major degradation: a provider failing, billing webhooks failing, or 90% of the spend cap.
   - SEV-3: a partial or contained problem.
   - SEV-4: informational.
3. **Notify.**
   - One digest per sweep goes to `KEPLAR_ALERT_WEBHOOK_URL` (or the owner email channel). It holds codes, counts and trace ids only.
   - Repeats are throttled: SEV-1 every 30 minutes, SEV-2 every 2 hours, SEV-3 every 12 hours, SEV-4 never.
   - Escalations and resolutions are always sent.
4. **Diagnose.** Open `/admin/reliability`. Each incident links trace ids to `/admin/flight?req=<id>`.
5. **Act.** Follow the matching runbook:
   - [provider-outage](../runbooks/provider-outage.md)
   - [database-outage](../runbooks/database-outage.md)
   - [auth-outage](../runbooks/auth-outage.md)
   - [billing-outage](../runbooks/billing-outage.md)
   - [cost-emergency](../runbooks/cost-emergency.md)
   - [security-incident](../runbooks/security-incident.md)
   - [failed-deploy](../runbooks/failed-deploy.md)
   - [backup-restore](../runbooks/backup-restore.md)
6. **Close.** Incidents resolve automatically when the signal clears. Resolved incidents stay visible for 90 days.

## 12. Release and rollback playbook

- **Release:** follow [`docs/RELEASE-CHECKLIST.md`](../RELEASE-CHECKLIST.md) and the deploy rules in `CLAUDE.md`.
  - Merge to `main` with CI green.
  - Deploy only with `npm run deploy:prod` or `npm run deploy`. The build guard refuses stale or unstamped uploads.
  - Check `https://keplar.one/deploy-stamp.json`.
  - Run `scripts/smoke-prod.mjs`.
- **Rollback:** [`docs/runbooks/rollback.md`](../runbooks/rollback.md). Prefer `vercel promote <previous deployment>`, which does not rebuild.
- **This change:**
  - It adds collections only and makes no schema migration; the new `system_*` collections are rows in `keplar_rows`.
  - It adds two Vercel crons.
  - Rolling it back is a plain promote of the previous deployment, with no data cleanup needed.

## 13. Monitoring and alerting report

| Signal | Source | Alert |
|---|---|---|
| Health (database, auth secret, crons) | `/api/health`, `health.ts` | Ops monitor (5 min), incident sweep |
| Answer failures, with trace ids | `system_flight` | SEV-1/2/3 at 50/25/10% of 10 or more answers in 15 minutes |
| Per-provider failure, rate limiting, latency | `model_calls` | SEV-2/3; SEV-1 if every provider is down |
| Circuit state | in memory per instance | shown in the Reliability Center |
| Server and client errors per minute | `system_error_minute` (and Sentry if `SENTRY_DSN` is set) | SEV-3/2 |
| Webhook outcomes | `system_webhook_hourly` | SEV-2 on billing failures |
| Spend against the cap | telemetry | SEV-3 at 70%, SEV-2 at 90% |
| Auth abuse | `security_events` | SEV-3 |
| Cron failed or late | `cronStatus` | SEV-3/4 |
| Alerts not routed | configuration | SEV-4 (shown on the dashboard) |
| Billing drift | daily reconciliation | one alert if non-zero |

The Reliability Center (`/admin/reliability`, admin-only, checked server-side) shows all of these, plus the existing observatory tables. It labels what the app cannot measure: backups, CI results and deploy history.

## 14. Outstanding risk register

| Risk | Impact | Needs | Owner |
|---|---|---|---|
| Backups never restored from the real Neon database | Data loss beyond the point-in-time window | Run the founder checklist in `backup-restore.md` | Founder |
| Alerts not routed | Incidents detected but nobody is told | Set `KEPLAR_ALERT_WEBHOOK_URL` | Founder |
| 5-minute detection depends on Inngest or the GitHub secret (Vercel Hobby runs crons daily only) | Up to 24 h to detect | Enable Inngest, or set `OPS_CHECK_SECRET` in GitHub secrets and Vercel env | Founder |
| No error aggregation outside the app | Errors only in our own counters | Set `SENTRY_DSN` | Founder |
| Circuit breaker, rate limits and load shedding are per instance | Uneven protection under scale-out | Upstash Redis (`UPSTASH_REDIS_REST_*`) | Founder / engineering |
| No reconciliation against Whop or Apple records | Drift on the provider side goes unseen | Provider API credentials and approval | Founder |
| Admin MFA optional | Admin account takeover risk | `KEPLAR_ADMIN_REQUIRE_MFA=1` | Founder |
| Live purchase journeys untested in this pass | Checkout regressions | A test purchase with approval | Founder |
| Generated media not on durable storage | Media loss | R2 (already in `known-gaps.md`) | Founder |
| Recoverable disconnects keep spending | Cost on abandoned answers | Accepted trade-off; revisit if costs spike | Engineering |

## 15. Production readiness verdict

**READY WITH CONDITIONS.**

The code paths reviewed here now:
- fail safe: no double-billing retries, honest model attribution, idempotent billing webhooks;
- detect and classify incidents;
- keep backups restorable on Postgres.

Each of these is backed by tests that run in CI. The conditions are operational and cannot be met from code:
1. Route alerts by setting `KEPLAR_ALERT_WEBHOOK_URL`.
2. Get 5-minute checks running: enable Inngest, or add `OPS_CHECK_SECRET` to GitHub and Vercel.
3. Run and record one real Neon backup and restore.

Until those three are done, treat the platform as monitored on a best-effort basis, with recovery depending on Neon point-in-time restore alone.

## Verification run

Run on this branch at `80ca21d` (Node 22, this repository's CI environment variables):

- `npm test`: 3,158 tests, 3,156 passed, **0 failed**, 2 skipped. An earlier run surfaced 6 failures. Five were caused by this work: the circuit breaker's process-wide state leaked between tests, and the count of Inngest functions changed. Both are fixed in `80ca21d`. The sixth was a 1 ms timing flake in `site-delete.test.ts` that passes on rerun.
- `npx tsc --noEmit`: clean. `npx eslint . --quiet`: clean. `node scripts/secret-scan.mjs`: no secrets. `node scripts/security-checklist.mjs --check`: ok.
- `npx next build`: succeeds. `/admin/reliability`, `/api/cron/incidents` and `/api/cron/billing-reconcile` are built as dynamic routes.
- **Smoke test against the built server** (`next start`, file store):
  - Signed out, `/admin/reliability` and `/admin/flight` return 404.
  - Both cron routes return 401 without the secret.
  - With the secret, the sweep opened exactly one incident (SEV-4, alerts not routed) and sent no notification. Reconciliation reported 0 findings.
  - Signed in as an admin, the Reliability Center rendered. It showed three rejected Whop webhooks sent during the test, the SEV-4 incident, and both new jobs as OK.
- **Not run:** the browser end-to-end scripts, the axe audit, any load or performance benchmark, and anything against production, Neon, Whop, Apple or Stripe.
