# Cost monitoring and profitability guardrails

Owner rule: every feature should be the best version we can ship, and **no feature may run at a loss**. This page covers
how provider spend is measured, compared with revenue, and capped. Code: `src/lib/cost/*`. Dashboard: `/admin/profitability` (admins only).

## 1. The cost meter (every provider call)

- **Where:** `src/instrumentation.ts` → `installCostMeter()` (`src/lib/cost/meter.ts`) wraps the global `fetch` once per Node
  instance. Every call to a metered host goes through it: `openrouter.ai`, `api.openai.com`, `api.anthropic.com`,
  `generativelanguage.googleapis.com`, `api.x.ai`, `integrate.api.nvidia.com`, `api.higgsfield.ai`, plus any custom base in
  `OPENROUTER_BASE_URL` / `KEPLAR_OPENROUTER_BASE` / `LITELLM_BASE_URL`. Metadata calls (model lists, `/credits`, `/key`, polls) are not counted.
- **What each call records** (`cost_events` rows in Neon `keplar_rows`):
  - feature, user (workspace) id, plan
  - provider, endpoint, and the model actually used (and the requested model when it was degraded)
  - tokens in and out
  - **actual USD**, plus a `costSource` label for where the number came from (see the list after this one)
  - latency, HTTP status, and blocked/degraded flags
- **Where the USD comes from**, in order of preference:
  1. OpenRouter's `usage.cost`, reported per call (in JSON responses and in the final SSE chunk). Labelled `provider`.
  2. Otherwise, tokens × the price table (the live roster list prices plus static prices). Labelled `tokens`.
  3. For images, video, audio and Higgsfield, the unit price × count or seconds. Labelled `unit_price`.
  4. `:free` models record $0. Labelled `free`.
  5. A model we don't recognise is priced high ($3/$15 per 1M tokens), never as free.
- **Streams are not changed.** SSE bytes pass straight through to the caller. A scanner reads the usage chunk on the way past. JSON bodies are cloned for parsing.
- **Attribution.** The first match below wins:
  1. an explicit `withCostTag()` / `tagCostFeature()`
  2. the `/api/keplar` cost scope (`featureForAsk`: deep-research, debate, core-reasoning, create, agents, multimodal or ask)
  3. the route of the current request, bound in `currentWorkspace()` (`ROUTE_FEATURES` in `src/lib/cost/features.ts`)

  Inside a request with no match, the call is recorded as `untagged`. Background work is recorded as `system`. The dashboard
  flags a high untagged share.
- **Batched writes.** Rows are buffered and written as multi-row INSERTs after the response is sent (`after()`), or on a short
  timer. Each write also updates two rollups: `cost_user_day` (feeds the quotas) and `cost_feature_day`. If the write fails,
  the rows go back into the buffer (bounded at 2,000). Without `DATABASE_URL`, the file store is used. The meter never fails a request.
- **Lint.** `tests/cost-meter-coverage.test.ts` fails when:
  - an AI-provider API host appears in `src/` but is not in `METERED_HOSTS`
  - a file that talks to a provider uses `node:http(s)`, `undici`, `axios`, `got` or a provider SDK instead of fetch
  - anything other than the meter touches the saved unmetered fetch
  - instrumentation stops installing the meter
- **Off switch:** `KEPLAR_COST_METER=0` (emergency only).

## 2. Revenue and margin

- **Revenue per user** (`src/lib/cost/revenue.ts`): each active paid workspace counts as its plan's monthly price (Plus $45,
  Pro $99, Lite from `PAID_PLANS`), prorated to the window. When `STRIPE_SECRET_KEY` is set and `revenue.useStripe` is on, the
  actual Stripe amount for the matching email replaces the list price. Note: Keplar plans are billed through Whop today, so
  most rows use the plan price.
- **Revenue per feature:** credits charged on the feature (from the usage ledger, tagged with the feature) × the plan's revenue
  per credit (Plus $45 / 6,000 = $0.0075; Pro $99 / 13,500 ≈ $0.00733). Overhead features (chat titles, memory) roll into
  their parent's cost (Ask), so a cheap helper never shows as a "loss" by itself.
- **Margin** = revenue − provider cost. This is shown per feature, per plan and per user.

## 3. Dashboard: `/admin/profitability`

Admin only (404 otherwise). Dark, Google Sans, flat graphite. Window: `?days=7|30|90`. It shows:

- **Banners:**
  - OpenRouter balance exhausted or low
  - no balance reading
  - throttled features
  - killed features
  - truncated data
- **Totals:** cost, revenue, margin, calls, blocked/degraded calls, and the estimated-cost share.
- **Breakdowns:**
  - cost by day
  - margin by feature
  - cost vs revenue by plan
  - anomalies
  - top-cost users (cost, revenue, margin, top feature)
  - models (calls, errors, tokens, p50/p95 latency)
- **Controls:**
  - flags
  - kill switches
  - margin multiplier
  - low-balance rule
  - throttle or lift a feature
  - clear "balance exhausted"
  - run the watch now
- **Reference:** the estimate table (below) and the effective config.

## 4. Guardrails (all config-driven)

Config sources, in order of precedence (`src/lib/cost/config.ts`):

1. the dashboard (store row `cost_config/config`, audited)
2. the env var `KEPLAR_COST_CONFIG` (JSON)
3. `KEPLAR_FEATURE_OFF=a,b` and `KEPLAR_FLAG_*`
4. the code defaults

The config is cached for 30 seconds per instance.

Checks at the provider boundary (`decide()` in `src/lib/cost/guard.ts`), in order:

1. **Kill switch** per feature → 503, "switched off … Nothing was charged".
2. **Free = free models only.** Paid models are refused for Free users with 403, and nothing is sent. This applies only when
   the call is visibly paid; an unreadable body is metered, never refused.
3. **Throttle** (from the negative-margin watch or set by hand): paid chat is rewritten to a `:free` model. Other paid work is refused (503).
4. **Balance exhausted:** paid OpenRouter chat is rewritten to the free fallback model. Paid image and video requests are
   refused with "Nothing was charged; free models keep working."
5. **Quotas** per plan and per feature, per UTC day:
   - Free: calls per day (`*` 600, Deep Research 60, video 0, …)
   - Paid plans: provider USD per day (Plus `*` $4, images $2, Deep Research $3.50, Create $3; Pro `*` $8, images $4, video $6, …)
   - Credits are still charged as before, by estimate × `METER_MARGIN` (1.1), multiplied by the configurable
     `pricing.marginMultiplier` and `pricing.featureMultiplier[feature]` (default 1).
6. **Free daily heavy limits.** Flag, off by default; see §6.

The same checks also run at route level (`assertCostGuard` in `assertCanSpend` / `enterUsage`), so users get an honest message
before any work starts. Admins skip quotas and Free-model checks, but not kill switches.

**Negative-margin check** (`src/lib/cost/watch.ts`). Runs hourly from traffic and daily from cron:

- Computes per-feature margin over `margin.windowDays` (default 7).
- A feature whose margin is below `targetMarginPct` (default 0%) with cost ≥ `minCostUsd` ($5) is flagged.
- The owner gets an email (once per anomaly per day).
- When `flags.autoThrottle` is on, the feature is throttled for `throttleHours` (24h) with `throttleAction` (default
  `free_models`), and an audit row is written.

**Cost anomaly alerts:**

- A feature's spend today is > `anomaly.factor` (3×) its trailing 7-day average and ≥ $2.
- One account spends ≥ $5 in a day.
- A Free user incurs paid cost.
- Untagged cost is > 20% of total.
- More than 50% of cost is price-table estimated.

## 5. OpenRouter low balance

- **Checks:**
  - Daily Vercel Cron at `/api/cron/cost-guard`, 13:30 UTC. The project is on the Hobby plan, so crons can run at most once a day.
  - Every 10 minutes from live traffic, behind a store lease.
  - On demand from the dashboard and `/api/ops/openrouter-balance`.
- **Rule** (`lowBalance` in the config):
  - Low = remaining ≤ `percent` (default **1%**) of the **last top-up** (`basis: "last_topup"`), or of the purchased total (`basis: "total"`).
  - Low also when remaining ≤ `floorUsd`.
  - A top-up is detected as a rise in `total_credits` between readings. The first reading uses the total.
- **Alert:**
  - One email per low episode, via Resend, to `KEPLAR_OWNER_EMAIL`, else `ADMIN_EMAIL`, else team@keplar.one.
  - A dashboard banner.
  - The episode re-arms after a top-up.
- **Exhausted** (remaining ≤ 0, or any OpenRouter 402):
  - `cost_state/balance.exhausted` is set.
  - Paid chat continues on the free fallback models (`degrade.freeFallbackModels`). Paid media is refused with an honest message.
  - A 402 mid-request is retried once on the free model, so the user still gets an answer.
  - Cleared automatically by the next healthy reading, or by hand from the dashboard.
- **Days of runway** (added from financial-model-100k.md). At scale, 1% of lifetime credits is only about 3.4 hours of
  spend, so the 1% alert stays as a last-resort page and a runway alert comes first.
  - Runway = remaining ÷ trailing-24h spend. The spend is the rise in OpenRouter's own `total_usage` across stored readings
    (up to 48h of history, one sample every 20 minutes or more). It is extrapolated from at least 1h of readings until a
    full 24h exists, and shows "needs readings" before that.
  - **Warning at 7 days, critical at 2 days** (`lowBalance.runwayWarnDays` / `runwayCriticalDays`, editable on the dashboard).
  - One email each time the level worsens, deduped per level per UTC day. It re-arms when runway recovers.
  - The dashboard shows a runway stat and warning/critical banners.
- **Key note:** `/api/v1/credits` needs an OpenRouter **management key**. Without `OPENROUTER_MANAGEMENT_KEY`, the check falls
  back to the API key's own credit limit (`/api/v1/key`), when the key has one.

## 5a. Global daily spend cap (`KEPLAR_GLOBAL_DAILY_USD_CAP`)

- **Live value: $25 per day** (the default in `src/lib/create/platform/spend.ts`). It is **not changed** by this work; raising
  it is the owner's decision.
- **What happens as spend rises** (existing breaker, `breaker.ts`):
  - from 70% of the cap, new Create jobs use cheaper models
  - from 85%, paid images and video pause
  - at 100%, Free pauses until 00:00 UTC
- **New: scale-aware warning** (`src/lib/cost/global-cap.ts`, run by the cost watch every 10 minutes):
  - The owner gets an email once per UTC day when today's spend reaches **80% of the cap** (`globalCap.alertPct`), and again if it hits 100%.
  - The dashboard shows today's spend as a % of the cap, plus a suggested cap = **1.5× the busiest of the last 7 days**
    (`globalCap.recommendFactor`), with a banner when the live cap is below the suggestion.
- **This cap must be raised as usage grows.** The financial model puts Base-scale variable cost near $3.6k per day, so a cap of
  about $5.4k per day. At $25, the breaker would stop paid media and Free within the first hour at that scale. Raise it in
  Vercel env (`KEPLAR_GLOBAL_DAILY_USD_CAP`), then redeploy.

## 6. Pricing flags (owner approval pending: default OFF in production)

| Flag | Env override | Default |
|---|---|---|
| `freeDailyLimits` | `KEPLAR_FLAG_FREE_DAILY_LIMITS=1` | off |
| `overage` | `KEPLAR_FLAG_OVERAGE=1` | off |
| `enforceQuotas` | `KEPLAR_FLAG_ENFORCE_QUOTAS=0` to disable | on |
| `freeModelsOnly` | `KEPLAR_FLAG_FREE_MODELS_ONLY=0` | on |
| `autoThrottle` | `KEPLAR_FLAG_AUTO_THROTTLE=0` | on |
| `degradeOnLowBalance` | `KEPLAR_FLAG_DEGRADE_ON_LOW_BALANCE=0` | on |

You can also toggle all of them on the dashboard.

### 6.1 Free daily question limit

- **What exists today:** the Free plan already has a limit of **50 questions per day**, reset at **00:00 UTC**
  (`src/lib/usage/daily.ts`, `claimDaily`). It is keyed per account, plus a signed per-browser device id and an IP ceiling for
  anonymous use. The landing-page demo is limited separately (`src/lib/demo-limits.ts`, 5 per day per device/IP).
  With the flag off, all of this stays exactly as it is.
- **What the flag adds:**
  - **A configurable daily question cap:** `freeDaily.questions` = **25 per day signed in**, and `freeDaily.anonQuestions` =
    **5 per day anonymous** (per signed device id, with the IP ceiling still applied). These are the business plan's §8
    recommendation. While the flag is off, the live coded limit (`limitsFor("free").dailyRequests`, 50 per day) is used
    unchanged (`freeQuestionLimit()` in `src/lib/cost/hooks.ts`, wired into `/api/keplar` and `/api/compute`). Change the
    caps on the dashboard or in `KEPLAR_COST_CONFIG`, e.g. `{"freeDaily":{"questions":25,"anonQuestions":5}}`.
  - **Small daily caps on heavy features for Free** (`freeDaily.heavy`):

  | Feature | Free runs per day |
  |---|---|
  | Deep Research | 1 |
  | Debate | 3 |
  | Slides | 2 |
  | Study | 5 |
  | Create | 3 |
  | Images | 3 |
  | Multimodal | 5 |
  | Transcribe | 5 |
  | Agents | 2 |
  | Core reasoning | 3 |

  - A "run" is the first provider call of a request for that feature, so a multi-call run is never cut off halfway.
  - The friendly UI shows what's left and links to the upgrade page: `/account/usage` (`FreeAllowance`), API `/api/usage/allowance`.
- **Reset:** **00:00 UTC** (calendar day). We chose this over a rolling 24 hours to match the existing 50-per-day limit and the
  quota rollups, and so one reset time is shown everywhere.

### 6.2 Usage-based overage for Plus and Pro

- **Covered features:** heavy Create builds, voice-create, transcribe, images, video, Deep Research and API
  (`overage.features`).
- **How it works:**
  - The user opts in at `/account/usage` (`OverageSettings`, API `/api/billing/overage`) and sets a monthly cap: default $20,
    admin maximum $500.
  - When the monthly credits are used up, or a USD daily quota would block, an opted-in user continues instead of being stopped.
  - **Price:**
    - Credit-metered overage is billed at **$7.50 per 1,000 credits** (`overage.creditPack`), the same rate as Plus, so it
      doesn't undercut the plan.
    - It is **never below provider cost × 4.0** (`overage.multiplier`, the floor).
    - When there is no credit count (a daily USD cap was hit), the price is cost × 4.0.
    - At the 1.1 meter margin, a credit stands for $0.00182 of provider cost, so $7.50 per 1,000 is about 4.1× cost.
    - The business plan (§8) requires at least 70% margin. The earlier 1.5× default gave only about 33% and was replaced.
  - **Candidate price list** (`overage.priceList`, from financial-model-100k.md §6, about 3.8–4.0× provider cost, each at least
    70% margin after OpenRouter and payment fees). Users see it in the overage card; it is owner-pending:

    | Unit | Provider cost | Overage price |
    |---|---:|---:|
    | 1,000 credits (top-up pack) | $1.82 | $7.50 |
    | Deep Research run | $2.18 | $9.00 |
    | Image, High | $0.052 | $0.20 |
    | Image, Standard | $0.015 | $0.06 |
    | Video, per second | $0.092 | $0.35 |
    | Voice, per minute | $0.026 | $0.10 |
    | Create build, Plus model | $0.157 | $0.65 |
    | Create build, Pro model | $0.351 | $1.45 |
    | Sandbox, extra minute | $0.0027 | $0.02 |
    | Hosting bandwidth, per GB | $0.15 | $0.60 |
    | API: consensus answer | $0.039 | $0.16 |
    | API: single-model answer | $0.0044 | $0.02 |

    Billing today uses the credit rate plus the 4× floor. Every unit in this list is credit-metered at about the same rate,
    so the list documents the resulting prices. It is not a second meter.
  - Alerts are emailed at **50%, 80% and 100%** of the cap (`overage.alertPcts`), once each per month.
  - The period is the UTC calendar month.
- **Recording:** usage is recorded in `overage_usage`. When `KEPLAR_STRIPE_OVERAGE_METER` is set and the workspace has a
  `stripeCustomerId`, `reportOverageToStripe()` sends Billing Meter events (`billing.meterEvents.create`, with an idempotent
  `identifier`).

**Stripe objects to create once the numbers are approved.** None have been created; no live prices were touched.

1. **Billing Meter**
   - `display_name: "Keplar overage"`
   - `event_name: "keplar_overage"` (= `overage.stripe.meterEventName`)
   - `default_aggregation.formula: "sum"`
   - `customer_mapping: { type: "by_id", event_payload_key: "stripe_customer_id" }`
   - `value_settings.event_payload_key: "value"`. Each value is in **cents** of overage.
2. **Product**: "Keplar usage (overage)".
3. **Price**:
   - `currency: usd`, `unit_amount: 1` (one cent per unit)
   - `recurring: { interval: "month", usage_type: "metered", meter: <meter id> }`
   - `lookup_key: "keplar_overage_usage"` (= `overage.stripe.priceLookupKey`)
   - `tax_behavior` per Stripe Tax
4. **Attaching it to customers.** Plans are billed through Whop today, so a Stripe customer with a saved payment method is
   needed for each opted-in user. Options:
   - a Checkout Session in `mode: "setup"` when they opt in, then a subscription with the metered price
   - or move Plus/Pro subscriptions to Stripe Billing and add the metered price as a second item

   Store the customer id in `overage_settings.stripeCustomerId`.
5. **Webhooks:** handle `invoice.paid`, `invoice.payment_failed` (turn overage off on failure) and
   `customer.subscription.deleted`, plus `v1.billing.meter.error_report_triggered` for rejected meter events.
6. **Env:** set `KEPLAR_STRIPE_OVERAGE_METER=keplar_overage`. Use a **restricted key** with Billing Meter Events (write),
   Customers and Subscriptions. Use API version `2026-09-30.endive` for new billing code.
7. **Note:** Stripe now recommends **Metronome** for new usage-based billing. Billing Meters remain supported and fit this
   simple sum-of-cents model. Enable **Stripe Tax** on the price if overage is taxable in our markets.

**To turn overage on:**

1. The owner approves the multiplier, caps and features.
2. Create the objects above in test mode, then live.
3. Set `KEPLAR_STRIPE_OVERAGE_METER`.
4. Wire the setup-mode Checkout.
5. Set `KEPLAR_FLAG_OVERAGE=1`, or flip the flag on the dashboard.

Until then, overage settings are hidden (the page 404s and the APIs refuse).

### 6.3 Owner decisions still open

| Item | Coded now | Recommended | Where |
|---|---|---|---|
| Overage price | $7.50 per 1,000 credits, floor cost × 4.0 (flag off) | the §6 price list | `overage.creditPack`, `overage.multiplier`, `overage.priceList` |
| Overage caps | default $20, max $500 (opt-in) | same | `overage.defaultCapUsd`, `overage.maxCapUsd` |
| Free daily questions | live 50/day; with the flag on, 25 signed in / 5 anonymous | 25 / 5 | `freeDaily.questions`, `freeDaily.anonQuestions` |
| `METER_MARGIN` (credits = estimate × margin) | **1.1, unchanged** | 1.25 | `src/lib/orchestration/limits.ts`, the owner's decision |
| Extra credit multiplier | 1 (no change) | — | `pricing.marginMultiplier` / `pricing.featureMultiplier` |
| `KEPLAR_GLOBAL_DAILY_USD_CAP` | **$25, unchanged** | about 1.5× daily variable cost (≈ $5.4k/day at Base); the dashboard suggests a value | Vercel env |
| Runway alert days | warn 7, critical 2 | same | `lowBalance.runwayWarnDays` / `runwayCriticalDays` |
| **Free-tier paid fallback** | **off; Free stays on `:free` models only** (standing rule, enforced by `freeModelsOnly`) | The financial model says `:free` capacity covers only about 0.16% of Free demand at 100k MAU (≈ 30k of 19.3M requests per month). It suggests a paid fallback (DeepSeek V4.1 Flash, about $14.7k/month at Base). | Owner decision. If approved, it needs a separate flag, a Free daily USD budget and a change to `freeModelsOnly`. Nothing is built or enabled. |

## 7. Per-feature cost table (ESTIMATES)

These are **estimates from list prices and typical call shapes, not measurements** (`estimateTable()` in
`src/lib/cost/estimates.ts`). Real averages replace them on the dashboard as traffic accrues.

- Paid models use the blended live-roster price ($0.167 in / $0.791 out per 1M tokens).
- "Credits at cost" = ⌈USD × 1.1 / $0.002⌉, the minimum that covers cost with the 10% meter margin.
- The revenue columns show what those credits bring in on each plan.
- Free users pay $0 because they only use `:free` models.

| Feature | Assumption | Est. provider cost | Credits at cost | Credit value at cost | Revenue on Plus | Revenue on Pro |
|---|---|---|---|---|---|---|
| ask | 5-model panel (2k in / 700 out) + 2 verifiers + 1 judge | $0.0077 | 5 | $0.010 | $0.037 | $0.037 |
| debate | Two panel rounds + judge (~2× Ask) | $0.0154 | 9 | $0.018 | $0.068 | $0.066 |
| deep-research | ~25 calls of 6k in / 1.2k out | $0.0488 | 27 | $0.054 | $0.203 | $0.198 |
| core-reasoning | Thorough routing, ~1.5× Ask | $0.0116 | 7 | $0.014 | $0.052 | $0.051 |
| multimodal | Ask + 2 images | $0.0102 | 6 | $0.012 | $0.045 | $0.044 |
| study | 1 call of 8k in / 4k out | $0.0045 | 3 | $0.006 | $0.022 | $0.022 |
| slides | 3 calls of 6k in / 5k out | $0.0149 | 9 | $0.018 | $0.068 | $0.066 |
| create | Site/app generation (site.generate) | $0.2500 | 138 | $0.276 | $1.035 | $1.012 |
| critic | 2 vision calls of 12k in / 1k out | $0.0056 | 4 | $0.008 | $0.030 | $0.029 |
| images | 1 image, GPT Image 2 | $0.0135 | 8 | $0.016 | $0.060 | $0.059 |
| video | 5 s Seedance 2.0 at $0.1407/s | $0.7035 | 387 | $0.774 | $2.902 | $2.838 |
| transcribe | 1 minute of audio | $0.0060 | 4 | $0.008 | $0.030 | $0.029 |
| voice-create | 1 min transcription + one Create edit | $0.0860 | 48 | $0.096 | $0.360 | $0.352 |
| agents | One agent step | $0.0100 | 6 | $0.012 | $0.045 | $0.044 |
| api / embed | Single-model answer, 2k in / 700 out | $0.0009 | 1 | $0.002 | $0.007 | $0.007 |
| deploy | Static build + upload | $0.0100 | 6 | $0.012 | $0.045 | $0.044 |
| memory | 1 cheap call, 2k in / 300 out | $0.0001 | 1 | $0.002 | $0.007 | $0.007 |
| title | 1 cheap call, 500 in / 20 out | <$0.0001 | 1 | $0.002 | $0.007 | $0.007 |

**Worst case per subscriber:** if every credit is spent at cost, a Plus user's 6,000 credits cost at most ≈ $10.9 of provider
spend against $45 of revenue, and Pro's 13,500 credits ≈ $24.5 against $99. The daily USD quotas cap a single heavy day
($4 for Plus, $8 for Pro, across all features). The dashboard shows whether a feature is charging fewer credits than it costs.

## 8. Env vars

| Var | Purpose | Status (production) |
|---|---|---|
| `DATABASE_URL` | cost events, rollups, state (Neon) | set |
| `CRON_SECRET` / `OPS_CHECK_SECRET` | cron and ops auth | set |
| `RESEND_API_KEY` | alert emails | set |
| `OPENROUTER_API_KEY` | balance fallback via `/key` | set |
| `OPENROUTER_MANAGEMENT_KEY` | true account balance from `/credits` | **missing**: the balance check falls back to the key's limit, and shows "no reading" if the key has no limit |
| `KEPLAR_OWNER_EMAIL` | alert recipient | missing (falls back to `ADMIN_EMAIL`, then team@keplar.one) |
| `STRIPE_SECRET_KEY` | Stripe revenue lookup and overage meter events | set (Connect key; plans are on Whop) |
| `KEPLAR_STRIPE_OVERAGE_METER` | enables sending overage to Stripe | missing (pending approval) |
| `KEPLAR_COST_CONFIG`, `KEPLAR_FEATURE_OFF`, `KEPLAR_FLAG_*` | config overrides | optional |
| `KEPLAR_COST_METER=0`, `KEPLAR_COST_WATCH=0` | emergency off switches | optional |

## 9. Tests

- `tests/cost-meter.test.ts` covers:
  - metering accuracy: provider cost, token pricing, SSE, Anthropic, image/video/Higgsfield unit prices
  - batching and retry
  - attribution
  - the kill switch, the Free paid-model block, throttle rewrite, the exhausted-balance rewrite, the 402 fallback, quotas, and fail-open
- `tests/cost-guard.test.ts` covers:
  - `decide()` order
  - quotas and overage room
  - Free daily limits
  - config sanitising and env overrides
  - overage price, cap and alerts
  - margin and anomaly detection, and auto-throttle selection
  - low-balance thresholds, top-up detection and the key-limit fallback
  - runway (trailing-24h spend, the 7- and 2-day levels, alert dedupe and re-arm)
  - the global-cap 80% warning and the suggested cap
  - the Free 25/5 question caps (flag on) vs the live limit (flag off)
  - overage pricing: $7.50 per 1,000 credits, the 4× floor, and ≥70% margin on every price-list unit
  - the estimates table
- `tests/cost-meter-coverage.test.ts`: the bypass lint.
- `tests/openrouter-balance.test.ts`: the existing alert episode tests (threshold is now "at or below 1%").
