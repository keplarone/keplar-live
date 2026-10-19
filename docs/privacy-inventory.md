# Privacy inventory: data, processors, retention, rights

The record behind the privacy policy (`src/components/legal/content/privacy.ts`). Rule: the policy may not claim anything this
inventory and the code do not do, and this inventory lists nothing the code does not store. Reviewed yearly and whenever a store
changes (the PR template asks). Owner: team@keplar.one. Last revised Oct 17, 2026.

## 1. Processing inventory

| Data | Where | Why (purpose) | Lawful basis (where GDPR applies) | Classification | Retention |
|---|---|---|---|---|---|
| Email address, name, sign-in method, verified-at | `keplar_users`, `keplar_credentials` | Account, sign-in, notices | Contract | Confidential | Until deletion (14-day grace, then purge) |
| Password hash (scrypt), TOTP secret and recovery codes (sealed), passkey public keys | `keplar_credentials`, `keplar_mfa`, passkey tables | Authentication | Contract | Restricted | Until removed by the user or account deletion |
| Session rows: id, user, created, last seen, user-agent, hashed IP and network, provider | `keplar_sessions` | Sign-in security, device list, new-device notices | Legitimate interest (security) | Internal | Expiry + 30 days, then pruned |
| Chats, answers, memory items, uploaded documents and extracted text, study guides, slides | `keplar_rows` (tenant-scoped collections) | The product | Contract | Confidential | Until the user deletes them or the account is deleted |
| Generated sites, apps, images, app end-user rows and uploads | `keplar_rows`, `app_*` tables | The product; publishing on the user's behalf | Contract | Confidential (published parts Public) | Until deleted; app files with the app |
| Billing status: plan, period, membership id, manage URL, credits ledger, top-ups | workspace rows, `billing_events`, ledger collections | Plans and credits | Contract, legal obligation (accounting) | Confidential | Ledger and billing events kept for accounting (7 years policy); the rest with the account |
| Connector tokens (OAuth, MCP bearer, Plaid, mobile store credentials) | sealed blobs in `keplar_rows` | Acting in connected tools on the user's instruction | Contract | Restricted | Until disconnected or account deletion |
| Business CRM: contacts, deals, activities, inbox messages, leads from customer sites, agent runs, approvals, audit log | `keplar_rows` per workspace | Keplar Business | Contract (the customer is controller for their contacts) | Confidential | Until the customer deletes them or the workspace is deleted |
| Operational telemetry: model calls (model, cost, latency, hashed account), spend minutes, hourly use, flight records | system collections | Cost control, reliability | Legitimate interest | Internal | 14 / 3 / 3 days (`src/lib/ops/retention.ts`) |
| Security events: kind, code, route, hashed IP, hashed account, request id | `security_events` | Detecting attacks, incident response | Legitimate interest (security) | Internal | 90 days |
| Admin audit log | `admin_audit` | Accountability for operator actions | Legitimate interest | Internal | 90 days shown; rows kept |
| Error reports (scrubbed message, fingerprint, route) | `errors` collection, optional Sentry | Fixing bugs | Legitimate interest | Internal | Per retention job |
| Visit counts (anonymous daily code, page, referrer type) and presence heartbeat | `visits` | Admin traffic card | Legitimate interest (no personal data) | Internal | Days |
| Consent-gated analytics (Vercel Web Analytics, first-party funnel events: page, source type, milestone, random device id) | Vercel; `seo_events` | Measuring the public site | Consent | Internal | 180 days |
| Daily subscription snapshot: plan and billed monthly price per paying account, the account under a keyed hash (no id, no email) | `growth_sub_daily` | Revenue retention and churn for the internal Command Center | Legitimate interest (business reporting) | Internal (admins only) | Kept as a billing aggregate, like `billing_events` |
| Whop Pixel (visits to public marketing pages) | Whop | Ad measurement | Consent where required; disclosed | Internal | Whop's policy |
| Feedback, support tickets, abuse reports, "report this answer" | collections + email copy to team@keplar.one | Support and safety | Legitimate interest | Confidential | Until handled; deleted on request |
| Emails sent (magic links, notices) | Resend | Delivery | Contract | Confidential | Resend's log retention; Keplar keeps no body unless dev tools |

Not collected: payment card numbers (Whop/Stripe only), precise location, advertising identifiers beyond the Whop Pixel on marketing
pages, biometric data (passkeys use the device's own check; Keplar sees a public key), raw IP addresses in any durable row (hashed only).

## 2. Processors and sub-processors

| Processor | Purpose | Data | Region | Agreement |
|---|---|---|---|---|
| Vercel | Hosting, edge, logs, analytics (consent) | Everything in transit, logs with request ids | US (iad1) and edge | Vercel DPA (accepted in account; standard contractual clauses included) |
| Neon | Postgres database | All stored data above | US | Neon DPA (standard terms) |
| Resend | Transactional email | Email address, message | US | Resend DPA |
| Whop | Payments, checkout, ad pixel | Email, plan, payment (Whop holds cards) | US | Whop terms; merchant of record handles PCI |
| Stripe | Business seller payments, bank linking | Seller business details, bank tokens (Stripe holds) | US | Stripe DPA |
| OpenRouter, OpenAI, NVIDIA | Model inference | Prompts and attachments the user sends | US | Provider terms; "no training on API data" settings and OpenRouter's no-collect routing flag where available (`src/lib/privacy/training-statement.ts`) |
| Higgsfield | Image and video generation | Prompts, reference images | Provider | Provider terms |
| Google, Microsoft | Sign-in; connectors (Gmail, Calendar) | Profile claims; mailbox data on the user's instruction | Provider | Provider terms; OAuth scopes minimal |
| Slack, GitHub, Notion, Linear, Plaid, user-chosen MCP servers | Connectors, on the user's instruction | What the user's agent reads or writes | Provider | Provider terms; the user chooses to connect |
| Inngest | Background jobs | Workspace and job ids, no content | US | Inngest terms |
| Upstash (when configured) | Shared rate limiter | Hashed keys and counters | US | Upstash terms |
| Sentry (when configured) | Error forwarding | Scrubbed errors | US | Sentry DPA |

**International transfers**: processing is in the United States; the privacy policy says so ("International processing"). For EU/UK users
the transfer mechanism is each processor's standard contractual clauses in its DPA. Keplar has no EU establishment; a representative is
a legal decision listed in `docs/legal-open-decisions.md`.

**DPAs**: the table says which processor offers one. Accepting each DPA in the provider's dashboard is an owner action; record the date
here when done: Vercel —, Neon —, Resend —, Stripe —, Sentry —.

## 3. Retention schedule (enforced in code)

| Data | Rule | Code |
|---|---|---|
| Account and everything it owns | Deleted 14 days after the request (cancelable), or immediately on request | `src/lib/privacy/deletion.ts`, `src/lib/privacy/account-data.ts` |
| Team workspace | Deleted by the owner after export; members just leave | `src/lib/team/store.ts` |
| Sites and apps | Deleted with grace and slug holds against squatting | `src/lib/site-builder/deletion.ts` |
| Sessions | Expire (idle 30 days, absolute 180 days, remembered 60-day sliding), pruned 30 days after expiry | `src/lib/accounts/persist.ts` |
| Telemetry | 14 / 3 / 3 days | `src/lib/ops/retention.ts` |
| Security events | 90 days | `src/lib/security/events.ts` |
| Analytics funnel events | 180 days | `src/lib/seo/events.ts` |
| Magic, verify, reset, secure links | 15 min / 24 h / 30 min / 7 days, single use | `src/lib/accounts/action-token.ts`, `magic-token.ts` |
| Backups (scripted export) | Keep newest 14 (`--keep`), encrypted with a passphrase | `scripts/backup-db.mjs` |

What Keplar cannot shorten: the database host's own backups after a deletion (stated in the privacy policy), the email provider's logs,
and model providers' retention (disclosed).

## 4. Rights and requests

- **Export**: Account → Download my data (JSON, everything in the inventory that belongs to the account, secrets redacted; needs a
  recent sign-in). `src/app/api/account/export/route.ts`.
- **Deletion**: Account → Delete account (typed confirmation, 14-day grace, email notice, admin accounts refused, active subscription
  must be cancelled first). `src/app/api/account/delete/route.ts`.
- **Correction**: name and preferences in Account; email changes by signing in with the new address (same person, same workspace rules).
- **Objection / restriction / portability by email**: team@keplar.one. Procedure: verify the requester by sending a signed link to the
  account's address (never act on an email alone), act within 30 days, log the request in the admin inbox, and reply with what was done.
- **Access requests about someone else's data in a customer's Business workspace**: the customer is the controller; Keplar forwards the
  request to the workspace owner and assists.

## 5. Consent and cookies

Essential cookies only by default (session, plan, consent choice, language hint). Analytics loads only after "Accept all" or a
customised choice; "Reject non-essential" and the footer's Cookie settings work on every page; Global Privacy Control and Do Not Track
are honoured as a rejection (`src/lib/consent.ts`, `src/components/consent/CookieBanner.tsx`, `tests/consent.test.ts`). The Whop Pixel
loads on marketing pages only and is disclosed in the policy.

## 6. Children

Terms require 13+, and under-18 use with a parent or guardian. The safety screen and Family mode apply teen-appropriate defaults; the
product is not directed at children and makes no COPPA/GDPR-K claim. Purchases by minors are an open legal decision
(`docs/legal-open-decisions.md`).

## 7. Breach notification

`docs/runbooks/security-incident.md` §Notify: assess within 24 hours whether personal data was exposed; where GDPR applies, notify the
supervisory authority within 72 hours of becoming aware and affected users without undue delay when the risk is high; for US users
follow the state laws that apply to the data involved. Every notice says what happened, what data, what Keplar did, what the person
should do, and how to reach us. A legal review of the notice before sending is required (not automated).

## 8. Privacy impact assessments

Required for: a new model provider or a change in what is sent to one; a new connector that reads personal data from a third party
(mailboxes, CRMs); any agent capability that sends messages to people who are not Keplar users; analytics or ad measurement changes;
anything touching under-18s. The assessment is a short section in the feature's design doc: data in, purpose, minimisation, retention,
user control, residual risk, and it is linked from the PR. Done to date: connectors and agent drafts (`docs/business-os.md`,
`src/lib/business/draft-safety.ts`), Free-plan model routing (`tests/free-privacy.test.ts`), analytics (`docs/growth-marketing.md`).

## 9. Internal access and support

- Production data is reachable only through the Neon console (owner account, MFA) and the admin pages (allow-listed emails, optional
  enforced MFA). There is no impersonation or "log in as user" feature.
- Support works from the admin inbox and tickets without opening accounts; if a person asks us to look at their content, the request and
  what was looked at are written to the admin audit log, and the look is limited to what the request needs.
- Product analytics never contains customer content: funnel events carry page, source type and milestone only; model-call rows carry
  model, cost and a hashed account; the test suite fails if question text reaches an analytics row (`tests/growth-events.test.ts`).
