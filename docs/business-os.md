# Business OS: commerce, CRM, inbox, agents, dashboard

Status: the dashboard, CRM, inbox, agents, approvals and audit log work on real data. Seller payments
(Stripe Connect), Gmail, Outlook, Calendar, Slack and the social scheduler show "not set up yet" until their keys exist;
nothing is simulated and no action is recorded as sent. Sheets (built-in tables) works without a third party.
Business needs a signed-in account (Plus and up for payments and agents).

Code: `src/lib/business/**` (domain + adapters), `src/app/api/business/**` (routes),
`src/components/business/**` (UI). Storage uses the same tenant-scoped `Collection` interface as Create
(`.data/keplar/biz_*.json` locally, Postgres with RLS in production — see `docs/architecture-cloud.md`).

## 1. What works today

1. A site built in Create has a contact form → `POST /api/business/forms/<projectId>` (honeypot, 5/min/IP
   rate limit, email validation) → contact + activity + inbox message + a "new" deal → the site shows
   "Thanks, your message was sent." → the **Lead follow-up** agent drafts a reply and queues it for approval.
2. Payments: Orders tab → *Set up payments* (needs STRIPE_SECRET_KEY; otherwise "not set up yet").
3. A shop's "Buy" button → `POST /api/business/checkout` → "This store isn't accepting payments yet" until Connect is wired (no
   card collected) → *Pay (test)* → order paid, contact created, inbox + activity + audit, `order.paid`
   event → back on the site with "Thanks, your order is confirmed."
4. CRM: pipeline (New → Qualified → Proposal → Won/Lost), contacts, activity timeline.
5. Agents: Lead follow-up (on `form.submitted`), Proposal reminder (weekdays 10:00 ET), Weekly report
   (Mon 9:00 ET → Slack + Sheets row), Social post (Tue/Thu 11:00 ET → social scheduler). *Run now*,
   pause/resume, kill, per-agent auto-send toggle, caps, workspace-wide **Stop all agents**.
6. Approvals: edit the draft, *Approve and send* (executes through the connector; fails with "not set up yet" if it isn't connected) or *Reject*.
7. Dashboard: revenue (test), orders, leads, site views (first-party, no cookies), agent activity, pending approvals, Usage.
8. Audit log: every owner decision, agent run, connector change, order and form submission.

Scheduled triggers are stored as cron strings (UTC) and run server-side: an Inngest cron function in
production, the same scheduler in-process in mock mode (§7). Outbound actions from scheduled runs always
wait in Approvals.

## 2. Stripe Connect recommendation

Keplar is a platform whose customers (site owners) sell to their own customers. Following Stripe's
`connect-recommend` guidance (API `2026-07-29.dahlia`, Node SDK 22.4.0):

- **Accounts v2** (`POST /v2/core/accounts`) with `dashboard: "full"`,
  `defaults.responsibilities.fees_collector: "stripe"`, `losses_collector: "stripe"`.
  The site owner is merchant of record, pays Stripe's processing fees directly, and **Stripe carries
  negative-balance liability**, not Keplar. With Stripe collecting fees there are **no Connect platform
  fees** (the platform-pays model would cost $2 per active account per month + 0.25% + 25¢ per payout).
- **Direct charges**: Checkout Sessions created on the connected account (`Stripe-Account` header), with
  an optional `payment_intent_data.application_fee_amount` for Keplar (`KEPLAR_APPLICATION_FEE_BPS`, default 0 —
  founder decision). Pass `integration_identifier`; **never pass `payment_method_types`** (dynamic payment methods).
- **Embedded components** for onboarding and management: `account_onboarding`, `notification_banner`,
  `account_management`, `payments`, `payouts`.
- Not available/allowed: `full` dashboard + application-collected fees is sales-gated; `express` + Stripe-collected is blocked.
- Use a **restricted key** (`rk_test_…` first, `rk_live_…` later) and the Connect webhook endpoint
  `/api/business/stripe/webhook` with its own secret `STRIPE_CONNECT_WEBHOOK_SECRET` (§8).
  **Do not use the live Keplar Stripe account for development. Connect is not enabled on it;** this
  integration is demo/mock only until the founder decides otherwise.

## 3. Connectors

| Connector | Live provider | Scopes | Notes / accounts |
|---|---|---|---|
| Gmail | Google OAuth | `gmail.send`, `gmail.readonly` | Restricted scopes need Google OAuth verification and an annual CASA security assessment (budget weeks, and a third-party assessor fee) |
| Google Calendar | same Google client | `calendar.events` | Sensitive scope (verification, no CASA) |
| Outlook | Microsoft Entra app, Graph | `Mail.Send`, `Mail.Read` | Needs `MS_OAUTH_CLIENT_ID/SECRET` (not yet in config) and publisher verification |
| Stripe | Connect | — | See §2 |
| Social scheduler | Self-hosted **Postiz** public API | posts | `POSTIZ_API_URL`, `POSTIZ_API_KEY`; Postiz holds each network's OAuth |
| Slack | Slack app, OAuth v2 | `chat:write` | `SLACK_CLIENT_ID/SECRET` |
| Sheets | Built-in tables in Postgres | — | No third party; export to CSV/Google Sheets later |

Tokens are encrypted at rest (AES-256-GCM with `KEPLAR_TOKEN_ENC_KEY` now; KMS envelope encryption in
production) and never returned by the API (`hasToken` only).

## 4. Agent guardrails

- **Approval by default** for every outbound action (email, Slack, social, sheet writes). Auto-send is a
  per-agent opt-in, Plus and up, still bounded by an outbound-per-day cap (over the cap → back to approval).
- **Caps per agent** (defaults): 1,500 credits/month, 24 runs/day, 20 sends/day, $3 spend/month. The
  workspace allowance is also checked before each run.
- **Only a run the owner starts by hand may auto-send.** Every other run (schedules, chat, and every event:
  `form.submitted`, `order.paid`, webhooks, inbound email) queues every outbound action for approval even when
  the agent has auto-send on. `runAgent` forces this itself for any trigger other than `manual`, and the
  queue/Inngest `agent.run` handlers also pass `{ forceApproval: true }`. No override. A public form can create a
  contact, so a contact created by a form in the last hour does not count as a "known" recipient for the AI
  Firewall (the reply is rated high risk).
- **Teammates:** auto-send and caps can be changed by the workspace owner only; approvals are decided by the owner or an admin.
- **Kill switch** per agent (irreversible; cancels its pending approvals) and **Stop all agents** per workspace.
- **Audit log** for every step. Model calls: OpenRouter (`KEPLAR_AGENT_MODEL`), system prompt forbids invented facts/prices.
- Agents per plan: Free 0, Plus 3, Pro 10, Business 50.

## 5. Usage costing for agents

`agent.run.base` $0.002 (1 unit) + `agent.step` $0.01 per model call (5 units) in mock; live charges
OpenRouter's `usage.cost`. A typical lead follow-up ≈ 6 units; weekly report ≈ 6 units; sends are $0.
Dashboard and Agents show units used this month per agent.

## 6. Accounts and keys 8club must supply

Stripe (platform account with Connect enabled, **sandbox restricted key first**, webhook secret);
Google Cloud project (OAuth client, consent screen verification, CASA for Gmail); Microsoft Entra app;
Slack app; a Postiz instance (self-host on Fly/Render or their cloud) + API key; OpenRouter key for agent
models; an Inngest app (event + signing keys). Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`STRIPE_CONNECT_WEBHOOK_SECRET`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `KEPLAR_STRIPE_MODE`, `STRIPE_CONNECT_WEBHOOK_SECRET_LIVE`, `KEPLAR_APPLICATION_FEE_BPS`,
`GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `MS_OAUTH_CLIENT_ID`, `MS_OAUTH_CLIENT_SECRET`,
`SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `POSTIZ_API_URL`, `POSTIZ_API_KEY`, `KEPLAR_AGENT_MODEL`, `KEPLAR_TOKEN_ENC_KEY`.

## 7. Agent schedules (Inngest or in-process)

Code: `src/lib/business/scheduler.ts` (logic), `cron.ts` (UTC 5-field matcher), `src/lib/inngest/` (functions),
`/api/inngest` (serve endpoint), `/api/business/agents/schedule` (status + local tick).

- **Finding due runs:** `findDueRuns()` scans active agents with a `schedule` trigger across workspaces
  (`listSystem`; Postgres: a bypass-RLS read-only role) and picks each agent's latest cron slot in the last
  15 minutes that has no final claim. Slots before the agent was created are skipped.
- **Production (Inngest):** `business-agent-schedule-tick` runs every 5 minutes and sends one
  `keplar/agent.scheduled` event per due run (event id `agentId@slot`, deduped by Inngest for 24h).
  `business-agent-scheduled-run` executes it: **retries 3** (exponential backoff by Inngest), **idempotency**
  key `agentId@slot`, concurrency 2 per workspace. Event-triggered runs (`form.submitted`, `order.paid`) go
  through `enqueue("agent.run")` → `business-agent-event-run` when Inngest is enabled.
- **Idempotency in our store too:** a claim row per `agentId@slot` (`biz_schedule_claims`: started / done /
  skipped / failed). A slot that is done or skipped never runs again, even if Inngest retries, ticks overlap
  or an event is re-sent; a crash after the run was written is detected by the run's trigger
  (`schedule:<slot>`) and not repeated.
- **Guardrails:** halt switch, agent status, per-agent caps and the workspace allowance are checked in
  `runAgent()`. Those refusals are final (claim `skipped`, no retry); unexpected errors are retried.
  Model failures inside a run are recorded on the run (status `failed`) and are not retried, so a flaky
  model can't burn caps.
- **Approvals:** outbound actions always queue for the owner (§4).
- **Audit log:** `agent.schedule.ran` / `.skipped` / `.failed` (actor `system:scheduler`), plus the usual
  `agent.run`.
- **No Inngest keys:** `/api/inngest` answers 503 and schedules run in-process with the same code and
  local retries (3 attempts, backoff): `POST /api/business/agents/schedule` (needs `KEPLAR_DEV_TOOLS=1` or
  `Authorization: Bearer $KEPLAR_ADMIN_TOKEN`; `{ "at": ISO }` to simulate a time with dev tools),
  `npm run agents:tick [-- --at 2026-09-28T13:02:00Z]` against `http://localhost:3001`, or
  `KEPLAR_LOCAL_SCHEDULER=1` for a once-a-minute timer inside the server (stops with the server).
  `GET /api/business/agents/schedule` lists each scheduled agent's next run and the active driver.
- **Local Inngest:** `INNGEST_DEV=1` + `npx inngest-cli@latest dev -u http://localhost:3001/api/inngest`
  (unsigned; never set `INNGEST_DEV` in production).
- **Going live:** create the Inngest app, set `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` on the deployment,
  then sync `https://keplar.one/api/inngest` in the Inngest dashboard. Requires the Postgres store
  (`KEPLAR_STORE=postgres`) since serverless instances don't share `.data/`.

## 7a. Scheduled agents on Vercel cron (24/7 without Inngest)

Code: `src/app/api/cron/agents/route.ts`, `src/lib/business/{schedule-limits,monitor,scheduler}.ts`, UI `src/components/app-ui/AgentsPanel.tsx`.

- **What runs:** daily brief (inbox only), page monitor (**BETA**, inbox only) and lead follow-up (drafts `email.send` approvals, needs Gmail).
  Schedules are 5-field cron plus an IANA time zone (DST-safe wall clock). Every scheduled run is claimed per `agentId@slot`, so a retry, an
  overlapping tick or a second driver never runs it twice. Nothing is ever sent without the owner's approval, even with auto-send on.
- **Vercel limits, honestly:** the project is on **Hobby**, where a cron may run **once a day** and fires anywhere in its hour (up to ~59 min late). So
  without Inngest, scheduled agents are checked once a day (`5 13 * * *`, `/api/cron/agents`, `CRON_SECRET` bearer) and the cron looks back
  24 h (`KEPLAR_AGENT_CRON_WINDOW_MINUTES`, default 1440 when Inngest is off) so a daily 8:00 job still runs. A schedule finer than daily would
  therefore run only once a day on Hobby; the Agents page states this (`effectiveCadence`) instead of promising minutes.
  On **Pro** set a faster cron in `vercel.json`, `KEPLAR_VERCEL_CRON_MINUTES=5` and `KEPLAR_AGENT_CRON_WINDOW_MINUTES=15`. With
  `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY`, Inngest ticks every 5 min (window 60 min) and the Vercel cron is a safety net.
  The route stops at a 90 s budget (`maxDuration` 120) and defers the rest to the next tick (`deferred` count); `/api/cron/agents` writes a
  heartbeat shown in admin health (`agents`, stale after 30 h).
- **Plan limits (per workspace):** Free and Lite: no agents (so the Free shared pool is never touched by an agent); Plus 3 agents, daily at most, 12 scheduled
  runs a day; Pro 10, hourly, 96 a day; Business 50, every 15 min, 480 a day. Saving a faster schedule than the plan allows is refused with an upgrade
  hint; if a plan drops, due runs are claimed `skipped` (reason `plan`, audited) rather than run. Per-agent caps, workspace allowance and the kill
  switch from §4 still apply on every run.
- **Monitor (BETA):** fetches one public page (SSRF-safe, robots/`noai` respected, 1 request per run), compares text lines, optional keyword. It does not run JavaScript,
  log in or watch pages behind a login.
- **COMING SOON:** emailing/Slack-posting a brief (would be a draft awaiting approval like everything outbound).

## 8a. Stripe Connect setup

What is built (all behind "Not configured" states until the env vars below exist):
`POST /api/business/payments` creates the Accounts v2 connected account (idempotent per workspace),
`POST /api/business/payments/onboarding` returns a Stripe-hosted v2 Account Link (onboarding, or update once
active; returns to `/app?stripe_connect=return`), `POST /api/business/payments/refresh` re-reads the account,
`GET /api/business/payments[?details=1]` returns status, missing env names, webhook URL/events and the account's
balance and latest payouts. Public "Buy" buttons post to `/api/business/checkout`, which creates a **direct
charge** Checkout Session on the connected account (`Stripe-Account` header, `application_fee_amount` from
`KEPLAR_APPLICATION_FEE_BPS`, dynamic payment methods, order id in session + PaymentIntent metadata).
Orders and revenue (net of refunds, plus platform fees) show in Business → Orders / Overview.

Env (Vercel → Project → Settings → Environment Variables, Production + Preview):
- `KEPLAR_STRIPE_MODE`: `test` (default; anything but `live` is test) or `live`. The mode is explicit, never guessed from the key.
- `STRIPE_SECRET_KEY`: secret key `sk_…` or restricted key `rk_…` (Connect + Checkout + Balance/Payouts read) **of the same mode**
  (`…_test_…` in test, `…_live_…` in live). A mismatch keeps payments off: sellers see "Not configured", admins see the exact reason on the Payments card.
- `STRIPE_CONNECT_WEBHOOK_SECRET` (test mode) / `STRIPE_CONNECT_WEBHOOK_SECRET_LIVE` (live mode): signing secret(s) `whsec_…` of that
  mode's endpoint(s), comma-separated when you have both a snapshot and a thin destination. Live events are verified only against the
  `_LIVE` secrets and test events only against the test secrets, so a test secret can never forge a live event.
- `KEPLAR_APPLICATION_FEE_BPS` (optional): Keplar's fee in basis points, e.g. `250` = 2.5%. Hard-capped at 1000 (10%) in code, and never the whole sale.
- `KEPLAR_MIN_ORDER_CENTS` / `KEPLAR_MAX_ORDER_CENTS` (optional): order size limits in minor units; defaults 50 and 200000 ($0.50 to $2,000). Currencies: USD, EUR, GBP, CAD, AUD.
- `KEPLAR_PAYMENTS_DISABLED=1` (optional kill switch): refuses new checkouts at once, even if the database is down. The admin page
  also has **Pause seller payments** (cached up to 5 s per instance). Existing orders, refunds and webhooks keep working.
- `NEXT_PUBLIC_SITE_URL` (already set): origin used in success/cancel/return URLs.

Webhook (Stripe Dashboard → Developers → Event destinations, **test mode**):
1. Destination 1, "Connected accounts", snapshot payload, URL `https://keplar.one/api/business/stripe/webhook`,
   events: `account.updated`, `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `checkout.session.expired`, `payment_intent.succeeded`,
   `payment_intent.payment_failed`, `charge.refunded`, `charge.dispute.created`.
2. Destination 2, "Connected accounts", **thin** payload, same URL, events: `v2.core.account.updated`,
   `v2.core.account.closed`, `v2.core.account[requirements].updated`, `v2.core.account[configuration.merchant].updated`,
   `v2.core.account[configuration.merchant].capability_status_updated`.
Tests: `tests/connect-live.test.ts` (fake Stripe client), `tests/connect-webhook.test.ts` (signatures, events).

## 8. Stripe Connect webhooks

Endpoint `POST /api/business/stripe/webhook`; logic `src/lib/business/connect-webhook.ts`; fixtures
`src/lib/business/connect-fixtures.ts`; tests `tests/connect-webhook.test.ts`. Keplar's own subscription
webhook is separate (`/api/stripe/webhook`, `STRIPE_WEBHOOK_SECRET`, docs/accounts-billing.md).

- **Verification:** raw body + `Stripe-Signature` checked against `STRIPE_CONNECT_WEBHOOK_SECRET` (its own
  secret; comma-separate several for the snapshot "Connected accounts" destination and the thin v2
  destination). Unset → 503; missing/invalid signature → 400. Snapshot events use
  `webhooks.constructEvent`, thin v2 events (`object: "v2.core.event"`) use `parseEventNotification`.
- **Modes never mix:** the app mode is `KEPLAR_STRIPE_MODE`. An event is verified against the secrets of its own mode
  (`event.livemode`). A genuine event of the other mode is acknowledged (200, `ignored: livemode_not_allowed` /
  `test_event_in_live_mode`) and not applied; an event whose connected account is of another mode is ignored
  (`mode_mismatch`). Connected accounts, orders (`livemode`), stored events and revenue all carry their mode, and every
  view filters by the current mode (test data stays in the database, invisible in live).
- **Accounts (v2):** `v2.core.account.updated`, `.closed`, `[requirements].updated`,
  `[configuration.merchant].updated` / `.capability_status_updated` (thin → the Account is re-fetched with
  `include: configuration.merchant, requirements`; mock mode reads fixture snapshots), plus v1
  `account.updated`. Updates the ConnectAccount's status (onboarding / active / restricted), charges,
  payouts and requirements due; audit `stripe.account.updated` on change.
- **Payments (direct charges):** `checkout.session.completed` / `.async_payment_succeeded` → order paid
  (created first if the session didn't start in Keplar, e.g. a Payment Link), contact, inbox, activity,
  audit, `order.paid` for agents. `.async_payment_failed` / `.expired` → pending order cancelled.
- **Refunds:** `charge.refunded` → cumulative `refundedAmount`; status `refunded` when full. Dashboard
  revenue is net of refunds. `charge.dispute.created` → inbox + audit.
- **Idempotency:** every event id is stored in `biz_connect_events` (processing / processed / ignored /
  failed). Processed or ignored events are skipped on replay; a failed event returns 500 and is re-processed
  when Stripe retries; a concurrent duplicate delivery gets 409. Order and refund updates are also
  state-idempotent. Events must come from the connected account linked to a workspace (`account` /
  `context`), otherwise they are ignored.
- **Mock fixtures:** `fixtures.*` builds Stripe-shaped events and `signFixture(event, secret)` signs them, so
  you can replay against a running server with the same secret. With a sandbox:
  `stripe listen --forward-connect-to localhost:3001/api/business/stripe/webhook` and
  `stripe trigger checkout.session.completed --stripe-account acct_…`.
- **Not done / founder:** enabling Connect on a Stripe account (sandbox first), creating the Connect event
  destinations and their secrets, and the decision to ever process live Connect events.

## 8b. Go-live checklist (real money)

Default stays **test** until every step below is done. Nothing in the code flips by itself.

**In Stripe (live mode)**
1. Activate the Stripe account (business details, bank account, identity) so it can take live payments.
2. Enable **Connect** in live mode and complete the platform profile / review Stripe asks for (Settings → Connect → Platform profile:
   what sellers sell, who is merchant of record, loss liability, prohibited-business policy). Sellers are the merchant of record; the
   platform is Keplar. Wait for Stripe's approval.
3. Create the live API key: a restricted key `rk_live_…` is preferred (Connect/Accounts v2 write, Checkout Sessions write,
   Balance + Payouts read, PaymentIntents + Charges read) or the secret key `sk_live_…`.
4. Developers → Event destinations (live mode): create **two** destinations on "Connected accounts" with URL
   `https://keplar.one/api/business/stripe/webhook`, one snapshot with `account.updated`, `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`,
   `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `charge.dispute.created`, and one **thin** with
   `v2.core.account.updated`, `v2.core.account.closed`, `v2.core.account[requirements].updated`,
   `v2.core.account[configuration.merchant].updated`, `v2.core.account[configuration.merchant].capability_status_updated`.
   Copy both signing secrets.
5. Keep the test-mode destinations: they are harmless in live (test events are verified, then ignored).

**In Vercel (Production env), then redeploy**
6. `STRIPE_SECRET_KEY` = the live key. `STRIPE_CONNECT_WEBHOOK_SECRET_LIVE` = `whsec_snapshot,whsec_thin`.
   `KEPLAR_STRIPE_MODE` = `live`. Optional: `KEPLAR_APPLICATION_FEE_BPS`, `KEPLAR_MIN_ORDER_CENTS`, `KEPLAR_MAX_ORDER_CENTS`.
   Env changes only apply to new deployments: redeploy production.
7. Check: signed in as admin, Business → Orders shows the Payments card with **Live** and no "Admin:" problem line. A bad-signature POST to
   the webhook returns 400 (not 503).

**First live sale (use your own account)**
8. Create a seller workspace, **Set up payments** (a new live connected account is created; test accounts are separate), finish Stripe's
   hosted onboarding, wait for "Accepting payments".
9. Publish a shop with a $1 product, buy it with a real card, confirm the order turns **paid**, the contact/inbox entry appears, revenue
   updates, Stripe shows the application fee, then refund it in the seller's Stripe Dashboard and confirm the order shows refunded.
10. Rehearse the kill switch: admin page → Pause seller payments (or `KEPLAR_PAYMENTS_DISABLED=1` + redeploy): the Buy button must answer
    "Payments are paused" and no Checkout Session is created. Resume.

**Rollback:** set `KEPLAR_STRIPE_MODE` back to `test` (or remove the live key) and redeploy; or pause payments instantly from the admin page.
Live records stay in the database and reappear when live is switched on again.

**Seller-facing copy** (Payments card): the seller is the merchant of record and is responsible for taxes, refunds, disputes and the
law for what they sell; Keplar is not the merchant of record and gives no tax or legal advice; links to Terms and Privacy. Order
limits are shown. Terms/Privacy already name Stripe for sellers; legal review of the seller terms is still the founder's call.

## 9. Connected apps (MCP)
Agents can use tools from user-connected MCP servers via the `mcp.call` action and the `mcp-task` template; the firewall treats it as high risk unless the tool is marked read. See `docs/mcp.md`.
