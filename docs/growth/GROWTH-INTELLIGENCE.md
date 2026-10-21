# Keplar Growth Intelligence: architecture, status and runbook

Written Oct 19, 2026. The code is in `src/lib/growth/ops/`; the dashboard is `/admin/command` (Keplar Command Center); the jobs run from `/api/cron/growth`.

Each section separates **Implemented** (code that exists and is tested) from **Proposed / blocked** (not built, or built but waiting on a credential, a budget or a person). Nothing in this document is a measured result unless it says where it was measured.

## 1. Architecture

```
Vercel Cron (daily 08:19 UTC) ──> /api/cron/growth ──> runner.ts ──> jobs.ts
                                        │                 │           ├─ revenue-snapshot (daily)  ─> growth_sub_daily
                                   CRON_SECRET            │           ├─ seo-audit (daily)          ─> growth_job_runs.data
                                                          │           ├─ usage-retention (weekly)   ─> growth_job_runs.data
                                                          │           ├─ page-watch (weekly)        ─> growth_watch_pages
                                                          │           ├─ ai-visibility (weekly)     ─> growth_geo_results   (budget-gated)
                                                          │           ├─ weekly-report (weekly)     ─> growth_reports
                                                          │           └─ monthly-report (monthly)   ─> growth_reports
                                                          └─ claim (growth_job_runs), pause (growth_controls), global stop (ops_controls),
                                                             timeout, one retry, run log, alertOwner on failure
GitHub Actions (Mondays 09:33 UTC) ─> bench-weekly.yml ─> bench/pairwise.ts ─> artifact ─> bench/regress.ts ─> issue on regression
                                                                                                                (key + cap required)
/admin/command  <── reads all of the above, plus growth/dashboard.ts (seo_events, growth_events, whop_payments, billing_events, compute_ledger)
/api/admin/growth-ops  ── run / pause / resume, content workflow, submission records, "change reviewed"   (admin only, audited)
```

**Data sources the system reads:**

- `accounts_workspaces` (billing state)
- `growth_events` and `seo_events` (first-party, consenting browsers only)
- `whop_payments`, `billing_events` and `compute_ledger`
- keplar.one's own public pages
- public official pages of competitors and ranking platforms
- an answer-engine API (only when a budget is set)

**Dependencies:**

- Vercel Cron, with `CRON_SECRET` set in production.
- The Neon store, with `DATABASE_URL` set.
- `OPENROUTER_API_KEY`, already used by the product, for AI visibility.
- GitHub Actions for benchmarks.
- `alertOwner` for failure alerts (Resend, or `KEPLAR_ALERT_WEBHOOK_URL`).

**Guarantees, tested in `tests/growth-ops.test.ts` and `tests/growth-ops-routes.test.ts`:**

- A job runs once per period, even when called in parallel.
- A paused job, the global stop, or a missing key or budget leads to a logged skip, never a run.
- A thrown error is retried once. A second failure is logged, alerts the owner and frees the period for a later retry.
- A timeout aborts the job.
- The admin API returns 404 to non-admins.
- The cron returns 401 without the secret.

## 2. Leaderboard eligibility report

**Implemented:**

- The registry `src/lib/growth/ops/data/leaderboards.v1.json`: 15 platforms, each with its sources.
- A planner (`planFor`) that sorts each platform into one of three routes: not applicable, automatic, or a task for the owner. Each plan lists its blockers.
- A weekly re-read of each platform's home and submission pages, flagging changes.

**Evidence level:** the 2026-10-19 research could not open the platforms' pages from the research environment. Every fact comes from web-search results that quote the cited URL, and the registry marks them `search-snippet`. A value nobody could confirm is `null` ("Unknown").

| Route | Platforms (as of v1) |
|---|---|
| Not applicable (they rank models, and Keplar doesn't train one) | Artificial Analysis, Arena (formerly LMArena), Hugging Face Open LLM Leaderboard |
| Automatic (ranked by measured traffic) | Similarweb. The a16z Top 100 Gen AI consumer apps list is traffic-based too, so not realistic near-term. |
| Free submission, needs a person | Product Hunt, G2 (AI chatbots), Capterra, AlternativeTo, SaaSHub, Future Tools |
| Paid listing (needs owner approval of the fee) | Futurepedia, There's An AI For That, Toolify, TopAI.tools |

**Proposed:** a person confirms each fact on the platform's own page and moves its evidence to "page-read". This takes a few minutes per platform, and the registry is versioned for it.

## 3. Submission tracker

**Implemented:**

- `growth_submissions` keeps one row per platform.
- The allowed moves are: not started → submitted → listed or rejected (a rejection needs a reason), and declined.
- Being listed needs the live listing URL.
- A platform can't be submitted twice, and model-only boards are refused.

**Current state:** no submission has been made or recorded. Every platform is "not started".

**Blocked by design:** all of these need a person:

- accounts;
- CAPTCHAs;
- payments;
- editorial review.

None offers an API to submit a listing (Product Hunt's API reads data; it doesn't post launches). The tracker creates the task; the owner does the submission and records it.

## 4. AI visibility report

**Implemented:**

- 15 versioned prompts (`geo-prompts.v1`), asked once a week through Perplexity's Sonar via OpenRouter. The calls go through the cost meter.
- The answers record Keplar mentions, keplar.one citations (with the URL) and competitors.
- Results are labelled API results, which can differ from the consumer apps.

**Status:** off. It needs `KEPLAR_GEO_WEEKLY_USD` above 0, at about $0.01 a question, so about $0.15 a week. **No visibility has been measured yet**, and the dashboard says "Unavailable".

**Not built:** measuring consumer apps (ChatGPT, Gemini, Perplexity web). There is no authorized interface for that, so it would mean automating their apps, which their terms don't allow.

## 5. Competitive intelligence report

**Implemented:** a weekly read of official pricing, release-notes, blog and status pages for ChatGPT, Claude, Gemini, Grok, Perplexity, Poe, DeepSeek, Copilot and Mistral:

- one GET per page per week;
- robots.txt respected;
- no login;
- hashes that ignore dates.

A changed page appears in the Command Center and the weekly report as "changed since date: review". The system records *that* a page changed (a fact). What the change means is for a reviewer to write.

**Status:** the first run is on the next Monday after deploy. No report exists yet.

## 6. Benchmark report

**Implemented:**

- Blind pairwise evaluation (`bench/pairwise.ts`, 37 versioned tasks, a stratified dev/test split, both orders judged, Wilson and bootstrap intervals, sign test).
- The accuracy harness (`bench/run.ts`).
- A weekly GitHub Actions run with a hard dollar cap.
- A regression check (`bench/regress.ts`) that opens an issue. Production routing is never changed by it.

**Status:** no live run has been made. It needs the `OPENROUTER_API_KEY_BENCH` secret and the `BENCH_WEEKLY_MAX_USD` variable in GitHub. The worst case is about $43 a run on the 26 test tasks. Results are internal tests, never "independently validated".

## 7. SEO report

**Implemented:** a daily audit of keplar.one's own pages:

- 40 sitemap URLs a day, rotating, so every URL is covered within a few days;
- the sitemap index and the extra sitemaps;
- robots.txt against the sitemap;
- status codes and redirect chains;
- title, description, canonical and noindex;
- JSON-LD that doesn't parse;
- H1 count and duplicate titles.

It reports issues and changes nothing. A fix goes through a pull request.

**Status:** the first run is after deploy.

**Blocked:** Google Search Console data (impressions, positions, crawl errors) needs a Search Console API credential. Only site verification is configured. Core Web Vitals come from Vercel Speed Insights, which is already installed; they aren't pulled into the Command Center.

## 8. Acquisition report

**Implemented (existing, now on the Command Center):**

- the funnel from qualified visit to activation;
- visits by source (search, AI answer engines, social, direct);
- top landing pages, from `seo_events` and `growth_events` (consenting browsers).

**Not measured:** CAC (no marketing spend is recorded), per-UTM conversion, and paid channels.

## 9. Retention report

**Implemented:**

- Weekly DAU/WAU/MAU and weekly cohorts by first question, from consenting browsers only. These are a floor.
- Paid retention (customer churn, GRR, NRR, upgrades, downgrades) from daily subscription snapshots.

**Status:** the first cohort run is next Monday. Churn and NRR need two snapshots 30 days apart, so the first values appear about 30 days after deploy.

## 10. Financial report

**Implemented:**

- MRR at the billed price, ARR (MRR × 12), GRR, NRR and churn, from snapshots.
- Cash collected, refunds, disputes and contribution after provider cost (existing).
- An MRR trend line.

All of it is labelled recorded billing state, not accounting data: no taxes, and fees are estimated.

**Not computed:** LTV (needs 3+ months of churn data) and CAC (no marketing spend recorded). Prices are never changed by any of this.

## 11. Automation report

**Implemented:** these schedules are configured:

- `vercel.json`: `/api/cron/growth` at 19 8 * * *
- `.github/workflows/bench-weekly.yml`: 33 9 * * 1

The other controls:

- **Run log:** `growth_job_runs`.
- **Controls:** pause all, pause per job, run now, all audited in `admin_audit`.
- **Heartbeat:** `_cron_beats` (`growth`) is shown on `/status` with the other crons.

**Not yet verified:** a production run. The cron only fires after this is deployed, and needs `CRON_SECRET`, which the other crons already use.

## 12. Security and QA report

- **Authorization:** the page and the API return 404 to non-admins (tested). The cron returns 401 without the secret (tested). Every action is audited.
- **Data:**
  - The subscription snapshots store accounts under a keyed hash (HMAC with the server secret), never ids or emails.
  - Usage data has no account link.
  - The new collections are classified as retained system data (`tests/privacy.test.ts`).
- **Spending:**
  - The only job that spends money is budget-gated, reserves the worst case before each call, and goes through the cost meter (`tests/cost-meter-coverage.test.ts`).
  - The benchmark has a hard cap.
- **External sites:**
  - One request per page per week.
  - robots.txt is respected.
  - No login, CAPTCHA, paywall or rate-limit bypass.
- **Tests:**
  - `tests/growth-ops.test.ts`: 20 tests.
  - `tests/growth-ops-routes.test.ts`: 2 tests.
  - `bench/tests`: 23 tests.
  - `e2e/command-center.e2e.ts`: admin-only access, every section, "Unavailable" for missing data, no sideways scroll at 390 px, and axe in light and dark.

## 13. Deployment readiness

- **Production configuration already in place:** `CRON_SECRET`, `DATABASE_URL`, `OPENROUTER_API_KEY` and `BETTER_AUTH_SECRET`.
- **To enable later (owner decisions):**
  - `KEPLAR_GEO_WEEKLY_USD`: for example `0.5`, for AI visibility.
  - The GitHub secret `OPENROUTER_API_KEY_BENCH` and the variable `BENCH_WEEKLY_MAX_USD`: for example `50`, for weekly benchmarks.
  - A Search Console API credential, if Search Console data is wanted.
- **Rollback:**
  - Pause from the Command Center (all jobs or one). This is instant and needs no deploy.
  - Or remove the cron entry and redeploy.
  - Or `vercel promote` the previous deployment.
  - Jobs write only to their own `growth_*` collections, so turning them off affects nothing customers see.

## 14. 90-day roadmap (proposed, in priority order)

1. **Weeks 1–2:**
   - Confirm the registry facts on each platform's own page.
   - Submit to the free directories (Product Hunt launch plan, G2, SaaSHub, AlternativeTo, Capterra), recording each in the tracker.
   - Set a small visibility budget to get a baseline.
2. **Weeks 2–4:**
   - Fix the SEO audit's errors through pull requests.
   - Connect Search Console (read-only API) and show impressions and positions next to the audit.
3. **Month 2:**
   - First live pairwise benchmark on the test split, with the owner approving the spend.
   - Publish the methodology and the results with their intervals, through the content queue: sourced claims and a second reviewer.
4. **Month 2:**
   - Per-UTM conversion and an activation experiment on first-prompt suggestions, using the existing experiment framework. Pre-register the guardrails.
5. **Month 3:**
   - LTV once there are three months of churn data.
   - A review of which channels bring retained (not just new) users, and a decision on any paid spend (owner).
