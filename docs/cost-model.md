# Cost model and usage limits

**Unit:** 1 credit = 1 Usage unit = **$0.002** of provider cost.

| Plan | Price | Credits / month | Model budget | Margin before fees |
|---|---|---|---|---|
| Free | $0 | none (free `:free` models only) | $0 | n/a |
| Plus | $45 | 6,000 | $12 | ~$33 |
| Pro | $99 | 13,500 | $27 | ~$72 |
| Admin `team@keplar.one` | n/a | unlimited | capped at $25/day | n/a |

## Rolling usage limits (Plus and Pro)
On top of the monthly credits, subscribed plans have two rolling limits, metered in credits
(real provider cost x 1.1 margin, the same ledger charge):

| Plan | 5-hour limit | Weekly limit | Monthly credits |
|---|---|---|---|
| Plus | 1,000 | 3,200 | 6,000 |
| Pro | 2,250 | 7,200 | 13,500 |
| Admin `team@keplar.one`, Free, Business | none (admin keeps the $25/day cap) | none | n/a |

- **Config in one place:** `WINDOW_LIMITS`, `USAGE_WINDOWS` (5 h / 7 d) and `WINDOW_WARN_AT` (0.8) in
  `src/lib/orchestration/plans.ts`. Logic in `src/lib/create/platform/windows.ts`.
- **How a window works:** it opens with the first charge after the previous one closed and ends 5 hours
  (or 7 days) later. Credits charged inside it count; when it closes the counter starts again.
- **Enforced server-side** from the store (Neon in production; one row per workspace and window,
  atomic `increment`), so it holds across serverless instances. `/api/keplar` stops the question before
  it starts (`limit` event with the window, reset time and message); Create/Business gating
  (`assertCanSpend`) refuses with a 402 carrying the same message. Plus gets an "Upgrade to Pro" suggestion.
- **Only real charges count.** A run with no model response is never charged, so it never counts.
- **UI:** signed-in users see both bars (sidebar Keplar Usage meter and `/account`) with reset times
  ("resets in 3h 20m", "resets Mon") and a warning from 80% used. Signed-out visitors see no meter, only Sign in / plans.
- A question's credits are reserved against the tighter of monthly and window room, so parallel
  questions cannot overspend a window.

## What is metered
Every paid request is charged from the cost the providers report, falling back to a
token-priced estimate (`pricing.ts` `spentUsd()`) when a provider reports none. This covers the panel
models, extractor, verifier, judge/comparator, synthesizer, Deep Research, and
image/video/attachment calls. The total is multiplied by a **1.1 safety margin**
(`METER_MARGIN` in `limits.ts`) before it becomes credits.

A run that is stopped or fails after paid calls started is still billed at its
planned cost, so closing the tab does not make a request free.

## Hard stops (`src/lib/orchestration/limits.ts`, `src/lib/create/platform/usage.ts`)
| Limit | Free | Plus | Pro |
|---|---|---|---|
| Burst (per minute) | 6 | 10 | 20 |
| Requests per day (user) | 50 | 300 | 600 |
| Requests per day (IP) | 150 | n/a | n/a |
| Concurrent requests | 2 | higher | higher |
| Max USD per request | $0 (free models) | $0.75 (Deep Research $3.50) | $1.50 (Deep Research $5) |
| Max USD per day | n/a | $3 | $7 |
| Prompt / history / attachment size | capped per plan, 413 when over | | |

- Out of credits: the ledger blocks the request (402) and the UI offers Upgrade/Top up.
  In-flight reserved credits are subtracted, so parallel requests cannot overspend.
- A request whose planned cost is over the per-request cap is refused before any model is called.
- Free: the daily count is kept in a signed per-browser cookie, a per-instance counter and a per-IP counter.
- Global daily spend cap (`KEPLAR_GLOBAL_DAILY_USD_CAP`, 25) and the Free cap (`KEPLAR_FREE_DAILY_USD_CAP`) pause Free; admin has `KEPLAR_ADMIN_DAILY_USD_CAP` ($25).
- Small talk and the creator reply are deterministic/free-model and use no credits and no limits.

## Cheaper by default
On paid plans with the Auto strategy, a short, moderate, general/writing/factual question (≤40 words,
no attachments, media, web or Deep Research) gets a **2-model panel** instead of the full one
(`router.ts` `isLightModerate`). Hard, high-stakes or Deep Research questions keep the full panel.

## Known limits
Without `DATABASE_URL` and Upstash, counters are per serverless instance and the plan rides a
signed cookie. The credit ledger and spend guards are the real hard stops; the per-day request
counts are best effort until the Neon-ready store is connected.

## Upgrade flow
Pricing → `/checkout?plan=plus|pro` → (signed out: `/signin?next=…`) → `POST /api/billing/checkout` → Whop.
Without `WHOP_API_KEY`/`WHOP_COMPANY_ID` buttons show "Checkout opens soon". Free users also see a
dismissible upsell note (`src/lib/upsell.ts`): after the 5th answer, then every 10th, or on a complex question
(max once a day, never within an hour of the last note, hidden 7 days after dismissal), never on
small talk/creator replies and never for Plus/Pro/admin.


## Slides, Study and Memory

### Slideshow creator (Plus, Pro, Business; Free is locked)
- Enforced on the server in every `/api/slides/*` route (`slidesWorkspace`): signed out is 401, Free is 403 `plan_required` with `upgradeTo: "plus"`. The page only shows the locked state and an Upgrade button to `/checkout?plan=plus`.
- Models (`src/lib/tools/models.ts`): Plus `gemini-3.1-flash-lite` first (then `qwen3.8-flash`, `deepseek-v4-flash`); Pro and Business `gemini-3.8-flash` first.
- Metering: one `ToolRun` per request adds up the cost the providers report; `settle()` charges once as `ceil(usd * 1.1 / 0.002)` credits. A run in which no model answered, or whose reply could not be turned into slides, is not charged. Editing, presenting and exporting cost nothing.
- Limits (`src/lib/tools/limits.ts`): Plus up to 15 slides, 40k characters of source, 30 decks a day, 50 saved; Pro 30 slides, 120k characters, 80 a day, 200 saved. Estimated cost over the plan's per-request cap is refused (413) before any call.
- Export: PPTX (pptxgenjs) and PDF (pdf-lib). Image prompts become text placeholders on the slide; no images are generated.

### Study mode (all plans)
- Free: free `:free` models only (the registry's hard price guard refuses anything else), never charged, smaller limits (30 pages, 60k characters, 3 sets, 3 cards and 3 questions per topic, 15 builds a day, 30 questions to the guide a day).
- Plus and Pro: stronger models, longer documents (120 / 300 pages), more sets; charged by actual provider cost like slides. Multiple-choice grading, flashcards (SM-2 + Leitner), progress, streak and the study plan use no model and cost nothing. Short-answer grading and "Ask the guide" call a model.
- Answers come only from retrieved excerpts of the user's document with page citations; an answer without a valid citation is reported as "not in your material". No OCR: scanned PDFs are rejected with a clear message. Documents are fenced as data and never treated as instructions.
- Delete removes the set, the stored text and the progress.

### Memory and saved chats (signed in only)
- Extraction after an answer uses the small-talk free-model registry (`:free` only), so it is never charged to credits and never counted against Plus/Pro allowances. It runs only on the user's own short, first-person messages (not small talk, not attachments), at most 40 times an hour per account, and every fact is validated (no instructions, links, secrets or card numbers).
- Injection: relevant items are chosen by word overlap, capped at about 250 tokens, and sent ahead of the question as data (`req.memory`, never accepted from the client). Nothing is injected when memory is off, the user is signed out, or after the items are deleted.
- Memory commands in chat ("forget that", "erase my memory", "remember that ...") are classified conservatively before the engine and answered without a model call or charge. Deletes are hard deletes from the store.
- Chats: saved per user (`chat_threads`), up to 200 chats of 400 KB each; media is never saved.

### Chat context and chat memory (no credits)

- Within a conversation the route sends the recent turns (client sends up to 40; the server keeps the newest word for word and shortens older ones, within min(plan history budget, 16k characters)) ahead of every question, as fenced data. This input is counted by the classifier's cost estimate, so it is metered like any other input.
- Signed in with memory on: after each real answer a free model refreshes a 35-word summary of the chat, and another extracts notes (both `:free` only, rate limited, never charged). New chats get notes, summaries of the last five chats (about 350 tokens) and up to three relevant past-chat snippets (about 300 tokens, Postgres full-text search).
- "What did we talk about last time / yesterday" and "what did I just ask" are answered from stored data with no model call and no charge.

## Usage cooldown, global breaker, job limits (Create, answers, slides, study)

All of this reads the same `compute_ledger` in Neon that every paid path already writes to (`charge` and `chargeUnits`: answers, Create, slides, study, media), so one rule covers every spend path. Velocity is measured as **charged USD** (provider cost × 1.1 margin), not credits.

### Keplar usage cooldown (`src/lib/create/platform/cooldown.ts`)

A user is put on a cooldown when, after any charge, either of these is true:

| Rule | Plus | Pro / Business |
|---|---|---|
| Spend in the last 60 min above | $2.00 | $4.00 |
| Spend in the last 30 min above this share of the plan's daily USD cap (Plus $3, Pro $7) | 60% | 60% |

- Length: **30 min** the first time, **45** the second, **60** the third and later. A strike is forgotten when the previous cooldown started more than 24 h ago.
- Spend made before a cooldown started never counts toward the next one, so a user is not re-punished for the same spend.
- Exempt: the admin (`team@keplar.one`; still subject to the existing $25/day cap), Free (free models cost $0; Free is limited by request caps) and anonymous visitors.
- What the user sees: "Keplar usage cooldown", the reason in plain words, the reset time and a live countdown in Create. In /app chat the same message is shown as text only (a refusal with a Retry-After header); a live countdown there needs a change in `KeplarApp`.
- Where it is enforced: `assertCanSpend` (all metered actions), `enterUsage` (so `/api/keplar` is covered without a route change) and the site builder's job check. API errors are HTTP 429 with `code: "cooldown"`, `until`, `startedAt`, `strikes`.
- Env overrides (all optional, number > 0): `KEPLAR_COOLDOWN_PLUS_HOURLY_USD`, `KEPLAR_COOLDOWN_PRO_HOURLY_USD`, `KEPLAR_COOLDOWN_BUSINESS_HOURLY_USD`, `KEPLAR_COOLDOWN_QUICK_FRACTION`, `KEPLAR_COOLDOWN_QUICK_WINDOW_MIN`, `KEPLAR_COOLDOWN_WINDOW_MIN`, `KEPLAR_COOLDOWN_MIN_1/2/3`.
- Interaction with the credit windows: a Plus user who spends 60% of the $3 daily cap inside 30 minutes (about 900 credits) will hit the cooldown before the 5-hour credit window (1,000 credits) runs out. That is intended: the cooldown is the fast brake, the windows are the slow one.

### Global circuit breaker (`breaker.ts`)

Total spend today across all users (`spend.ts`) against `KEPLAR_GLOBAL_DAILY_USD_CAP` (default **$25**; raise it when real traffic needs more):

| Level | At | Effect |
|---|---|---|
| normal | below 70% | none |
| cheap | 70% | Site builder paid plans step down to the cheap model (DeepSeek V4.1 Flash); notice shown in Create |
| no_media | 85% | Cheaper models stay. Image and video keep running and still spend credits. |
| capped | 100% | Free pauses until 00:00 UTC. Image and video keep running on credits. |

Overrides: `KEPLAR_BREAKER_CHEAP_AT`, `KEPLAR_BREAKER_MEDIA_AT` (fractions), `KEPLAR_BREAKER_FORCE` (testing). The /app answer orchestrator does not switch to cheaper models by itself at the "cheap" level (its files were off limits when this was built); the "capped" level and the daily caps do apply to it through `enterUsage`/`assertCanSpend`.

### Job concurrency and size limits

- `jobs.ts`: each running job takes one of N numbered slots per user in Neon (Free 1, Plus 2, Pro 3, Business 4 for site builds). A slot a crashed function never released expires after 6 minutes.
- Site builder per-plan caps are in `src/lib/site-builder/limits.ts`: prompt length, pages, bytes per site, jobs per day and per minute, output tokens, max estimated cost of one job.

### Site builder cost (Create)

- Free: free OpenRouter models only ($0), text-only, 1,500-character prompts, 4 pages, 70 KB, 8 AI builds a day. Templates are instant and free for everyone.
- Plus: Gemini 3.8 Flash; Pro: Claude Sonnet 5.5. Cost comes from the real `usage.cost` in the OpenRouter stream and is charged through `charge()` (×1.1), so it counts in credits, both windows, the daily cap and the cooldown. Failed runs that were billed are charged too.
- Before a job: `/api/sites/:id/estimate` returns a credit estimate (shown under the composer). Estimates above 120 credits (about $0.24; `KEPLAR_SITE_CONFIRM_UNITS`) need an explicit confirm: the generate call answers 409 `code: "confirm"` with the estimate, and the UI re-sends with `confirm: true`.
- Users see credits, never dollars.

### Product import cost (Create)

- **Link import costs no model credits.** The cost is one page fetch (≤ 1.8 MB), up to 4 to 10 image downloads (≤ 14 MB each before they are fitted to 4.3 MB), and storage in Neon (`bytea`, about $0.35 per GB-month, so a full Pro product library of 600 MB is about $0.21 a month). Bandwidth and storage are bounded by the per-plan limits (page imports a day: Free 5, Lite 15, Plus 40, Pro 100, Business 200; stored images and MB: 8 / 24 MB, 30 / 90, 80 / 250, 200 / 600, 400 / 1,200; images a day 12 / 30 / 80 / 200 / 400). Unattached images expire after 24 h.
- **Reading a photo** (optional) is one vision call: Free plan uses the free vision models ($0, not charged); paid plans use Gemini 3.8 Flash, about 1,700 image tokens in and 200 out ≈ **$0.003, 1 to 2 credits** (real `usage.cost`, charged through `charge("photo.read")`). Daily caps 5 / 15 / 40 / 100 / 200; worst case per day on Business 200 × $0.003 = **$0.60**, on Plus 40 × $0.003 = $0.12. Gated by `assertCanSpend` (cooldown, breaker, credits).
- **The build itself** is unchanged (a normal site build). The product block adds about 600 to 1,500 characters to the prompt (≈ 200 to 450 input tokens, under $0.001 on Gemini 3.8 Flash); images are hosted URLs, not tokens.
- Users see credits, never dollars.

### Image generation cost (Create, Plus/Pro/Business)

- Model `gpt-image-1-mini` (OpenAI Image API), published per-image prices (checked 2026-10-02): **High** $0.036 square / $0.052 wide or tall (**the default, Wide**); Standard (`medium`) $0.011 / $0.015; Draft (`low`) $0.005 / $0.006. gpt-image-1-mini's largest output is 1536 px on the long edge (1024x1024, 1536x1024, 1024x1536 are its only sizes), so Wide 1536x1024 is the "larger size"; a bigger model would cost 4x+ more per image and is not used.
- **Cost impact of the quality change (2026-10-03).** The default image went from Standard Square ($0.011 table, about $0.0085 real, 5 credits charged, 7 estimated) to High Wide ($0.052 table, about $0.0497 real from 6,208 output tokens, **28 credits charged, 29 estimated**): **about 4.7x on the table price, 5.6x on credits actually charged**. Like for like: Wide Standard $0.015 -> High $0.052 (3.5x); Square $0.011 -> $0.036 (3.3x). Standard and Draft stay selectable at their old prices.
- **Estimate** (shown, and confirmed by the user, before the job): price x 1.1 margin in credits: High 20 square / 29 wide, Standard 7 / 9, Draft 3 / 4. **Charge**: the real cost from the API's token `usage` (x 1.1), at most 3x the table price, charged through `charge("image.generate")` **only when the image is READY**. A default High Wide image is about 28 credits, so a Plus month (6,000 credits) allows about 210 of them by credits alone (was over 1,000 Standard squares); the per-day caps below bind first in practice.
- **Caps per plan:** Free none (not available); Plus 15 images/day of which at most **6 High**, 1 running, 3/min; Pro 40/day (**16 High**), 2 running, 4/min; Business 80/day (**32 High**), 3 running, 6/min. Worst-case provider spend per user per day, High capped and the rest Wide Standard: Plus 6 x $0.052 + 9 x $0.015 = **$0.45** (was $0.23), Pro **$1.19** (was $0.60), Business **$2.38** (was $1.20). Still far below the cooldown thresholds (Plus $2/h) and the global $25/day admin cap; the High sub-cap is what keeps a monthly worst case (Plus about $13) from exceeding the price of the plan. When the High allowance is used up the message says Standard is still available.
- **Gates:** the shared `assertCanSpend` with `paidMedia: true`: ops kill switches (media pause, `openai` / `gpt-image-1-mini` disabled), usage cooldown, 5-hour and weekly windows, monthly credits, and the admin $25/day cap (the admin is exempt from the daily image count and from windows/cooldown, not from the $25 cap). The global daily budget does not pause images. The check runs again right before the provider call.
- **Not charged:** refused prompts, moderation outages, provider errors, timeouts, images dropped by output moderation, images that could not be saved. If the provider billed anyway, the cost is added to the global daily spend (so the breaker sees it) but not to the user.
- **Storage:** Neon `bytea`, **PNG exactly as the model produced it (lossless, never re-encoded)**: a High 1536x1024 image is about 3.2 MB (measured), max 4.3 MB each so it always fits Vercel's 4.5 MB response limit (a PNG over that is repacked as lossless WebP, identical pixels; never lossy). Plus 80 images / 250 MB, Pro 200 / 600 MB, Business 400 / 1.2 GB. Neon storage costs about $0.35 per GB-month, so a full Business library is about $0.42/month; images are deleted by the user (no automatic expiry yet).
- Users see credits, never dollars.

