# Keplar One foundations: audit, backlog, ownership and 12-month roadmap

Date: 19 October 2026. Branch `claude/foundations-economics` from `main@a9e2954`.

This document is the index the executive brief asks for (Phase 14, items 1–10). It does not repeat work other sessions finished or own today. Each claim is marked:

- **Verified**: checked in code or by running something in this session.
- **From audit**: taken from a dated audit in the repository, which says how it was checked.
- **Proposal**: not built.

Nothing here is a traffic, revenue, latency or benchmark figure from production. This environment has no production database, model keys or payment credentials.

## 1. Architecture map (verified against the tree)

| Layer | What runs it | Where |
|---|---|---|
| Web app | Next.js 16 App Router, React 19, TypeScript 6, on Vercel (Node 24) | 143 pages, 292 API route handlers, 2,304 files in `src/` |
| Products in this repo | Keplar One (keplar.one), Keplar Business (business.keplar.one, separate route groups `(business)` and `(business-app)`), Space Studio (being removed, draft PR #43) | `src/app` |
| Answer engine | Classifier, cost-aware router, parallel panel, stance extractor, comparator, cross-family verifier, writer; Keplar Core adds Quick, Thorough and Exhaustive depth | `src/lib/orchestration`, `src/lib/core`; full map in `docs/architecture/BASELINE-ENGINE.md` |
| Modes | Ask, Reason, Deep Research, Debate, Study, Slides, image and video generation, Create | `src/lib/{orchestration,study,slides,images,video,create}` |
| Model providers | OpenRouter, NVIDIA and OpenAI routes; direct Anthropic, Google and xAI providers exist but are never constructed | `src/lib/orchestration/providers` |
| Data | Neon Postgres when `DATABASE_URL` is set; a file store otherwise (production reports unhealthy on it since `18e79de`) | `src/lib/create/platform/store.ts`, `neon.ts` |
| Auth | Better Auth with passkeys and two-factor | `src/lib/accounts` |
| Billing | Whop for consumer plans, Stripe Connect for Business sellers, Apple in-app purchase; webhook claims are atomic (`src/lib/billing/event-claim.ts`) | `src/lib/billing` |
| Jobs | Vercel Cron daily jobs; Inngest optional for Business agents | `vercel.json`, `src/lib/inngest` |
| Observability | Per-call model rows, a text-free flight log, in-house error recorder, admin dashboards (overview, costs, profitability, growth, reliability, SEO, security) | `src/lib/ops`, `src/app/admin` |
| Quality gates | 416 unit test files, 50 Playwright specs, `bench/` (pre-registered accuracy harness and blind pairwise harness), CI release gate | `tests`, `e2e`, `bench`, `.github/workflows/ci.yml` |

**What makes Keplar different (from audit, `BASELINE-ENGINE.md`).** It answers with several models at once, groups their stances, shows where they disagree, has a model from another family review the draft, and writes one answer that keeps the disagreement visible. It does not claim agreement proves correctness. No measured win over a single model exists yet: the recorded live comparison covered 12 items (`docs/core-intelligence-evals.md`), and the pairwise harness has not had a live run.

## 2. Prioritized audit

Sources: `docs/engineering-audit-2026-10-19.md` (security sweep of all route handlers, billing and engine fixes), `docs/architecture/BASELINE-ENGINE.md`, `docs/known-gaps.md`, `docs/seo/AUDIT-2026-10-19.md` on branch `claude/seo-intent-engine`, and this session's measurements.

### P0: security, data loss, billing errors, availability

| # | Finding | Evidence | Owner |
|---|---|---|---|
| P0-1 | Database backups and a restore have never been run against production. Point-in-time restore on the Neon plan is unconfirmed. | From audit: `docs/known-gaps.md` "Reliability"; `scripts/backup-db.mjs` is tested only against a fake database. | Owner (Neon access). Draft PR #91 adds a restore rehearsal. |
| P0-2 | A production deploy does not wait for CI. Vercel builds `main` on merge even when CI fails. | From audit: `ci.yml` header says so; SEO audit TC-01, confirmed by its verifier. | Owner (a Vercel or repository setting: required checks, or deploy from CI). |
| P0-3 | No Critical security finding. All route handlers use the shared auth helpers, admin routes check on the server, cron routes compare secrets in constant time, webhooks verify signatures and dedupe atomically. | From audit: `docs/engineering-audit-2026-10-19.md`, security sweep. | Closed. Remaining Low items are documented there (Apple first-come binding, guest cap reset by new cookie). |

### P1: broken core functionality, severe performance

| # | Finding | Evidence | Owner |
|---|---|---|---|
| P1-1 | Every marketing page downloads about 242–268 KB of gzipped JavaScript and 462–527 KB of raw, render-blocking CSS, the same bundle as the app shell. | **Verified** this session on a production build of `main` (`scripts/perf-budget.mjs`). On `/overview`, react-dom is 71 KB gzip; the largest CSS chunks are the site's own styles merged by the bundler; KaTeX is about 4 KB gzip of one chunk. | This branch adds the budget gate that stops it growing. Splitting CSS by route group is open (it collides with restyle PRs #94 and #98). |
| P1-2 | The chat home at `/` is client-rendered; crawlers see little text. | From audit: SEO audit PR-1, confirmed. | Branch `claude/seo-intent-engine` adds a server-rendered lede and links; a full server-rendered block is an owner design call. |
| P1-3 | Deep Research and the disputed-claim check read no web pages unless `KEPLAR_RETRIEVAL_ENABLED=true`; production has it off. | From audit: `ENGINE-ROADMAP.md` item 4. | Draft PR #89 makes the product say so. Turning retrieval on is a spending decision (owner). |

### P2: product quality, accessibility, usability

| # | Finding | Owner |
|---|---|---|
| P2-1 | `/admin` counted refunded payments as revenue. | **Fixed** on this branch (`src/lib/ops/metrics.ts`, test in `tests/ops.test.ts`). |
| P2-2 | `/admin` computed MRR at the displayed prices ($20, $45, $99); `/admin/growth` at what Whop bills ($19.99, $44.99, $99.99). The two pages disagreed by $0.01 per subscriber. | **Fixed** on this branch: `/admin` uses `BILLED_USD`, as `/admin/growth` and PR #93 do. |
| P2-3 | 77 beta locales publish partly English, self-canonical pages outside hreflang. | Owner decision (SEO audit RI-3, MQ-02). |
| P2-4 | The Whop pixel loads before consent. | Owner and legal decision (SEO audit M-03). |
| P2-5 | Agent mode is a label; it runs no tools. | Waits on `authorize()` (draft PRs #96 and #97). |
| P2-6 | The consumer app includes Create (websites and apps). The brief puts site and app building in Keplar Business only. | Owner decision. Nothing was moved; removing a live paid feature would break current subscribers' expectations. |

### P3: optimization and polish

Font subsets (seven Google Sans subsets declared in the root layout), the release-gate browser suites that fail in containers (`docs/engineering-audit-2026-10-19.md`, 11 failures, same on `main`), the direct providers that are never constructed, BM25-only long context. Each is listed with its owner in `ENGINE-ROADMAP.md` or the SEO audit.

## 3. Who owns what today (open pull requests, checked 19 Oct 2026)

| Area | Pull request |
|---|---|
| Router and classifier lock | #86 |
| Model classifier behind a flag | #87 |
| Release eval on the deterministic bench | #88 |
| Deep Research says when no pages are read | #89 |
| Billing reconciliation, provider failover, incident detection, restore rehearsal | #91 (draft) |
| Growth jobs, churn and revenue retention, Command Center | #93 |
| Design rules: glow and gradient removal; home chips and selects | #94, #98 |
| `authorize()` tool gate and the first chat tool through it | #96, #97 |
| Citation check and Phase 0 audit | #84 |
| Architecture audit (docs) | #82 |
| SEO engine: clusters, free tools, reports, Search Console, SEO gate | branch `claude/seo-intent-engine` (pushed, not opened) |

New work should not start in these areas until the pull request lands or is closed.

## 4. What this branch changes

| Change | Files | Verification |
|---|---|---|
| Per-route performance budget in CI and `npm run verify` | `scripts/perf-budget.mjs`, `perf-budgets.json`, `.github/workflows/ci.yml`, `scripts/verify.mjs`, `tests/perf-budget.test.ts` | Built `main` and measured nine routes; the gate passes at the baseline and fails a route that grows past it (unit test). |
| `/admin` revenue excludes refunds and shows the amount Whop recorded; MRR at the billed price, matching `/admin/growth` | `src/lib/ops/metrics.ts`, `src/app/admin/page.tsx`, `tests/ops.test.ts` | 15 tests pass; typecheck and lint clean. |
| This document | `docs/architecture/FOUNDATIONS-2026-10-19.md` | n/a |

Measured baseline (production build of `main@a9e2954`, gzip level 9, sizes of the files the server-rendered HTML references):

| Route | JS files | JS gzip | CSS gzip | CSS raw |
|---|---|---|---|---|
| `/` | 16 | 246.3 KB | 79.1 KB | 463.7 KB |
| `/overview` | 16 | 242.4 KB | 78.4 KB | 461.8 KB |
| `/pricing` | 17 | 245.7 KB | 87.7 KB | 527.0 KB |
| `/how-it-works` | 16 | 242.4 KB | 78.8 KB | 464.0 KB |
| `/features` | 16 | 242.4 KB | 79.1 KB | 465.7 KB |
| `/blogs` | 16 | 242.4 KB | 87.7 KB | 527.0 KB |
| `/blogs/why-ai-models-disagree` | 17 | 245.6 KB | 87.7 KB | 527.0 KB |
| `/docs` | 18 | 244.6 KB | 87.7 KB | 527.0 KB |
| `/signin` | 18 | 268.3 KB | 80.7 KB | 469.0 KB |

## 5. The ten deliverables

| # | Deliverable | Where | State |
|---|---|---|---|
| 1 | Architecture audit | §1–2 here; `BASELINE-ENGINE.md`; PR #82 | Done (this document indexes and adds measurements) |
| 2 | Priority backlog | §2 here; `ENGINE-ROADMAP.md`; SEO audit Part B "Implementation order" | Done |
| 3 | Implemented improvements | §4 here; `docs/engineering-audit-2026-10-19.md`; SEO branch | Done for this branch |
| 4 | Security assessment | `docs/engineering-audit-2026-10-19.md`, `docs/security.md`, `docs/threat-model.md`, `security/checklist.json` (444 controls) | Done by other sessions; verified the checklist passes here |
| 5 | Performance report | §4 here (before); `docs/perf-progress.md` | Baseline measured. No "after" yet: nothing here reduced bytes |
| 6 | AI evaluation report | `docs/core-intelligence-evals.md`, `bench/README.md`, `bench/pairwise/README.md` | Harnesses exist; live runs wait on owner spend (pilot about $122, pairwise about $43) |
| 7 | Product experience report | `docs/ui-v2.md`, `docs/experience-pass-2026-10.md`; PRs #94 and #98 | Owned by other sessions |
| 8 | Growth infrastructure report | `docs/seo/AUDIT-2026-10-19.md`, `docs/seo/PROGRESS.md` on the SEO branch; PR #93 | Done on branches, not merged |
| 9 | Financial instrumentation plan | §6 here | Plan; partly built |
| 10 | 12-month roadmap | §7 here | Proposal |

## 6. Financial instrumentation plan

What exists (verified in code): MRR and plan mix (`src/lib/ops/metrics.ts`), cash collected, estimated Whop fees, refunds, disputes, cancellations, failed payments, provider spend and contribution (`src/lib/growth/dashboard.ts`), cost and margin by feature, model and plan (`/admin/profitability`), revenue by landing page (SEO branch), churn and gross and net revenue retention from daily snapshots (PR #93).

| Metric | Definition used | Status |
|---|---|---|
| MRR, ARR | Active, unexpired subscriptions × billed monthly price; ARR = 12 × MRR | MRR built, one figure across admin pages (P2-2 fixed); ARR is arithmetic on it. |
| Revenue per subscriber | Cash collected in the window ÷ paying customers at window end | Inputs exist; not displayed |
| AI inference cost per user | `compute_ledger` USD by workspace | Built (`/admin/profitability`) |
| Gross margin | (cash − refunds − payment fees − provider spend) ÷ cash. Hosting, database and email are excluded until billed costs are recorded | Contribution built; the ratio is not displayed |
| Contribution margin by plan | The same, grouped by plan | Cost by plan exists; revenue by plan needs the payment `plan` field, which is stored |
| Subscriber churn, NRR | From daily snapshots of billed state | PR #93 |
| Refund rate | Refunded payments ÷ payments in the window | Inputs exist (this branch counts refunds on `/admin`) |
| CAC | Marketing spend ÷ new paying customers | Undefined: no marketing spend is recorded. The growth dashboard says so |
| LTV | Revenue per subscriber × gross margin ÷ monthly churn | Not computable until churn has at least three months of snapshots. Do not show an estimate before then |

History before each table existed is not recoverable and must be shown as "no data", never back-filled.

## 7. Twelve-month roadmap (proposal)

Each row gives customer value, effort (S under a day, M one to three days, L longer), dependencies, risk, success metric, validation and rollback.

### Horizon 1: first 30 days (stabilize, instrument)

| Initiative | Value | Effort | Depends on | Risk | Success metric | Validation | Rollback |
|---|---|---|---|---|---|---|---|
| Require CI before production deploy (P0-2) | No broken build reaches users | S | Owner: Vercel or branch setting | A red flaky test blocks a hotfix | 0 deploys of a commit with failing CI | Vercel deployment list against CI runs for 30 days | Turn the requirement off |
| Run a backup and a restore drill (P0-1) | Data loss becomes recoverable | M | Owner: Neon credentials; PR #91 | Restore into the wrong branch | A restored branch passes the health check; time to restore recorded | The drill log | n/a (read-only on production) |
| Merge the open engine and reliability PRs in order (#86, #88, #89, #91) | Locked routing, release eval, honest research state, reconciliation | M | Reviews | Conflicts between parallel branches | All merged with CI green | CI and the release gate | `vercel promote` the previous deployment |
| Error tracking and uptime alerts | Incidents are seen before users report them | S | Owner: `SENTRY_DSN`, an uptime monitor | Alert noise | Every 5xx spike pages a person within 5 minutes | A staged fault in preview | Remove the DSN |
| Performance budgets enforced (this branch) | Pages stop getting heavier unnoticed | Done | Merge | False failure from chunk hashing | No budget raise without a written reason | CI | Delete the CI step |

### Horizon 2: days 31–90 (differentiate, convert)

| Initiative | Value | Effort | Depends on | Risk | Success metric | Validation | Rollback |
|---|---|---|---|---|---|---|---|
| First live pairwise and accuracy runs | Evidence of where multi-model beats one model, or does not | M | Owner spend (~$43 and ~$122) | A negative result | Published report with intervals, whatever the result | `bench/` pre-registered protocol | Do not publish claims the run does not support |
| Split CSS and JS by route group (P1-1) | Faster first paint on marketing pages | L | Restyle PRs #94 and #98 land | Visual regressions | Marketing pages under 150 KB raw CSS and 150 KB gzip JS | Budget gate, screenshot diff, Lighthouse on mobile | Revert the PR |
| Turn retrieval on for paid Deep Research | Research answers cite pages actually read | M | Owner spend decision; PR #89 | Search fees per question | Share of Deep Research answers with at least one supported citation | Citation check counts (PR #84) | `KEPLAR_RETRIEVAL_ENABLED` off |
| Activation instrumentation end to end | Time to first value measured | S | SEO branch merged | Consent limits coverage | Median time from landing to first answer, by source | `/admin/growth` funnel | n/a |
| Financial dashboard: margin, refund rate, revenue per subscriber, contribution by plan (§6) | Pricing decisions on real numbers | M | PR #93 | Mixing list and billed prices | Each figure has one definition, used on every admin page | Unit tests on the pure aggregations | Hide the section |

### Horizon 3: months 4–6 (scale what works)

| Initiative | Value | Effort | Depends on | Risk | Success metric | Validation | Rollback |
|---|---|---|---|---|---|---|---|
| Scale the acquisition channel that converts | Paying users at sustainable CAC | M | Six weeks of Search Console and attribution data | Optimizing for traffic, not revenue | Paid conversions by landing page rising month over month | `/admin/seo` paid-by-landing table | Stop the channel |
| Model classifier on for paid plans | Better routing at small cost | S | PR #87; router lock #86 | One extra call per question | Route accuracy on the golden set up; cost per answer within budget | Route golden test; cost dashboard | Flag off |
| Shared rate limits (Upstash) and per-region latency checks | Fair limits across instances | S | Owner: Upstash keys | New vendor | Zero over-limit requests across instances in load test | `tests/usage-concurrency.test.ts` style load test | Unset the keys |
| Blind human ratings on a sample | Confirms or rejects model-judge results | M | Pairwise runs | Rater bias | Agreement between human and judge preferences | Rater protocol in `bench/pairwise/README.md` | n/a |

### Horizon 4: months 7–12 (defensibility, international)

| Initiative | Value | Effort | Depends on | Risk | Success metric | Validation | Rollback |
|---|---|---|---|---|---|---|---|
| Complete translations for stable locales; decide beta locales | International search without duplicate pages | L | Owner decision P2-3 | Index loss for beta pages | Localized pages indexed per Search Console | Search Console coverage by locale | Revert to English canonical |
| Regional pricing and tax review | Paying users outside the US | L | Legal and Whop support per country | Compliance | Checkout success by country | Whop reports | Disable a country |
| Published evaluations each quarter | Credible, citable evidence | M | Horizon 2 runs | A worse result than a competitor | Quarterly report with method and data | `content/reports` tests (SEO branch) | n/a |
| Decide where Create lives (P2-6) | A cleaner consumer product, a clearer Business offer | M | Owner decision | Subscriber disruption | Churn of Create users unchanged after the move | Snapshot churn (PR #93) | Keep Create in both |

A billion-dollar valuation is not assumed by any row. The rows target the inputs: revenue growth, retention, margins, reliability and trust.

## 8. Progress log

- 2026-10-19: branch created from `main@a9e2954`. Built `main`, measured the baseline, added the budget gate, fixed refunded payments and the MRR price on `/admin`, wrote this document.
- Full gate on the branch: typecheck and lint clean; unit tests 3,147 pass, 1 fail, 2 skipped of 3,150; `next build` ok; budget gate passes on all nine routes; secret scan and security checklist pass.
- The one failure is `tests/answer-recovery.test.ts` "Stop works even when the server never hears about the disconnect". It passed 3 of 3 runs alone. It reads a turn's status right after the stream drains with a 700 ms stub delay, so it is timing-sensitive under full-suite load. This branch changes neither the test nor the chat route. Not fixed here.
