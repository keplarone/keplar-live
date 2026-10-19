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
| 4 | Medium | **Citations were checked for existence, not support.** An `[n]` survives if page n was read. Nothing checks that the page says what the sentence says. "Verified answers" relies on the model's own verdict, and URLs are not checked to resolve. | `research.ts:126`, `retriever.ts:58-98` | **Fixed** in the second pass (below) |
| 5 | Medium | **Concurrency and credit checks are check-then-act, per instance.** `inflight().n >= L.concurrent` runs before several awaits. The credit balance is read at the start and charged at the end. Parallel requests across instances can overspend; each request is still bounded by its per-request cap. | `src/lib/create/platform/usage.ts:138,153`, `route.ts:492` | **Fixed** in the second pass |
| 6 | Low | **Charge before send.** `settle()` runs before the answer is sent. If a later step throws, the person can be charged and still see an error. | `route.ts:647-650` | **Fixed** in the second pass |
| 7 | Low | **Long stage timeouts.** Retriever web-check and research searches inherit 45 s × 3 attempts, bounded only by the 300 s `maxDuration`. | `config.ts:224`, `http.ts:30-58` | **Fixed** in the second pass |
| 8 | Low | **Apple notification without a UUID never deduped.** The fallback id was `apple_<timestamp>`. | `api/webhooks/apple/route.ts:30` | **Fixed** (deterministic hash of the signed payload) |
| 9 | Low | **Apple dedupe is check-then-act.** The event row is inserted after the grant. Impact is small because grant and revoke are idempotent updates. | `src/lib/billing/apple-sync.ts:157,209` | **Fixed** in the second pass (Whop's stale takeover too) |
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

## Backlog (priority order, first pass; items 1 to 5 were done in the second pass below)

1. **Citation support check for Deep Research.** For each cited sentence, check its numbers and key terms against that page's snippet and notes. Show a "not found in the cited page" state in the source chip, the way Live Research already shows `not-verified`. Optionally HEAD-check cited URLs. Don't silently drop citations: paraphrases would be lost.
2. **Atomic concurrency and credit reservation.** Use the shared limiter (Postgres or Upstash) for `inflight` and reserve credits up front.
3. **Stage timeouts** of about 20 s for retriever web-checks and research searches, like the existing sourcing guard.
4. **Atomic Apple event claim:** `insertIfAbsent` before the grant, as Whop does (`sync.ts:128`).
5. **Blind pairwise preference evals** for open-ended tasks that have no gold answer: randomized A/B order, both orders judged, ties allowed, a judge from a third model family, and Wilson intervals. `bench/` covers accuracy only today.
6. **A real `bench/` pilot run**, once the owner approves the spend.

## Second pass (same day): the backlog, worked through

| # | Was | What changed | Commit | Evidence |
|---|---|---|---|---|
| 4 | Citations checked for existence only | Each cited sentence is compared with what was read from its pages (the search's passage and the reading model's notes for that page): figures first, then content words. Statements are labelled supported, partly supported or not verified, and nothing is removed. The header shows the counts; a "Citation check" list shows flagged statements with the closest line read. | fbbbbb3 | Unit tests in `tests/deep-research.test.ts` (checker and end-to-end pipeline). `e2e/citation-check.e2e.ts` covers desktop and 390 px, keyboard, no overflow, and axe in light and dark, with screenshots checked by eye. |
| 5 | Concurrency and credits check-then-act, per instance | (a) The in-memory slot is checked and claimed in one synchronous step. (b) Signed-in paid plans take a shared `answer` job slot (330 s TTL) that every instance sees. (c) Each answer records its planned credits on that slot, and the route subtracts other live slots' credits. (d) An expired job slot is taken over by exactly one caller, which also fixes builds and images. | 2c07e74 | `tests/usage-concurrency.test.ts` fails on the old code. `chat-prestream-neon` is unchanged: 10 sequential round trips and 433 ms to first byte at 25 ms per query, before and after. |
| 6 | Charge before send | A metering failure is logged and the answer still goes out. | e21edcf | Route tests (351 pass) |
| 7 | Long stage timeouts | Disputed-claim web check: 25 s. Each Deep Research search: 60 s. | 6cf44ef | `tests/deep-research.test.ts`: a hanging search no longer holds the report. |
| 9 | Apple dedupe check-then-act; Whop stale takeover unconditional | One claim helper (`src/lib/billing/event-claim.ts`) for both: an atomic claim, release on failure, and a single-winner stale takeover. | 8577a64 | `tests/event-claim.test.ts`: 8 concurrent copies give exactly 1 claim; 6 concurrent stale retries give exactly 1 winner. |
| new | Consensus badge failed axe (`aria-prohibited-attr`, serious) | `role="img"` with its label as the text equivalent; the label now includes "X of Y responded". | bddeb7a | axe clean in light and dark (citation-check e2e) |
| new | No blind preference eval | `bench/pairwise.ts` and `bench/lib/pairwise.ts` (protocol in `bench/pairwise/README.md`):<br>- 37 versioned original tasks in 11 categories, with a dev/test split stratified by category.<br>- The real product pipeline against one model.<br>- Anonymised answers, judged in both orders by a judge from a different family.<br>- Deterministic checks, Wilson and bootstrap intervals, and a sign test. | 572aca7 | `bench/tests/pairwise.test.ts` (8). Mock run end to end. **No live run** (spend is the owner's call). |
| new | Bench self-tests not in CI | CI runs `bench/tests`. | bddeb7a | n/a |

Still open, by design or needing a person:

- **10. Apple purchase binding is first-come.** This is documented.
- **11. Guest daily cap resets with a new cookie.** The IP and pool limits still apply.
- **Extractor failure hides disagreement.** It shows a note instead.
- **The first live pairwise run** needs a key and about $43 at worst for the 26 test tasks.
- **Human raters** are needed to confirm any preference result.

### Final test report (second pass)

| Check | Result |
|---|---|
| `npm test` | 3,135 tests: 3,133 pass, 0 fail, 2 skipped (12 new since the first pass) |
| `bench/tests` | 22 pass (8 new) |
| `tsc --noEmit` (full repo), `eslint . --quiet` (as CI runs it) | Clean |
| Secret scan, security checklist, lockfile check | Pass |
| `e2e/citation-check.e2e.ts` against a production build | 4 of 4 pass |
| Release-gate browser suites (smoke, report-dialog, a11y, typing-hidden, split-view, answer-card) | 11 failures. **The same 11 fail on `origin/main` built in this container.** They are pre-existing or environment-specific, not caused by this branch. |

The 11 failures, all present on `origin/main` too:

- `/enterprise`: the container's proxy refused the localhost connection.
- The phone-drawer focus test.
- Five split-view tests waiting for `[data-split]`.
- The split-view source-check test, which expects a "BETA" label.
- The clarifying-chips answer-card test (the fake model server reported "not connected").
- The card-shadow answer-card test.

None touches code changed here. They should be checked in CI's own environment.
