# Project Horizon: what was built, what already existed, what is left

Status as of 2026-10-12, commits `0455718` to `6e3c1ef` on `main`. Nothing here is deployed yet (deployment needs the owner's go-ahead).
Every figure below was measured on the development machine with providers stubbed; none is a production number.

## Built in this initiative

| # | Capability | Status | Where | Evidence |
|---|---|---|---|---|
| 3 | AI execution flight recorder | Done (server + admin) | `src/lib/ops/flight.ts`, `/admin/flight`, `GET /api/admin/flight` | `tests/flight-recorder.test.ts` (real route: answered, all-429, all-500, no text stored, ordering, cap, classification, admin-only, retention) |
| 4 | Workflow checkpointing for chat answers (answer recovery) | Done (server + browser) | `src/lib/orchestration/turn-recovery.ts`, `/api/keplar/turn`, `src/components/app-ui/state/recovery.ts` | `tests/answer-recovery.test.ts` (replay without a provider call, isolation, private chats, drop mid-answer finishes headless, Stop honoured after a drop, 409 on duplicate); browser run: dropped stream -> "getting it for you" -> recovered answer, Stop posts the cancel |
| 5 | Model quality and drift observatory | Done (alert-only) | `src/lib/ops/observatory.ts`, `/api/cron/observatory`, Inngest `ops-model-observatory` | `tests/observatory.test.ts` (thresholds, too little data claims nothing, end-to-end alert once per day, audit) |
| 15 | Feature reliability scorecards | Done | `/admin/reliability` (features, models, reuse, deployment commit) | same tests; real rows only, "—" when there is too little data |
| 2 | Computation reuse (exact, not semantic) | Done for transcripts and link reads | `src/lib/reuse/cache.ts` | `tests/reuse.test.ts` (exactness, scope, expiry, errors, single-flight; the real link route fetches once for two reads) |
| 13 | Versioned event contract | Done | `src/lib/orchestration/event-contract.ts` | `tests/event-contract.test.ts` (validation, duplicates, stale, malformed line no longer kills an answer, route stamps v1 + seq) |
| 1 | Predictive preloading | Done for studio code | `src/components/app-ui/predict.ts`, switch in `/account#personalization` | `tests/predict.test.ts` |
| 10 | Session continuity: drafts and interrupted answers | Done (drafts, answer recovery) | `src/components/app-ui/drafts.ts` | `tests/drafts.test.ts`; browser run: a draft survives a reload, clearing forgets it |

## Measured

| What | Before | After |
|---|---|---|
| Retry of an answer that had already finished (Pro pipeline, providers stubbed at 400 ms) | 2,152 ms median, 7 provider calls | 8 ms median, 0 provider calls |
| Second read of the same link by the same person (simulated 300 ms fetch) | 316 ms | 0.07 ms |
| Flight recorder cost, a full 240-event timeline | n/a | 128 µs per request |
| Event validation, a 300-event answer stream | n/a | 13 µs per stream |

## Already in the codebase before this initiative (verified, not rebuilt)

- **6 Capacity and cost governor**: per-request USD caps, cost guard (kill switch, negative-margin throttle, quotas), global daily cap and circuit
  breaker (`breaker-routing.ts`), spend-spike auto-pause, usage cooldown, load shedding (`fanout.ts`), the shared Free-key governor
  (`pool-governor.ts`), agent limits (`business/guard/core.ts`: 40 steps per agent, concurrency, budget). Limits are told to the person.
- **11 Command palette**: Ctrl/⌘+K (`components/nav/CommandPalette.tsx`), keyboard navigable, in-app search dialog.
- **12 Adaptive rendering**: the FX tiers and Save-Data/reduced-motion handling, `after-paint.ts`, 3D scenes that pause on `visibilitychange`,
  `content-visibility: auto` for long chats, lazily loaded studios.
- **9 Live execution transparency**: real stage, model, research, Core and debate events in the answer card. Added here: the recovery states.
- **7/8 Contextual and progressive interfaces**: composer mode chips reveal research, study, slides, create and agent controls per workflow.
- **14 Product telemetry**: consented analytics, first-party SEO funnel events, error tracking, per-request cost rows. Added here: time to first
  output and failure causes per request, with no text stored.

## Not done (honest)

- No learned prediction beyond the three studios; no prediction for Business (kept separate on purpose).
- No reuse of whole answers, by design (they depend on the conversation, memory, the date and the panel).
- No embedding cache: the codebase has no embeddings.
- Checkpointing covers chat answers. Deep Research, image and video jobs keep their existing job tables; resumable uploads are not built.
- No keyboard-shortcuts help view in the palette; no simultaneous-session conflict UI beyond what chat sync already does.
- The admin pages were type-checked and their data functions tested, but not opened in a browser (they need an admin session).
- Drift alerts need real traffic: 20+ calls today and 50+ in the 7-day baseline per model before anything is claimed.

## Configuration

| Setting | Default | Effect |
|---|---|---|
| `KEPLAR_RETAIN_FLIGHT_DAYS` | 7 | days execution timelines are kept |
| answer checkpoints | 30 min readable, deleted within a day | `TURN_TTL_MS` in `turn-recovery.ts` |
| `/api/cron/observatory` | daily 06:53 UTC (Vercel), hourly via Inngest when on | drift alerts to `KEPLAR_OWNER_EMAIL` / alert webhook, once per model, kind and day |
| drift thresholds | success -15 pts, timeouts +10 pts, p95 x1.8 and > 5 s | `DRIFT` in `observatory.ts` |
| reuse | transcripts 15 min, link reads 10 min, in memory, 400 entries / 24 MB per instance | `REUSE` in `src/lib/reuse/cache.ts`; bump `version` to invalidate |
| predictive preloading | on, per browser | off with Save-Data or the switch in account settings (turning it off forgets what it learned) |
