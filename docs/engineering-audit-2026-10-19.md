# Engineering audit and fixes: Oct 19, 2026

Scope: the consumer product in this repo (keplar.one). `keplarone/keplar-main` has only an empty initial commit. Everything below was checked in code; nothing here comes from a live model run, because this environment has no model, database or payment credentials.

## What already exists (not rebuilt)

The directive's Phases 1, 2, 7 and 9 are mostly built already. They were audited rather than rewritten:

- **Routing and depth.** Keplar Core (`src/lib/core/`, `docs/core-intelligence-status.md`) has Auto, Quick, Thorough and Exhaustive, with per-plan budgets and auto-escalation. Easy questions take the plain pipeline with no extra calls.
- **Multi-model collaboration.** `src/lib/orchestration/orchestrator.ts` runs the panel in parallel (one promise per seat, a shared deadline, stand-ins for slow seats). An extractor assigns each answer a stance, and the comparator groups the stances to find disagreement. A cross-family verifier then reviews the draft, and the writer synthesizes the answer. The "where the models disagree" section is kept only when there was more than one position (`disagreement-guard.ts`).
- **Research.** Deep Research (`research.ts`, `retriever.ts`) and desktop Live Research (`src/lib/research/live-request.ts`). Citations are cut to pages that were actually read (`linkCitations`).
- **Evaluation.**
  - `bench/` is a pre-registered harness: dev and test split, seeded sampling, paired bootstrap, McNemar, Holm correction, Wilson intervals, and a hard spend guard. Mock mode is the default.
  - `src/lib/core/bench.ts` holds 29 auto-scored items. Results and limitations are in `docs/core-intelligence-evals.md`.
- **Cost controls.** Per-plan budgets, the Free pool governor, daily USD caps, per-request caps and spend metering (`src/lib/cost`, `src/lib/usage`).
- **Caching.** Answers are never cached (`src/lib/reuse/cache.ts`). Only transcriptions and link reads are cached, scoped per workspace, user or device.

## Findings

| # | Sev | Finding | Where | Status |
|---|---|---|---|---|
| 1 | High | **A stopped Core turn was billed nothing.** On Thorough, Exhaustive and auto-escalated turns, `orchestrate()` set `run.settled = true` when its answer was ready. Core holds that answer back to revise it, and billing only happens on the final `answer` event. A Stop during the revision, after the panel's text had already streamed, therefore charged nothing. A Stop during Core's planning steps was also free (`run.started` was still false), and `orchestrate()` overwrote the Core budget that had been added to `plannedUnits`. | `src/lib/core/run.ts`, `orchestrator.ts:393,495,508,847`, `api/keplar/route.ts:670,675` | **Fixed** (5f348f8). Regression test fails before, passes after. |
| 2 | Medium | **Live Research fence could be closed by page text.** Only the brief's outer tags were checked. A page containing `</research_brief>` or `[End of Live Research]` made the text after it read as outside the data fence. | `src/lib/research/live-request.ts` | **Fixed** (8d4546c): `sealLiveBrief` neutralises every inner fence marker. |
| 3 | Medium | **Deep Research brief had no closing fence.** The page data ran straight into the question. | `src/lib/orchestration/research.ts` | **Fixed** (8d4546c): the data is wrapped in `<web_research>` tags, and titles, queries and notes can't open or close them. |
| 4 | Medium | **Citations are checked for existence, not support.** An `[n]` survives if page n was read. Nothing checks that the page says what the sentence says. "Verified answers" relies on the model's own verdict, and URLs are not checked to resolve. | `research.ts:126`, `retriever.ts:58-98` | **Open** (backlog 1) |
| 5 | Medium | **Concurrency and credit checks are check-then-act, per instance.** `inflight().n >= L.concurrent` runs before several awaits. The credit balance is read at the start and charged at the end. Parallel requests across instances can overspend; each request is still bounded by its per-request cap. | `src/lib/create/platform/usage.ts:138,153`, `route.ts:492` | **Open** (backlog 2) |
| 6 | Low | **Charge before send.** `settle()` runs before the answer is sent. If a later step throws, the person can be charged and still see an error. | `route.ts:647-650` | Open |
| 7 | Low | **Long stage timeouts.** Retriever web-check and research searches inherit 45 s × 3 attempts, bounded only by the 300 s `maxDuration`. | `config.ts:224`, `http.ts:30-58` | Open |
| 8 | Low | **Apple notification without a UUID never deduped.** The fallback id was `apple_<timestamp>`. | `api/webhooks/apple/route.ts:30` | **Fixed** (deterministic hash of the signed payload) |
| 9 | Low | **Apple dedupe is check-then-act.** The event row is inserted after the grant. Impact is small because grant and revoke are idempotent updates. | `src/lib/billing/apple-sync.ts:157,209` | Open |
| 10 | Low | **Apple purchase binding is first-come.** `appAccountToken` is not compared with the caller's workspace. This is a documented design choice; exploiting it needs the victim's signed transaction. | `apple-sync.ts:136-152` | Open, by design |
| 11 | Low | **Guest daily cap resets with a fresh device cookie.** | `daily.ts:121` | Open; IP and pool limits still apply |

The security sweep found no Critical issues:

- All ~330 route handlers were checked against the shared auth helpers.
- All admin routes enforce admin access on the server.
- All cron routes compare `CRON_SECRET` in constant time.
- The Whop, Stripe, Higgsfield and inbound-email webhooks verify signatures and dedupe atomically.
- No IDOR: stores take the workspace id on every call.
- No secrets in error responses.

## Test report

| Check | Result |
|---|---|
| `npm test`, before | 3,123 tests: 3,121 pass, 0 fail, 2 skipped |
| `npm test`, after | 3,126 tests: 3,124 pass, 0 fail, 2 skipped (3 new tests) |
| `tsc --noEmit` (full repo, 6 GB heap) | Clean |
| ESLint on changed files | Clean |
| E2E (`npm run test:e2e`), visual regression, live model calls | **Not run** |

New tests:

- `tests/core-engine.test.ts`: "billing: a stop while Core revises…"
- `tests/live-research.test.ts`: "fence: a page can't close…"
- `tests/deep-research.test.ts`: "fence: page-derived titles…"

## Not verified here (no credentials in this environment)

- A live Ask, Core, Deep Research or Debate turn.
- Streaming against real providers.
- Checkout, webhooks or entitlements against Stripe, Whop or Apple.
- The database policies against Neon.
- Latency (p50/p95).
- Any head-to-head win rate.

No benchmark, latency or win-rate number is claimed in this document. The existing eval numbers and their limits are in `docs/core-intelligence-evals.md`, and `bench/README.md` gives the cost of a real run (pilot-100 ≈ $122). Running it is a spending decision for the owner.

## Deployment and rollback

These changes are on branch `claude/kind-heisenberg-cq9la8` and are not merged. Under `CLAUDE.md`, a merge to `main` deploys automatically. Rollback without a rebuild is `vercel promote <previous deployment>`. Fix 1 changes what paid users are charged when they stop a Thorough turn, so it should be reviewed before merging.

## Backlog (priority order)

1. **Citation support check for Deep Research.** For each cited sentence, check its numbers and key terms against that page's snippet and notes. Show a "not found in the cited page" state in the source chip, the way Live Research already shows `not-verified`. Optionally HEAD-check cited URLs. Don't silently drop citations: paraphrases would be lost.
2. **Atomic concurrency and credit reservation.** Use the shared limiter (Postgres or Upstash) for `inflight` and reserve credits up front.
3. **Stage timeouts** of about 20 s for retriever web-checks and research searches, like the existing sourcing guard.
4. **Atomic Apple event claim:** `insertIfAbsent` before the grant, as Whop does (`sync.ts:128`).
5. **Blind pairwise preference evals** for open-ended tasks that have no gold answer: randomized A/B order, both orders judged, ties allowed, a judge from a third model family, and Wilson intervals. `bench/` covers accuracy only today.
6. **A real `bench/` pilot run**, once the owner approves the spend.
