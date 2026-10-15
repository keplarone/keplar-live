# Keplar One platform audit (Project Rebirth, Phase 1)

Scope: keplar-live (`main` at `982ecf5`, ~261k lines of TypeScript, 296 `/api` route files plus 25 other route handlers,
~140 pages, 375 unit-test files, 50 e2e files) and the Keplar One desktop app (keplar-desktop `00a6c4c`, v0.2.3).
Method: seven independent read-only reviews (authentication; authorization and tenancy; input handling and browser security;
AI agents and tool execution; performance, reliability and supply chain; features, UX and accessibility; desktop app), each
required to cite file and line for every finding and to list the controls it verified. High-severity findings were re-checked
by reading the code before any fix. Nothing here is a production penetration test: no request was sent to keplar.one.

Status values: **Fixed** (merged with a regression test), **In progress**, **Open**, **Accepted** (documented residual risk).
This file is updated as fixes land; the commit that fixed each item is listed in its row.

## Summary

| Area | Critical | High | Medium | Low / info |
|---|---|---|---|---|
| Authentication and sessions | 0 | 2 | 3 | 7 |
| Authorization and tenancy | 0 | 3 | 1 | 3 |
| Input handling and browser security | 0 | 0 | 3 | 7 |
| AI agents and tool execution | 0 | 0 | 8 | 7 |
| Performance, reliability, supply chain | 0 | 9 | 10 | 10 |
| UX and accessibility | 0 | 5 | 8 | 6 |
| Desktop app | 0 | 1 | 3 | 16 |

No critical issue (remote code execution on the server, mass data exposure, auth bypass without any credential) was found.
The core controls are strong: tenant scoping in the store, a shared SSRF guard with pinned DNS, sandboxed user content on opaque
origins, signed and idempotent payment webhooks, an edge CSRF guard, a well-built MCP gateway, and honest product states (no fake
live data found anywhere).

## Authentication and sessions

| ID | Sev | Finding | Where | Status |
|---|---|---|---|---|
| AUTH-1 | High | A session id with no database row is adopted as fully valid; with row pruning and the 60-day cookie envelope this allows a 2FA bypass, un-revoking a revoked session, and recreating a deleted account. | `src/lib/accounts/persist.ts:138,155,165-172`, `auth.ts:66`, `privacy/account-data.ts:204` | **Fixed** (51aa28c) |
| AUTH-2 | High | Better Auth's ID-token social sign-in creates a session without the 2FA gate or session record. | Better Auth `sign-in.mjs:154-200`; `src/lib/accounts/oauth.ts:71-86` | **Fixed** (51aa28c) |
| AUTH-3 | Low | Unused built-in Better Auth endpoints are reachable and re-issue cookies without `guardSession` (enabler for AUTH-1). | `src/lib/accounts/auth.ts:47-116` | **Fixed** (51aa28c; `/reset-password/:token` stays, it creates no session) |
| AUTH-4 | Medium | Pre-account hijack: an attacker's password can be attached to an existing account when the victim clicks an unsolicited verification email. | `src/lib/accounts/credentials.ts:244-253`, `password-auth.ts:148-150,191-203` | **Fixed** (51aa28c) |
| AUTH-5 | Medium | Adding a passkey, enabling 2FA, regenerating codes, immediate deletion, data export and API-key creation need no recent re-authentication. | `src/app/api/account/{passkeys,mfa,delete,export}/route.ts`, `/api/keys` | **Fixed** (51aa28c) |
| AUTH-6 | Medium | Desktop/extension sign-in can be used for phishing and login CSRF (finish ticket not bound to the starting browser). | `src/lib/accounts/desktop-auth.ts:169-175,214-225` | **Fixed** (d62f3d9: the browser must type the code the app shows, never shown on the page; `/desktop/finish` refuses links from other sites and, for Keplar One, any browser but the desktop window; the extension's approval needs a recent sign-in. No desktop app change needed) |
| AUTH-7 | Low-Med | Magic-link rate limits are per serverless instance. | `src/lib/accounts/stateless-magic-link.ts:76-78` | **Fixed** (51aa28c) |
| AUTH-8 | Low | `localhost` origins are trusted in production. | `src/lib/accounts/auth.ts:71` | **Fixed** (51aa28c) |
| AUTH-9 | Low-Med | TOTP brute force is slowed (8/10 min) but never blocked, and the owner isn't told. | `src/app/api/account/mfa/route.ts:42-49,95-111` | **Fixed** (41880ce: 8 wrong codes in an hour lock every code for the rest of the hour and email the owner once) |
| AUTH-10 | Low | No email for 2FA, passkey, recovery-code or API-key changes. | `mfa/route.ts`, `passkeys/route.ts` | **Fixed** (51aa28c) |
| AUTH-11 | Low | New-device detection compares only the user-agent label. | `src/lib/accounts/new-device.ts:17-21` | **Fixed** (a91c47f: a keyed hash of the IPv4 /16 or IPv6 /32 is kept per session; a known browser on a never-seen network emails, at most once a day) |
| AUTH-12 | Low | Per-email limits let anyone lock a sign-in method for 15 minutes. | `password-auth.ts:166` | **Fixed** (310f346: per-address budgets per network, ceilings of 60 passwords/15 min and 6 links/10 min; sign-up, resend and forgot-password keep their per-address caps, which only limit emails) |

## Authorization and tenancy

| ID | Sev | Finding | Where | Status |
|---|---|---|---|---|
| AZ-1 | High | Anyone, signed out, can permanently take down any published site or project with a CSAM/NCII report; there is no restore path for sites. | `src/app/s/[slug]/[[...path]]/route.ts:289-299`, `src/app/api/create/abuse/route.ts:40-54`, `site-builder/store.ts:345` | **Fixed** (05e3377; policy awaiting owner confirmation) |
| AZ-2 | High | Business teammates with the Editor role can set up the owner's Stripe payouts, approve the owner's outbound actions, turn on auto-send and (as Viewers) read bank data; audit logs record them as "owner". | `src/lib/business/team.ts:27-50`, `api/business/payments/*`, `approvals/[id]`, `agents/[id]`, `banks` | **Fixed** (a1876c6) |
| AZ-3 | High | In apps built on Keplar, signing up with the creator's email (unverified) grants app admin. | `src/lib/app-runtime/auth.ts:66-80,94-99` | **Fixed** (4934317; admins created earlier keep the role) |
| AZ-4 | Medium | Encoded-slash path traversal in the blob route allows cross-tenant media reads on the same instance. | `src/app/api/create/blob/[...key]/route.ts:16-19`, `create/platform/blob.ts:20-24` | **Fixed** (dd88bfa) |
| AZ-5 | Low | Collab viewers can sign in as anyone in an app's draft environment. | `src/app/api/collab/[id]/route.ts:42`, `app-runtime/router.ts:103-109` | **Fixed** (99b6611: viewers get a look-only preview token; it never returns sign-in links) |
| AZ-6 | Low | Two admin actions skip the admin 2FA requirement. | `src/app/api/templates/route.ts:67`, `src/app/api/share/route.ts:78` | **Fixed** (4f414d2) |
| AZ-7 | Low | Public form and checkout endpoints accept unpublished projects. | `api/business/forms/[projectId]/route.ts:14`, `business/commerce.ts:25` | **Fixed** (3f89153) |

## Input handling and browser security

| ID | Sev | Finding | Where | Status |
|---|---|---|---|---|
| IN-1 | Medium | Keplar Browser re-resolves DNS after the address check (DNS rebinding to loopback/private services); page WebSockets bypass the request guard. | `src/lib/browser/run.ts:25,32-46,59` | **Fixed** (667a874) |
| IN-2 | Medium | Apple in-app purchases from Apple's Sandbox (free) grant real paid plans in production. | `src/lib/billing/apple.ts:54-58,142`, `apple-sync.ts:76` | **Fixed** (667a874) |
| IN-3 | Low | The API edge guard (rate limit, CSRF backstop) is skipped for `/api` on docs.keplar.one and space.keplar.one. | `src/proxy.ts:78,106` | **Fixed** (667a874) |
| IN-4 | Low | space.keplar.one pages miss CSP, frame rules and HSTS. | `next.config.ts:7` | **Fixed** (667a874) |
| IN-5 | Low | App CSP allows `'unsafe-inline'` scripts, and `'self'` includes user-authored app JavaScript under `/s/`. | `src/lib/security/headers.ts:26`, `app-builder/files.ts:150-160` | **Accepted** for `'unsafe-inline'` (Next's per-render inline flight scripts on static pages; a nonce needs every page dynamic; reasons in `headers.ts`). **Fixed** for `'self'` (000ca97: the proxy refuses same-origin script/worker loads of `/s/`, `/sites/`, `/apps/`) |
| IN-6 | Low | Site QA browser has no network allow-list. | `src/lib/site-builder/qa/run.ts:31-43` | **Fixed** (15bdeb2: Keplar Browser's SSRF guard; own origin passes) |
| IN-7 | Info | Revenue Guard (not wired) would verify sites with an unguarded fetch. | `src/lib/business/guard/core.ts:89-138` | **Fixed** (a54bd31: the unwired module is deleted; owner decided not to build Revenue Guard) |
| IN-8 | Low | Unbounded body reads before size checks; inbound-email webhook has no replay key; `/api/health/qa-browser` launches Chromium unauthenticated; `wants/browser.ts` accepts any `file:` URL; code-runner CSP lacks `sandbox`; some provider error text reaches clients. | see review | **Fixed** (f6f8b5a: streamed capped reads on 20+ routes and `body()`; inbound-email claim per Message-ID; qa-browser admins/monitoring only; Wants `file:` only its fixtures; runner CSP `sandbox`; mid-stream and `/api/health` error text generic) |

## AI agents and tool execution

| ID | Sev | Finding | Where | Status |
|---|---|---|---|---|
| AI-1 | Medium | Event-triggered agent runs (e.g. a public form submission) can auto-send email from the owner's Gmail with attacker-controlled text and links. | `business/events.ts:10`, `inngest/functions.ts:66`, `business/agents.ts:446,515` | **Fixed** (3e59286) |
| AI-2 | Medium | Approving an action isn't atomic: double clicks or retries send twice. | `business/agents.ts:474-506` | **Fixed** (422a95e; a crash between claim and send leaves the approval stuck) |
| AI-3 | Medium | The firewall's "high risk, never auto-sent" rating is ignored on the MCP auto-run path. | `mcp/chat.ts:235-246`, `mcp/gateway.ts:527-531` | **Fixed** (3aeaf87) |
| AI-4 | Medium | A tool result can steer later auto-run calls that carry conversation data to another MCP server. | `mcp/chat.ts:187-249` | **Fixed** (9a79020) |
| AI-5 | Medium | Keplar Browser can submit forms (Enter, neutral-label buttons) despite "never send/post". | `browser/policy.ts:54-64`, `browser/run.ts:165-168` | **Fixed** (cff8f5e) |
| AI-6 | Medium | Computer-use confirmation trusts the model's own "sensitive" label; vision calls aren't charged. | `business/computer.ts:136-137`, `api/business/computer/step/route.ts:50-64` | **Fixed** (d182a42) |
| AI-7 | Medium | Blender auto-approve can run Python that evades the text block-list. | `blender/agent.ts:27-38`, `studio-mode/useStudioAgent.ts:437` | **Fixed** (d439c23) |
| AI-8 | Low | Business Editors can approve irreversible sends (see AZ-2). | `business/team.ts:37-39` | **Fixed** (a1876c6) |
| AI-9 | Low | A failed approval can still mark the run "succeeded". | `business/agents.ts:505-506` | **Fixed** (422a95e) |
| AI-10 | Low | Agent draft model calls have no timeout or output cap; runs can stay "running" forever; retries can re-send. | `business/agents.ts:194-207,400-466` | **Fixed** (422a95e: 45 s timeout, 1,200-token cap) |
| AI-11 | Low | Core's code checker relies on `node:vm`, which isn't a security boundary. | `core/sandbox.ts:14-31` | Open |
| AI-12 | Low | Self-learning prompt changes are promoted without human review. | `core/selfdev/pipeline.ts:101` | **Fixed** (069f29d) |
| AI-13 | Info | Keplar Wants PIN has no lockout and non-atomic confirmation (sandbox-only today). | `wants/pin.ts`, `wants/sandbox.ts:77-96` | **Fixed** (e70f342: PIN tries limited to 10 per 15 min; dbcb47e: confirmation is one `insertIfAbsent` claim) |

## Performance, reliability and supply chain

| ID | Sev | Finding | Where | Status |
|---|---|---|---|---|
| OPS-1 | High | Merges to `main` auto-deploy, but no CI runs the tests, lint, typecheck, audit or build (only two path-filtered workflows). | `.github/workflows/` | **Fixed** (5552d24) |
| PERF-1 | High | Chat sidebar and new-chat count load every chat with every message (up to ~80 MB). | `api/chats/route.ts:21`, `api/chats/[id]/route.ts:56-60` | **Fixed** (b1c3ac7) |
| PERF-2 | High | Projects list loads all chats and files to count them. | `api/projects/route.ts:18-20` | **Fixed** (b1c3ac7) |
| PERF-3 | High | Business dashboard reads every page view ever recorded. | `business/dashboard.ts:13-19` | **Fixed** (b1c3ac7) |
| PERF-4 | High | Page views are one row per view with no cap on the legacy path; pruning deletes one row at a time. | `create/serve.ts:66`, `business/traffic.ts`, `site-builder/features/analytics.ts:98` | **Fixed** (54b3d3e: per-day counter rows by atomic upsert, ~4 rows per site-day instead of one per view; readers merge legacy rows until they age out; retention is one bulk DELETE per collection) |
| PERF-5 | High | Stripe Connect webhook scans every stored event and order; dedupe isn't atomic. | `business/connect-webhook.ts:171,210,346,351`, `business/commerce.ts:25,60` | **Fixed** (b1c3ac7) |
| PERF-6 | High | Custom-domain serving scans all domains and all projects on a miss. | `create/serve.ts:52-58` | **Fixed** (b1c3ac7) |
| PERF-7 | High | Site version handling loads every version's files on every save. | `site-builder/store.ts:151,178,390` | **Fixed** (54b3d3e: listing, pruning, counting and deleting versions read a metadata projection; a save read ~986 KB in the test fixture, now ~12 KB) |
| REL-1 | High | Media generation (and agent runs without Inngest) run as in-process `setTimeout` on serverless; jobs can stay queued forever. | `create/platform/queue.ts:18-28`, `create/media.ts:87,156-175` | **Fixed** (54b3d3e: jobs are stored rows started through `after()`, with a lease, per-run claims, max 3 attempts and a reaper on status reads and the daily cron; a video resumes polling and is never submitted twice; Inngest path unchanged) |
| REL-2 | Medium | ~10 outbound fetches have no timeout (incl. the Upstash limiter called on most API requests). | see review §3.1 | **Fixed** (8ffc937, 923654a) |
| REL-3 | Medium | Daily-only crons carry work that needs to run more often unless Inngest is configured. | `vercel.json`, cron headers | Partly fixed (54b3d3e: durable jobs are reaped on status reads and by the daily `/api/cron/domains`; page-view retention runs hourly from traffic). Still daily without Inngest: scheduled Business agents, app schedules, Core "Keep working" sweeps, model observatory, domain re-checks (owner decision: Inngest or Pro crons) |
| REL-4 | Medium | Fire-and-forget promises after the response (`void p`) can be dropped when the instance freezes. | review §6.3 | **Fixed** (54b3d3e: 28 fire-and-forget or response-blocking background writes in 20 files moved to `after()` via `keepAlive`/`afterResponse`; remaining `void` uses are inside streams, client code or handled-rejection markers) |
| REL-5 | Medium | Production silently uses a random per-instance auth secret if `BETTER_AUTH_SECRET` is missing. | `accounts/secret.ts:14-17` | **Fixed** (923654a: health check fails, no hard stop) |
| REL-6 | Medium | Recipient emails are logged; every outgoing mail is stored with no retention. | `accounts/outbox.ts:27-30` | **Fixed** (923654a) |
| PERF-8..12 | Medium | Sequential awaits before first byte on chat; DDL on every cold start; N+1 in teams; collab long-poll load; per-instance rate limits without Upstash. | review §2-5 | Partly fixed (54b3d3e: chat pre-stream reads in parallel, 13 sequential database round trips to 8; schema DDL skipped once a version marker row matches, 11 statements to 1 read per cold start). N+1 in teams, collab long-poll load and per-instance rate limits open |
| SUP-1..6 | Low | Actions pinned by tag; no Dependabot; Playwright traces committed; unmaintained `pdf-lib`; outdated patches (`next`, `better-auth`); vendored code without hashes. | review §1 | Partly fixed (5552d24: Dependabot, CI actions pinned by SHA, traces untracked); `pdf-lib`, patches and vendored hashes open |

## UX and accessibility

| ID | Sev | Finding | Where | Status |
|---|---|---|---|---|
| UX-1 | High | "Manage" connected apps in Keplar One sends people to the Business sales page. | `ChatTools.tsx:58`, `KeplarApp.tsx:837,1320` | **Fixed** (d972c56: Connected apps open in the app at `/app/apps`; MCP sign-ins return there) |
| UX-2 | High | Keplar Browser and Keplar Wants have no way in (no nav entry) and no way out (no app shell). | `app/app/{browser,wants}/page.tsx`, `Sidebar.tsx:43-53` | **Fixed** (d972c56: app views in the shell, sidebar More and search; neither is flagged) |
| UX-3 | High | Slides presenter hijacks Enter/Space at window level, so its own buttons can't be pressed by keyboard. | `slides/Present.tsx:33,51-56` | **Fixed** (68fda9e) |
| UX-4 | High | Lightbox forces every Tab to Close; its other buttons are unreachable by keyboard. | `Lightbox.tsx:37,54-55` | **Fixed** (68fda9e) |
| UX-5 | High | Revenue Guard is sold as included but isn't built. | `Storefront.tsx:386-389,450,494`, `tiers.ts:43,69` | **Fixed** (a54bd31: owner decided it will not be built; every offer of it removed) |
| UX-6..13 | Medium | Feature claims disagree with code (both ways); stale copy; 878 hard-coded colours and other token drift; UI v2 partly reverted; chat heading structure; weak focus indicator for some controls; pointer-only design canvas and `window.confirm`; unreachable Business code paths. | see `PARITY.md` | Partly fixed (4b40ad2: feature claims, stale copy, chat headings, limit-card ids, focus cue, `window.confirm`, design-canvas keyboard path); UX-9 (UI v2 decision), the colour-token migration and unreachable Business code paths open |

## Desktop app (keplar-desktop)

| ID | Sev | Finding | Where | Status |
|---|---|---|---|---|
| DSK-1 | High | Palmo rates code-executing commands as read-only (`git grep -O…`, `rg --pre`, `GIT_PAGER=…`, `LD_PRELOAD=…`, `go vet -vettool`, `sort --compress-program`), so they run without asking. | `src/main/palmo/risk.ts:173-194,288` | Fixed on keplar-desktop branch (f49111a), not yet released; repo-local `diff.external` still open |
| DSK-2 | Medium | Updates are trusted on GitHub-release write access alone (no code signing, Windows signature check off, deb installed as root). | `electron-builder.yml:50-53`, updater | Open (needs signing certificates) |
| DSK-3 | Medium | Publishing isn't gated by review or a green CI run; `--clobber` can replace published binaries. | `.github/workflows/release.yml` | Open (owner decision) |
| DSK-4 | Medium | The keplar.one session cookie is stored unencrypted on disk. | `electron-builder.yml:39-49` | Open |
| DSK-5..20 | Low | Asar integrity off; sign-in ticket can reach logs; README claim about the PKCE verifier; broad sign-in host list; Blender token to a stale port; Poly Haven host and size; keys under the fixed "basic" key on keyring-less Linux; Palmo overlay crash handling; Electron 4 patches behind; sync save dialog; `hold_key` can't be stopped; Research ignores proxies; release-notes token persistence; broad macOS entitlements; raw HTTP error pages. | see review | Partly fixed on keplar-desktop branch (f49111a: log redaction, PKCE wording, Poly Haven host/size, async save dialog, checkout credentials); rest open |

## Verified controls (selection)

Tenant scoping on every `Collection.get/update/remove(workspaceId, id)`; no lookups take `workspaceId` from the request; team
role checks on all `/api/team/*` mutations; admin routes 404 for non-admins; shared SSRF guard with one DNS resolution, public-only
addresses, pinned sockets and per-hop re-validation; sandboxed user sites and apps on opaque origins with `default-src 'none'`;
every served user file has `nosniff` and a sandbox CSP; parameterised SQL everywhere; no shell or eval on user input; signed,
idempotent Whop, Stripe, Space Studio and Apple webhooks; constant-time cron secrets; edge CSRF guard on all state-changing
`/api` requests; magic links HMAC-bound, 15-minute, single-use; TOTP with replay protection; passkeys with server-side challenges;
no account enumeration on password endpoints; MCP gateway with per-tool review, argument-hash approvals and idempotent receipts;
honest product states (no fabricated live data, demos labelled); `npm audit --omit=dev` clean; no secrets in the repository.
