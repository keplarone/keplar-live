# Sharing and referral

## Chosen mechanism: a private-by-default, revocable "shared answer" link
Why this one: developers already paste AI answers into pull requests, Slack and design docs; a link that shows one answer *with who agreed and who split* is the most natural thing to share and is also the shareable form of the product's differentiator. It needs no reward, so it costs nothing and cannot be farmed. Checked first: the repo had no sharing feature (only a conversation export), so this was built new (commit d014ec2, hardened in a214257).

## What was built (live)
- **Create:** signed-in owner presses "Share" on an answer, sees exactly what goes in it, and presses "Create link". Nothing is shared before that. The question text is included only if the owner leaves it ticked.
- **What a link contains:** the written answer, how many models agreed, which models were consulted with their positions, and the disagreements. **Never:** account id, name, email, history, memory, files, other chats.
- **Page:** `/r/<random token>` (24-character token from `crypto.randomBytes`). Rendered as plain text (links not clickable), `noindex, nofollow, noarchive` and `Cache-Control: no-store` set in `src/proxy.ts`, so it is never indexable ("unless a user opts in": there is no opt-in path yet, so shared pages are never indexed). Call to action: "Ask your own question, free" with `utm_source=share`.
- **Revoke / expiry:** owner can revoke any time; the page then returns a real 404 (noindex). Links expire after 90 days. Revoked, expired and unknown links look identical (no probing).
- **Abuse controls:** sign-in required; same-origin writes; at most 25 live links and 10 new links per hour per account; per-request rate limit (60 per 10 minutes per IP and per account); size caps on every field; views are counted without IP or user agent; "Report this page" goes to `/feedback?kind=problem`.
- **Privacy classification:** `answer_shares` is a user collection, so it is included in account export and deleted with the account; verified by tests.
- **Tests:** `tests/growth-share.test.ts` (creation, field caps, revocation, expiry, 25-link cap, hourly cap, no private fields, unknown token).

## Known gaps
- No admin UI to remove a link on a user's behalf (only the owner's revoke or a database operation). Report requests arrive through the feedback form. Fix before promoting sharing widely.
- ~~No opt-in indexing path~~ Added 4 Oct 2026, see "Public answer pages" below. `/r/<token>` itself stays noindex forever; public pages live at a separate address.
- The privacy page does not yet mention shared links (privacy files belong to another workstream): see [COORDINATION.md](COORDINATION.md).
- Invitation -> activation -> payment attribution relies on the `utm_source=share` landing; there is no per-link attribution to an inviter by design (privacy). Aggregates only: links created, live, views, and signups from `utm_source=share` in `/admin/growth`.

## Tracking (all first-party, consented, no content)
Events: `share_dialog` (opened), `share_created`, and share-page views (a counter on the link, no visitor data); visitors arriving from a link carry `utm_source=share` into the consented landing funnel. The dashboard shows links created, live links and views; revocations are visible in the count of live vs created links. Payment and retention by source are read from Whop/the account records, not from events. Prompt text and answer text are never stored in events.

## Referral rewards: proposal only (not enabled)
- **Mechanism:** "Give 300 credits, get 300 credits". The referrer shares a code; the invited person gets 300 credits after verifying their email and completing a first answer; the referrer gets 300 credits when that happens.
- **Cost:** 300 credits ~ $0.55 at provider cost ($0.00182 per credit); two people ~ $1.09 per successful referral; cap 5 rewarded referrals per referrer ~ $5.45 maximum, **$6.82 including 25% abuse allowance**; a capped test of 50 referrers ~ **$341 maximum exposure**. That is new spending: needs founder authorization.
- **Eligibility:** verified email, an account at least 24 hours old, one reward per invited person (per verified email and per payment fingerprint when available), no self-referral (same device/IP/payment), no reward for Free-capacity bursts.
- **Abuse controls:** global monthly reward budget (hard stop and a plain message), rewards granted only after the invitee completes a real synthesized answer, manual review queue above 10 referrals per day, immediate stop switch.
- **Max exposure:** the monthly reward budget the founders set (suggested $50 for the first test). Credits expire in 60 days.
- **Tracking:** invitations sent, accepted, activated, paid, retained at 30/60 days. Success criterion (assumption): invitee activation >= the organic rate and no more than 20% flagged for abuse. Decision rule in [EXPERIMENTS.md](EXPERIMENTS.md).
- **Not recommended before** there are about 100 activated users, because rewards multiply an existing flow and there is no flow yet.

## Public answer pages (opt-in, added 4 Oct 2026)
- **Default stays private.** After creating a link, the owner can press **Make public** (second, separate consent checkbox; verified email required). That serves the same snapshot at `/answers/<slug>-<6 chars>` (indexable, canonical to itself), lists it on `/answers` and in `/answers-sitemap.xml` (listed in robots.txt; lastmod = day made public), gives it an OG image (`/answers/<slug>/og`, question as title) and `QAPage` + `BreadcrumbList` JSON-LD (`suggestedAnswer`, never `acceptedAnswer`: nobody verified it).
- **Sanitising:** question required (it is the title; the owner already edited it); answer >= 400 characters; refused (not silently edited) when an email, phone number, SSN-style number, Luhn-valid card number, key/secret, IP address, street address or tokenised URL is detected (`findPersonalData`); the snapshot never has account id, name, email, history, memory; plain text only, no clickable links; at most 10 public pages per account.
- **Off switches:** Make private, revoke the link, delete the account (all immediate 404 on keplar.one), or admin takedown (`PATCH /api/share {slug, takedown:true}`, final). Search engines may keep a cached copy for a while; the privacy page says so. `/r/<token>` keeps its `noindex` header regardless.
- **Index page:** `/answers` is `noindex` while it lists nothing.
- **Limits of detection:** pattern matching is a safety net, not a guarantee (names and free-text secrets are not detectable). The dialog tells the owner to re-read the page. Reports go to `/feedback`. There is still no admin list UI for public pages; takedown is by API/slug.
- Tests: `tests/share-public.test.ts`.

## Update 4 Oct 2026 (features pass)
- Rate limit on all shared pages and cards (per IP, 90/min) in `src/lib/growth/share-guard.ts`, called from `src/proxy.ts`.
- `/r/<token>/og`: per-page preview card (the question the owner chose to include + the real agreement line). The tab title and description stay generic, the page stays noindex.
- "Report this page" is an in-page dialog posting to `/api/report` (reference `shared:p:<slug>` or `shared:r:<token>`); the admin inbox shows where the page lives.
- Shared pages use the side-by-side disagreement view and, when the server-signed web source check (BETA) exists for the answer, show it. See docs/features-progress.md.
