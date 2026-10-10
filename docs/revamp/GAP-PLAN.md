# Keplar ULTIMATE COMPLETION: gap plan (phase 0)

Written 2026-10-02 (ET) from the repo at master `f36d3aa` and keplar.one. Baseline at `caa5aa7`: typecheck OK, lint 0 errors (5 warnings), build OK,
220 tests (3 failing at that commit; fixed by their owners within the hour, now 275/275 green).
Classes: **LC** launch-critical (must ship for public release), **LB** launch as BETA/COMING SOON with honest labels, **PL** post-launch.
"Never fake": every visible control works or says BETA / PRIVATE BETA / COMING SOON / REQUEST ACCESS.

## Summary of release blockers (all addressed unless marked OPEN)

| # | Blocker | State |
|---|---|---|
| B1 | No operator kill switches / global stop; media pause not enforced on the media path | FIXED (`src/lib/ops`, batch 1) |
| B2 | No admin surface with real data | FIXED (`/admin`, admin-only, batch 1) |
| B3 | Refund / cancel left the signed plan cookie valid until it expired; "Refresh plan" could undo a refund | FIXED |
| B4 | Embedded-checkout browser metadata could name a tier for an unknown Whop plan | FIXED |
| B5 | Rate limits are per-instance unless Upstash is set | OPEN: needs `UPSTASH_REDIS_REST_URL/TOKEN` (user) |
| B6 | Error tracking has no sink (no Sentry/OTel key) | OPEN: structured logs only; needs a provider key (user) |
| B7 | Cookie consent absent while analytics loaded unconditionally | FIXED (banner + gating) |
| B8 | Public abuse report can take a site down (csam/ncii auto-takedown) without human review | KNOWN: deliberate safety default, rate-limited 5/min/IP; review in `/admin` audit |
| B9 | R2 blob store is a placeholder; generated media on Vercel is ephemeral (local FS) | OPEN: media outputs not durable until R2 is wired (user: R2 keys) |

## 1. Core: Keplar-One pipeline (LC)
Exists: classifier -> router -> parallel panel -> comparator -> verifier (model review) -> synthesizer; small talk runs one free model without a report; no majority vote; judge on disagreement; per-request cost caps; safe visible phases. Retrieval is **not live** and copy says so.
Missing: provider-neutral registry file with plan access/enabled flags (partial: `catalog.json`, live roster, `ModelSpec`), FAST/STANDARD/DEEP naming (strategies auto/fast/balanced/thorough exist), explicit AUTH/VALIDATE/CONTEXT stage names in the event stream, Intelligence Report labels STRONG AGREEMENT... (agreement/disagreement UI exists; named labels partial).
Plan: LC = keep as is + enforce kill switches (done). LB = named report labels. PL = registry file/plan-access, retrieval/"verified against sources" (must stay unclaimed).

## 2. Conversation continuity (LC, owned by the memory executor)
Exists: history sent to models, DB chats, summaries, FTS recall, "what did I just ask". Verify at the end (cross-user isolation tests exist in `tests/memory.test.ts`, `chat-context.test.ts`).

## 3. Cost Governor + Quality Governor (LC)
Exists: plan credits, 5-hour + weekly windows, daily USD per user, per-request caps, free pause, admin cap, global circuit breaker (cheap/no-media/capped), per-user spend cooldown, concurrency + job slots, live daily budget guard on every provider call.
Added: global emergency stop, media/agents pause, provider/model disable, spend-spike auto-pause + owner alert, model-call telemetry. Compute levels LIGHT..INTENSIVE exist in the composer (`orchestration/compute.ts`).
Missing: per-provider and per-model hourly limits (use kill switches meanwhile), retry-storm/loop detection beyond rate limits (spike detector covers cost), Quality Governor beyond verifier (PL).

## 4. /admin (LC) - DONE
Real data only: users, plan mix, MRR from active subscriptions recorded by Whop webhooks, spend by feature/plan/user/model/provider, margin estimate (labelled, excludes fees/hosting), requests/min, errors, p50/p95 latency, inquiries, kill switches, audit log, masked emails, setup status (names only). Secured server-side (verified session + `KEPLAR_ADMIN_EMAILS`, default team@keplar.one; 404 to everyone else; POST same-origin + rate-limited + audited).

## 5. Design system and navigation (LB)
Exists: tokens (`styles/tokens.css`), Lexend Deca, Dark/Light/Auto (default dark), hero Three.js fields (marketing), App sidebar: Projects, Agents, Create, Slides, Study, Business, History.
Missing: white-first defaults (default pref -> auto), primary nav ASK/CREATE/PROJECTS/AGENTS/BUSINESS + secondary DEPLOYMENTS/MEMORY/APPROVALS/USAGE/SETTINGS, Home "What do you want to do?", proprietary buttons, semantic colour tokens.
Plan: LC = default theme auto + token additions + honest nav labels; LB = nav regrouping and home; PL = full button language.

## 6. Composer (LC)
Exists: controlled textarea, IME-safe Enter, undo/redo native, media attach, routing panel. Added: voice dictation (Web Speech, real states). Missing: prompt-into-field transition (needs spatial layer).

## 7. Spatial layer / Convergence Field (LB)
Exists: lazy Three.js hero fields with reduced-motion + low-power fallbacks; `ConvergeCanvas`. Missing: one shared layer with tiers (subtle/rich/immersive/none), adaptive DPR, render-on-demand, disposal, data-driven scenes (response agreement from real orchestration data, memory constellation, projects graph, agents DAG, approvals flow). Admin/Settings: none. Plan: shared `src/lib/spatial` core + composer/response/loading scenes (LB); the rest PL and labelled by absence (no fake scenes).

## 8. Projects, Artifacts, Agents, Firewall, Settings (LB)
Exists: Create projects/versions (site builder), Slides/Study decks, Business agents with caps, kill switch, approvals queue, audit log, Stripe Connect adapters (not set up), per-agent auto-send.
Missing: AI Firewall (risk classes enforced server-side), Operating Mandate/Autopilot (must stay BETA/off), Decision artifacts, Missions DAG, Settings categories + search, account deletion + data export (memory hard delete exists).
Plan: Firewall plumbing for Business agents (LC: outbound risk tiers, never auto-send critical, PII/secret scan); Autopilot = COMING SOON; account deletion/export = LB with a request path via team@keplar.one until built.

## 9. Security / observability / DR (LC)
Exists: CSP + headers, same-origin proxy, per-IP limits, signed webhooks, SSRF-safe URLs for Whop, upload validation, sandbox CSP for user sites, security tests. Added: ops audit, constant-time admin token, plan revocation.
Missing: structured logs with correlation ids (LB), error-tracking hook (OPEN B6), runbooks + backup/rollback docs (LC, `docs/runbooks/*`).

## 10. Priority order used
security > data integrity > billing > cost safety > authorization > Keplar-One > core UX > reliability > testing > mobile > performance > accessibility > visual polish.

## Needs from the user (no keys requested in chat)
Upstash Redis (shared rate limits), an error-tracking DSN, R2 credentials (durable media), Stripe Connect keys (seller payments), Gmail/Slack/Calendar OAuth (connectors), Resend already set. Everything unavailable shows "not set up".
