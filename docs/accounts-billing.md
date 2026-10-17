# Accounts, protections and billing

Status: Keplar's own plans are sold through **Whop** (Plus $45, Pro $99 per month).
Checkout stays "Checkout opens soon" until `WHOP_API_KEY` and `WHOP_COMPANY_ID` are set.
Nothing is simulated. Stripe is used only for sellers' payments in Business OS (Connect).

**iOS (Keplar One):** the same Plus/Pro tiers are also sold via StoreKit (`one.keplar.plus.monthly`,
`one.keplar.pro.monthly`). ASN V2: `POST /api/webhooks/apple` (503 until `APPLE_BUNDLE_ID` is set).
Client sync: `POST /api/billing/apple/verify` (session). Env: see `.env.example` (`APPLE_*`).

## 1. Auth: Better Auth (not Auth.js)

| | Better Auth 1.7.x | Auth.js / next-auth v5 |
|---|---|---|
| Release status | Stable 1.x | v5 is still beta (5.0.0-beta.x) |
| Maintenance | Active; the Auth.js project is now maintained by the Better Auth team | Maintenance mode, new work goes to Better Auth |
| Magic link | First-party plugin (hashed tokens, per-endpoint rate limit) | Email provider needs a DB adapter + custom rate limiting |
| Rate limiting | Built in (memory or secondary storage such as Redis) | Not built in |
| Email verification | `emailVerified` on the user, enforced by our `requireAccount()` | Manual |
| DB | Adapters for Postgres/Drizzle/Kysely; memory adapter | Adapters |

Flows:
- **Pages**: `/signup` and `/signin` are separate pages with a Sign up | Log in toggle (the toggle and the `?next=`
  target are preserved when switching). Split layout (form left, product panel with the page-wide particle layer right;
  one column on mobile). Also `/forgot-password`, `/reset-password?token=`, `/verify-email?token=`. Post-login redirects
  go through `authRedirectPath` (`src/lib/accounts/redirect.ts`): same-origin relative paths only, and never an auth
  page (no loops). `Switch account` / `Add account` still sign out and land on `/signin?next=%2Fapp` (Google and
  Microsoft show their account chooser).
- **Email + password** (`src/lib/accounts/password-auth.ts`, a Better Auth plugin; needs `DATABASE_URL`, otherwise the
  pages say passwords are unavailable and offer the link/providers). Better Auth's built-in `emailAndPassword` needs
  its own database adapter and tables, which doesn't fit the stateless-cookie + `keplar_sessions` model, so the plugin
  uses Better Auth's scrypt `hashPassword`/`verifyPassword`, CSRF/origin handling and cookie writer, and our session
  rows. Hashes live in `keplar_credentials` (email, hash, name, verified_at, terms_accepted_at).
  Policy (`password-policy.ts`, shared with the form so hints are instant): 10-128 characters, no very common
  passwords or trivial patterns, not built from your email or name, no forced symbol rules; strength bar and hint.
  - Sign-up (`POST /api/auth/password/sign-up`): validation, Terms checkbox required, stores a **pending** credential and
    emails a 24 h verification link. The pending credential cannot log in; a newer sign-up for the same address
    replaces it; any verified sign-in (magic link, Google, Microsoft) deletes it, so nobody can pre-register someone
    else's address and keep a password on it. The link lands on `/verify-email` (checks only, scanner-safe); the
    **Verify and continue** button consumes it, verifies, and signs in.
  - Log in (`/password/sign-in`): unknown address, wrong password and accounts with no password all answer `401
    Incorrect email or password.` after the same scrypt work (a dummy hash is checked for unknown addresses).
    Correct password + unverified email answers 403 with a resend option.
  - Forgot / reset (`/password/forgot`, `/password/reset`): `/forgot-password` always answers the same, and mails only
    addresses that already have an account (any method), so it also lets a link-only user **add** a password. The
    30 min link is signed and single use (it carries a keyed fingerprint of the current hash, which changes on use).
    Resetting signs out every other device (`sessions_valid_after`) and signs this device in.
  - Rate limits and lockout (shared through Upstash or Postgres when available, memory otherwise): log in 6 per IP+email
    per 5 min, 12 per email per 15 min (keyed on the address text, so identical for addresses with no account), 40 per
    IP per 10 min; sign-up / forgot / resend 3 per email and 8 per IP per 10 min; verify/reset 20 per IP per 10 min.
    429 says to wait or use an email link.
  - CSRF: every endpoint is POST + JSON and needs an `Origin` that is ours (no Origin = 403), on top of Better Auth's
    origin/callbackURL checks and SameSite=Lax cookies. Sessions are the same 60-day sliding cookies; "Keep me signed
    in" off gives a session-only cookie.
  - No email delivery (`RESEND_API_KEY` unset, outside dev tools): the pages show "Email delivery isn't configured",
    and the sign-up, forgot and resend endpoints answer 503 `EMAIL_NOT_CONFIGURED` (nothing is stored). Password
    log-in for already verified accounts keeps working.
- **Email magic link** (`/signin`, "Email me a sign-in link"): stateless, so it works on Vercel where
  every request may hit a different serverless instance
  (`src/lib/accounts/magic-token.ts`, `stateless-magic-link.ts`). The
  email links to `/signin/verify?token=…`; the token is
  `v1.<payload>.<HMAC-SHA256>` keyed from `BETTER_AUTH_SECRET`, carries the
  email, a same-origin redirect path (anything else falls back to
  `/account`: no open redirects) and a 15-minute expiry, and is verified
  without a database. Opening the page consumes nothing (email scanners
  that prefetch links are harmless); the **Sign in** button POSTs to
  `/api/auth/magic-link/confirm`, which checks origin, signature and
  expiry, marks the token id used (per instance: best-effort single use
  without shared storage) and sets the session. The user id is derived
  from the email. Per email, per IP+email and per IP limits shared across
  instances (Upstash or Postgres), plus Better Auth's 3 link requests/min,
  10 confirms/min and 30/min global auth limit per IP (in memory, per
  instance). The link proves the address,
  so users are `emailVerified: true`.
- **Sessions (persistent, revocable)**: the browser holds Better Auth's signed
  `session_token` and an encrypted `session_data` (JWE) cookie, both
  HttpOnly, SameSite=Lax, Secure on https, with **Max-Age = 60 days** so they
  survive a browser restart; they are re-issued (sliding window) while the
  user is active. "Remember me" is on by default ("Keep me signed in" checkbox on /signin,
  also honoured for Google/Microsoft via a 15-minute `keplar_remember=0`
  preference cookie); off gives a session-only cookie and a 1-day server record.
  With `DATABASE_URL` set, `src/lib/accounts/persist.ts` also records, in Neon:
  `keplar_users` (id, email unique, name, created_at, last_login, providers[],
  sessions_valid_after) and `keplar_sessions` (id, user_id, created_at,
  last_seen, expires_at, user_agent, ip_hash = keyed HMAC of the IP, provider,
  remember, revoked_at). `getSession` checks the row (15 s per-instance cache),
  so **Sign out** (this device), the per-device sign-out and **Sign out of all
  devices** on /account take effect everywhere within seconds. Every sign-in
  mints a fresh session id and revokes the one the browser held (rotation).
  Cookies issued before this change (created before 2026-10-02) are adopted
  into the table on first use until 2026-11-02 (same user id, so nobody is
  signed out and no data moves); any other session id without a row is
  refused, and a deleted account leaves a tombstone so an old cookie can't
  recreate it. A user's id is the
  one stored for their email, so magic link, Google and Microsoft are one
  account. Without `DATABASE_URL` the stateless cookie is the only session
  (still 60-day persistent); the device list answers 501 and is hidden.
  A Neon outage fails closed (the session is treated as signed out; see
  `src/lib/accounts/session-guard.ts`), and a sign-in whose session row
  can't be written is refused rather than left half-recorded.
  `GET/DELETE/POST /api/account/sessions` list / revoke one / revoke all
  (same-origin + rate limited). Nothing secret is stored or logged.
- **Google / Microsoft** (`src/lib/accounts/oauth.ts`): each is enabled only
  when both of its env vars are set (`GOOGLE_CLIENT_ID/SECRET`, legacy
  `GOOGLE_SIGNIN_*` also accepted; `MICROSOFT_CLIENT_ID/SECRET`, tenant
  `common`). Otherwise the provider isn't registered and its button is shown disabled with a "Not configured" badge.
  Redirect URIs: `<BETTER_AUTH_URL>/api/auth/callback/google` and
  `…/callback/microsoft`. DB-less: OAuth state lives in an encrypted cookie,
  the user id is derived from the verified email (same as magic links, so all
  three methods reach one account), unverified emails are refused (Microsoft
  work accounts need `email_verified`/`verified_primary_email`/`xms_edov`),
  and provider tokens are not stored (`storeAccountCookie: false`).
- **Workspaces are the tenants.** A `databaseHooks.user.create` hook creates
  one workspace per user (`src/lib/accounts/workspaces.ts`); plan and billing
  state live on the workspace. All API routes resolve
  `currentWorkspace(req)`: session → the user's workspace; no session →
  Free with no account for `/api/keplar` and `/api/compute` only (answers
  only, owns no data), 401 everywhere else; `KEPLAR_AUTH_REQUIRED=1` makes
  `/app` need a session too.
- No auth DB today (see Sessions). Later:
  Postgres (Neon) via Better Auth's Kysely/pg adapter
  (`npx @better-auth/cli migrate`), and `secondaryStorage` on Upstash
  for sessions + auth rate limits.
- Email: Resend when `RESEND_API_KEY` is set; otherwise `/dev/outbox`
  (only with `KEPLAR_DEV_TOOLS=1`; message bodies are withheld otherwise).
- Feedback: every message from the Feedback page (and the cancel survey) is stored and also emailed to `team@keplar.one` (`brand.feedbackEmail`, `src/lib/growth/feedback-mail.ts`) through Resend with the same sender as inquiries; the page always shows a mailto fallback. A failed email never fails the request.

## 2. Protections

| Protection | Where | Behaviour |
|---|---|---|
| Rate limits per IP + per account | `platform/ratelimit.ts` `limitRequest()` | Upstash REST (`INCR` + `EXPIRE NX`) when `UPSTASH_REDIS_REST_*` is set, in-memory otherwise. `/api/keplar`: 30/min per IP and the plan's rpm per account. Checkout: 10/min per IP, 5/min per account. Magic link: 3 per email per 10 min, 2 per IP+email per minute, 10 per IP per 10 min. 429 with `code: rate_limited`. |
| Global daily spend cap | `platform/spend.ts` | Every charge records USD spend per UTC day. When total ≥ `KEPLAR_GLOBAL_DAILY_USD_CAP` (25) or Free ≥ `KEPLAR_FREE_DAILY_USD_CAP` (5), Free is paused (402 `entitlement`, meter shows "paused") and the owner is alerted once per day (email + optional webhook). `KEPLAR_FREE_PAUSED=1` is a manual kill switch. Paid plans continue. |
| Free key (optional) | `orchestration/config.ts` `liveEnv("free")` | Free requests use `OPENROUTER_API_KEY_FREE` if set, otherwise the normal `OPENROUTER_API_KEY`. Either way they only reach $0 `:free` models (next row). Direct provider keys (OpenAI, NVIDIA), LiteLLM and retrieval are disabled for Free. |
| Server-side Usage ledger | `platform/compute.ts`, `/api/compute` | Replaces the old localStorage meter. One ledger per workspace, shared by `/app`, Create and Business. The client-sent `computeRemaining` is ignored. The period is the paid billing period for paid plans, or monthly from the signup day for Free. The reset follows the billing date. |
| Free = free ($0) models only | `orchestration/router.ts` `freeOnlyFor()`, `orchestration/free-guard.ts`, registry `freeOnly` | For `plan: "free"` (set server-side), the router only picks OpenRouter `:free` models priced $0 for prompt and completion (`freeRoster` in `live-catalog.ts`), a panel of at most 3, no judge model, and no Deep Research. Hard guard: the registry and the Free-tier OpenRouter provider refuse any Free-plan call to a model with a nonzero price, a non-`:free` slug or a non-OpenRouter route, before anything is sent (fallbacks included). Rate-limited free models fall back to other free models, then show a "busy, try again or upgrade" message. |

## 3. Plans and billing: Whop

**Plans and credits** (see `docs/cost-model.md`; 1 credit = 1 Usage unit = $0.002 of provider cost):

| Plan | Price | Credits / month | Models |
|---|---|---|---|
| Free | $0 | No credits; ~50 questions/day (fair use) | Free `:free` open models only, plus burst/IP limits and the daily Free spend cap |
| Plus | $45 | 6,000 | All |
| Pro | $99 | 13,500 | All |
| Admin (`team@keplar.one`, `KEPLAR_ADMIN_EMAILS`) | n/a | Unlimited | All, with a daily safety cap of `KEPLAR_ADMIN_DAILY_USD_CAP` (default $25). |

Small talk ("hi", "thanks", "who are you") is answered by one free model on every
plan and never uses credits (`src/lib/orchestration/smalltalk.ts`).

**Checkout:** `POST /api/billing/checkout {plan}` (signed in, verified, same-origin,
rate limited) calls `POST https://api.whop.com/api/v1/checkout_configurations` with an
inline monthly plan (`renewal_price` 45 or 99, `initial_price` 0) and `metadata`
`{email, plan, workspace_id}`, then returns Whop's `purchase_url` (only whop.com URLs
are ever returned). Without keys it answers 503 `{configured:false}` and the
buttons read "Checkout opens soon".

**Webhook:** `POST /api/webhooks/whop`, Standard Webhooks signature
(`webhook-id`, `webhook-timestamp`, `webhook-signature`; HMAC-SHA256 over
`id.timestamp.body`, 5-minute window) verified with `WHOP_WEBHOOK_SECRET`.
503 without a secret, 401 on a bad signature. Events: `payment.succeeded` and
`membership.activated` grant the plan from the checkout metadata;
`membership.deactivated` moves to Free; `refund.created` and `dispute.created`
move to Free and email the owner. Idempotent by `webhook-id`.

**Plan state without a database:** the workspace row holds the plan, but the file
store is per serverless instance. So after checkout (return to `/account`, or the
"Refresh plan" button, which looks up the paid Whop payment by email) the server
sets a signed `keplar_plan` cookie (HMAC, HttpOnly, SameSite=Lax, Secure, bound
to the email, expires with the period). The higher of the stored plan and the
cookie wins. Limits: the cookie is per browser, and a refund or cancel is only
seen after the webhook reaches an instance that holds the row. **Set
`DATABASE_URL` (Neon) to make plan state, usage and Create/Business data durable
and shared.** The store creates one table (`keplar_rows`) on first use over
Neon's HTTP SQL endpoint. This adapter has not been run against a live Neon
database yet; test it on a Neon branch first.

### Going live with Whop
1. Create the company and set `WHOP_API_KEY` (already in Vercel) and `WHOP_COMPANY_ID`.
2. Add a webhook `https://keplar.one/api/webhooks/whop` for `payment.succeeded`,
   `membership.activated`, `membership.deactivated`, `refund.created`,
   `dispute.created`; put its secret in `WHOP_WEBHOOK_SECRET`.
3. Set `DATABASE_URL` (Neon), `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `RESEND_API_KEY`.
4. Buy Plus once, confirm `/account` shows Plus, then refund it and confirm Free.

### Limit extensions (buy more at a limit)

When a Lite/Plus/Pro account hits its monthly credits or a rolling 5-hour/weekly window, the limit card in chat offers **Buy more** (a
small or medium credit pack) next to **Upgrade**. Free is told plainly there is nothing to buy (it uses free models only) and gets the
upgrade; Business and admin have no packs.

- **Products (founder creates these in Whop; existing plans are not edited).** Two *separate one-time* products/plans, each a single
  payment with no renewal and no trial: "Keplar Credits Small" and "Keplar Credits Medium". Suggested price points that keep the same
  margin as Plus ($45 for 6,000 credits is $0.0075/credit): Small 1,500 credits at $12, Medium 4,000 credits at $30. Copy each plan id
  (`plan_...`) into Vercel as `WHOP_EXTENSION_PLAN_SMALL` and `WHOP_EXTENSION_PLAN_MEDIUM`. The credits each pack grants are
  `KEPLAR_EXTENSION_CREDITS_SMALL/MEDIUM` (defaults 1,500 / 4,000); keep them in step with the price you set on the Whop plan. Optional
  `KEPLAR_EXTENSION_PRICE_USD_SMALL/MEDIUM` only changes the price text on the button. The existing webhook already delivers
  `payment.succeeded`, `refund.created`, `dispute.created`; add nothing else.
- **Unset plan id = unavailable.** The pack is not offered; the card says extra credits are not on sale yet and still offers Upgrade.
- **Checkout** `POST /api/billing/extensions {pack}`: signed-in, verified, same-origin, rate limited, paid plans only. It opens a Whop
  checkout for the pack's own plan id; the browser never picks the price or credit amount.
- **Grant** only from the verified webhook: `payment.succeeded` whose Whop plan id is a pack's plan id and status is paid. Idempotent by
  payment id (and webhook-id). It never changes the subscription (tier, period, status). A payment for an email with no Keplar account
  grants nothing and emails the owner.
- **Ledger** `limit_extensions` (one row per payment, kept on account deletion as a financial record): credits, remaining, expiry
  (`KEPLAR_EXTENSION_VALID_DAYS`, default 90). Spent soonest-expiring first, and only for the part the plan allowance or the tighter
  window cannot cover; that part is not counted against the monthly credits or the window. Refund/dispute zeroes the unspent remainder and
  leaves the plan alone.
- **Cost caps still apply:** per-request cost cap, usage cooldown, global breakers/pauses, daily spend caps and fan-out limits are checked
  before extension credits are considered.
- **Meter:** the sidebar card shows "+N extra credits - until <date>" beside the plan's own percentage; `/api/compute` returns
  `extension: {balance, expiresAt, latestGrantAt, grants}`.

## 4. Env vars
See `.env.example` § "Accounts, protections, billing".

## First-run onboarding (CP-11a)

A five-step flow at `/welcome` (about a minute, every step skippable, progress saved so a refresh resumes) for **new accounts only**.

**Who sees it.** `keplar_users.onboarding_required` is set when `upsertUser` creates a row (`firstRun`, default true). Every row that existed before the migration gets `false` (the `ADD COLUMN ... DEFAULT false` backfill) and the legacy-session adoption path passes `firstRun: false`, so **existing accounts are never forced**. They get a quiet "Take the one-minute tour" line in the Ask empty state and a "Take the tour" button in Settings. Status (`statusOf`): `pending` (required, not started), `in_progress`, `completed`, `skipped`, `legacy` (existing account).

**How a sign-in gets there.** `afterSignInPath()` (`src/lib/onboarding/redirect.ts`) turns the post-sign-in destination into `/welcome?next=<dest>` when the account still needs the flow. It is used by password sign-in, verify-email and magic-link confirm; the Google/Microsoft buttons use `welcomePath(next)` as `callbackURL` / `newUserCallbackURL`. `/welcome` itself re-checks on the server: no session -> `/signin?next=/welcome...`; account that does not need it -> straight on to `next`. `next` is passed through the same open-redirect guard as sign-in (`afterWelcomePath`), so it can never be an auth page or off-site. `/app` has a once-per-browser-session safety net that sends a never-started new account to `/welcome`; it never traps (Skip works everywhere, `/app` stays reachable mid-flow).

**Steps.** (1) Welcome by first name + what Keplar does. (2) What will you use Keplar for: multi-select (research, writing, coding, site/app, business, learning, other) + optional role. (3) Make it yours: name, theme (Dark / Light / Auto, applied immediately), Insert-key overtype switch, Memory switch with the honest explanation (a free model picks out lasting facts; only written to `/api/memory` if the person touched it). (4) Connect an app: the real connector list with honest badges (Beta, "Needs a token", "No sign-in"); Free and Lite see "Not available on your plan" instead of a button that would fail; plus the desktop app link. (5) Done: summary + the plan line (`planLine`: Free = free models only, no credits, nothing to be charged). Only answers the person actually touched are saved.

**Data.** Columns on `keplar_users` (idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in `ensureAuthSchema`): `onboarding_required boolean default false`, `onboarding_step int`, `onboarding_started_at`, `onboarding_completed_at`, `onboarding_skipped_at` (timestamptz), `onboarding_answers jsonb` (uses, role, name, theme, insertKey, memory), `onboarding_progress jsonb` (viewedPlan, triedCreate, checklistDismissed, tourDismissed, connectSkipped). Answers are used only to suggest starter prompts and prefill settings; they live on the account row, so account deletion removes them.

**API** `/api/onboarding` (`src/app/api/onboarding/route.ts`): `GET` state + starters + checklist; `PATCH {step, answers}` saves progress; `POST {action: complete | skip | replay | progress, answers?, key?}`. Signed out is 401; writes check the Origin (403) **before** the body is read; per-workspace rate limit; strict validation (400) of step, enum answers, string lengths and progress keys. Nothing here can block `/app`: the client treats every failure as "keep going".

**After the flow.** `/app` shows a "try your first question" card with 3-4 starters chosen from the answers (site-use starters are plain chat questions, not Create tasks), and a dismissible checklist whose ticks come from real data (asked a question = a saved chat; Create = clicked through; connect an app = an MCP server exists; plan = visited Account). Replay: Settings > Getting started > "Replay onboarding" (`POST replay`).

**Without a database** (`DATABASE_URL` unset, local dev) onboarding is disabled (`enabled: false`) and sign-in goes straight to `next`.

**Particle layer.** `/welcome` uses the `onboarding` field profile and five scenes (`onb-welcome`, `onb-purpose`, `onb-prefs`, `onb-connect`, `onb-ready`). Choosing an option fires a shockwave + burst from that option; between steps 2->3 and 3->4 the field turns inward for "Personalizing your experience..." (about 1.1 s; the swarm regroups around the picks). Prefers-reduced-motion swaps the burst for a brightness fade, shortens the pause to ~0.26 s, stills the camera and uses a 0.5 s morph, but the field is never switched off. See `docs/revamp/CHECKPOINTS.md` CP-11a.

## Chats are per account (client + server)

- Server: chats, summaries (digests), memory and search are keyed by the signed-in user's workspace id; `tests/account-scope.test.ts` proves a second account cannot list, read, rename, overwrite, delete, search or erase another's data. Google, Microsoft and the email link resolve to one user per email.
- Client: `/api/compute` returns `account` (id, email, name). The app starts in scope `pending` (nothing shown), then `anon` (this device's chats, `keplar.anon.v2`) or `user:<id>`. Signed-in chat text is never cached in the browser (the server is the source of truth); the `scope` action replaces the whole list on any account change and late answers for another scope are dropped. Sign-out (menu, Account page, or detected on focus) removes every `keplar.acct.v2.*` key, the upsell key and session handoffs. The old `keplar.app.v1` store is never shown, only offered for import.
- Import: chats made before signing in stay on the device until the user answers "Import chats from this device?". Import uploads them, then removes them from the device; "Not now" is remembered per account.
- Stale tabs: browser calls send `x-keplar-account` (user id or `anon`); `/api/chats*` and `/api/keplar` answer 409 `account_changed` if the session is someone else, so nothing is written under the wrong account.
- Account menu (sidebar): current account, Switch account / Add account (sign out cleanly, then `/signin?next=/app` with Google/Microsoft `select_account`), Sign out. Several simultaneously remembered accounts are intentionally not supported.

## Webhook lifecycle (CP-7)
- Idempotency: each Whop `webhook-id` is claimed atomically (`billing_events`, result `processing`) before it is applied. Concurrent deliveries return `duplicate`; a handler error releases the claim so Whop's retry is processed; a claim stuck for more than 2 minutes is taken over.
- Events handled: `payment.succeeded` (grant/renew; renewals without plan metadata keep the stored plan; the new period resets the credit counter), `membership.activated` (upgrade/downgrade), `payment.failed` (status `past_due`, access continues until the paid period ends, owner alert), `membership.cancel_at_period_end_changed` (flag only, plan stays), `membership.deactivated`, `refund.created`, `dispute.created` (Free, signed plan cookie revoked).
- Lapse safety net: a paid plan whose recorded period ended more than `KEPLAR_PLAN_GRACE_DAYS` (default 3) ago without a renewal or cancel webhook is treated as Free (`planLapsed`).

## Telemetry retention and hourly limits (CP-7)
- `model_calls` 14 days, `system_spend_minute` 3 days, `system_hourly_use` 3 days (`KEPLAR_RETAIN_MODEL_CALLS_DAYS`, `KEPLAR_RETAIN_SPEND_MINUTE_DAYS`, `KEPLAR_RETAIN_HOURLY_USE_DAYS`). Pruned hourly by Inngest cron `ops-telemetry-retention` and opportunistically (max once an hour per instance), at most 5,000 rows per collection per run. The ledger, billing events, audit log and business data are never pruned.
- Per-provider/model hourly limits default to the environment values and are editable in /admin (Operations → Hourly limits); edits are validated, audited and stored in `ops_controls.hourly`.

## Several accounts on one device (CP-12a)

**What was wrong.** "Switch account" and "Add account" in the app only signed the current account out and sent you to
`/signin`. The device held one Better Auth session (cookies `session_token` + `session_data`, 60-day sliding), so a
second account could never exist next to the first, and the sign-in page bounced you away while signed in.

**How it works now** (`src/lib/accounts/multi.ts`, `multi-ctx.ts`, `multi-api.ts`, `/api/account/accounts`):
- The **active** account is still Better Auth's own cookies. Every other account is parked in an HttpOnly, SameSite=Lax,
  Secure (`__Secure-` on https) cookie `keplar_acct_1..4`, 60-day Max-Age. Each holds that account's raw session cookie
  values in an HMAC-signed JSON stash (key derived from `BETTER_AUTH_SECRET`). Tampered or foreign-signed stashes are ignored.
  At most 4 other accounts; the least recently used is replaced.
- Signing in by password, magic link, Google or Microsoft while another account is active calls `stashPreviousAccount`
  before the new session cookies are issued: the previous account is parked (if its session is still valid), a parked copy
  of the account now signing in is removed. Nobody is signed out. `recordSignIn` only revokes a previous session of the same user.
- `GET /api/account/accounts` lists `{active, accounts:[{slot,email,name,expired}]}` (never a token). `POST` actions: `switch`
  (swap cookies, no re-login; 409 `expired` with the email when that session was signed out/revoked/expired), `signout`
  (revokes the active session server-side, promotes the most recently used valid parked account), `signout_all` (revokes all, clears all),
  `remove` (forget one parked account). POST is same-origin only (`assertSameOrigin`), rate limited, `no-store`.
- Client: after a switch/sign-out the account caches and localStorage keys are cleared (`clearAccountCaches`) and the page does a
  full reload, so plan, credits, chats, memory and onboarding all load for the new account only. `/signin?next=/app&add=1`
  is "Add account" (no redirect away while signed in); `&expired=<email>` is "Sign in again" for one account.
- Desktop app: it is the same web app and the same cookies, so the flow is identical there (not tested on the packaged app).
- Tests: `tests/multi-account.test.ts` (stash signing, slots, real sign-ins incl. Google, switch/no data bleed, sign out one/all
  with server-side revocation, expired, forged/old stash, CSRF), `e2e/multi-account.e2e.ts` (Playwright, two real accounts:
  `npm run build` with the env in `e2e/playwright.config.ts`, then `npm run test:e2e`).

## Free plan: questions per day (CP-12a)

- Free = 50 questions per UTC day per account (signed-out visitors: per signed `keplar_dev` device cookie, plus a 150/day
  per-IP ceiling). Counted in `keplar_daily_use(key, day, used)` with one atomic `INSERT … ON CONFLICT … WHERE used < limit`
  (process memory when there is no database). Code: `src/lib/usage/daily.ts`.
- `/api/keplar` claims exactly 1 before work starts, sends `{type:"daily"}` first (the UI drops by 1 at once) and **gives the claim
  back** if no answer reached the screen (error, quality-gate `no_response`, abort, exception). At the limit: 429 `daily_limit`
  with `retry-after`, and a message with the reset time in the visitor's local clock. `/api/compute` returns `daily`, so the
  header chip ("47 of 50 left"), the account page and the server always agree and a refresh shows the same number.
- Paid plans do not use this counter; their credits are unchanged.

## Desktop app sign-in through the system browser (desktop v0.1.5+)

The desktop app (separate repo `keplarone/keplar-desktop`) no longer shows a login form. Sign in, Sign up and Add account open the user's default browser, so Google, Microsoft, e-mail and magic links work as on the website. Code: `src/lib/desktop-auth/{core,service,store}.ts`, the Better Auth plugin `src/lib/accounts/desktop-auth.ts` (`/api/auth/desktop/*`), the page `/desktop/connect`.

Protocol (PKCE-style, bound to the app instance):

1. App: `verifier` = 32 random bytes (kept in memory only). `POST /api/auth/desktop/start {challenge = base64url(sha256(verifier)), label}` -> `{rid, code, url}`. `code` is a short display code ("K7F-2QM") shown in the app and on the browser page so the person can see they approve their own request. The app opens `url` (`/desktop/connect?rid=...`) in the default browser.
2. Browser: the page redirects to `/signin?next=/desktop/connect?rid=...` when signed out. When signed in it shows the account and the code with **Connect Keplar One**, **Use a different account** (`/signin?add=1`) and **This wasn't me**. Connect calls `POST /desktop/approve` (session + our Origin required) and opens `keplar://auth?code=<one-time>&rid=<id>`.
3. App: `POST /desktop/exchange {rid, code, verifier}` -> `{ticket}`; then loads `GET /desktop/finish?ticket=...` in its own window, which sets the session cookie there (through `startSession`, so **Add account** stashes the previous account as `keplar_acct_N`).
4. Fallback when the OS does not deliver the `keplar://` link: the app polls `POST /desktop/poll {rid, verifier}` every ~2 s; once approved it receives a fresh code and exchanges it the same way.
5. `POST /desktop/cancel {rid, verifier}` (Cancel button / closing the waiting window) kills the request, and the browser can no longer approve it.

Limits: request lifetime 10 min, one-time code 2 min, ticket 60 s; every redemption is one atomic `UPDATE ... RETURNING` (a code or ticket works once); 6 wrong guesses burn the request; per-IP rate limits on every endpoint. Table `keplar_desktop_auth` (Neon/Postgres; in-memory store for tests). A stolen `keplar://` link is useless without the verifier, which never leaves the app. Failure pages: `/signin?error=desktop_link_used`.

Tests: `tests/desktop-auth.test.ts` (unit), `tests/desktop-auth-flow.test.ts` (HTTP through `auth.handler`), `scripts/desktop-auth-e2e.mjs` (the desktop app's real `SignInFlow` against a running server with Playwright as the browser: deep link, polling, cancel, Add account). The Electron shell itself is tested in the desktop repo (`test/desktop-auth.test.ts`) and must be checked on a real Windows install.

