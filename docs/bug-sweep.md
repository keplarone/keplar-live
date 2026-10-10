# Bug sweep (Oct 4–5, 2026)

Method: production build of master HEAD (6803ae3) in a mktemp worktree; every sitemap URL signed out at 1440 dark; key routes at 360/768/1440 in light and dark (console, page errors, overflow, axe); anonymous API matrix over every route/method; CSRF (cross-origin Origin on 166 state-changing routes); IDOR/tenant isolation with three accounts (business/plus/free); full Playwright suite (209 specs) on the build; layout-shift observer on /app and /; broken-link crawl (186 internal, 19 external); code review of the new routes, SSRF module, privacy export/delete, prompt-context fencing, log statements. Nothing pushed or deployed.

## Fixed

| # | Severity | Area | Evidence | Fix |
|---|---|---|---|---|
| 1 | Serious (a11y) | /developers code samples | axe `scrollable-region-focusable`, 1440 light+dark | bedd143 |
| 2 | Low–medium (security) | Markdown links in shared answers/chats | `//evil.example` and `/\evil` passed the `^(https?:\|mailto:\|/)` filter: open redirect / phishing link in a shared page | ebb1ba5 |
| 3 | Low (ops noise) | GET /sites/preview/<id> signed out | returned 500 and logged a tracked server error; now 401 | 857d734 |
| 4 | Medium (real race) | usage windows (`recordWindowUsage`) | racing first charges opened two window rows 1 ms apart and incremented the later one: units lost (~1 in 300 bursts of 12). This was the flaky "concurrent charges never lose an increment" test | 39be7ab |
| 5 | Flaky test | safety-reports | fixed 50 ms sleep; `recordSafetyEvent` now returns its never-rejecting write promise | 9c45d00 |
| 6 | Low (CLS) | /app composer | Voice and Talk buttons were added by an effect after first paint, shifting the other tools ~190 px sideways on every /app load | 3ba338f |
| 7 | Serious (a11y) | /developers plan table | wrapper scrolls sideways at 360 px but was not focusable | 141a568 |
| 8 | Serious (a11y) | /glossary | invalid `<dl>` (headings and divs inside it): axe `definition-list`, `dlitem` at 360 light+dark | 948cd09 |
| 9 | Test debt | 6 e2e specs | hidden share-dialog textarea matched `textarea.first()`; Recents now collapsed by default; Create has a new "How I read your idea" step | see git log: "e2e: stale selectors" |

## Checked, no bug
Anonymous API matrix (private routes refuse); CSRF (163/166 return 403 cross-origin, the 3 exceptions are public by design: business checkout, forms, bearer v1/ask); IDOR (projects, teams, keys, shares: 404/403 across tenants; Free gets 402 on keys/teams); API key auth (cookie alone 401, bad/revoked 401); SSRF module (DNS pinning, range checks, redirect revalidation); team invite tokens hashed and in URL fragment; API keys hashed; project notes/instructions/files enter prompts as fenced, flattened data and are withheld on the Free gate; privacy export/delete classify every new collection (api_keys, answer_shares, team_*, referral_*, project_*), `hash` fields redacted, owned team blocks account deletion; no tokens/emails in logEvent calls, no key material in server log; 352 signed-out page loads: no page errors, no horizontal overflow; broken links: none (internal and external); /compare light contrast alert was a scroll-reveal artifact.

## Not reproduced
- product-import order flake: 34 runs (24 under load) all passed. Order is restored by an explicit sort; only dedupe-by-hash keeps whichever fetch finishes first.
- /app desktop CLS 0.033: measured 0.0035 (cookie banner 0.0006, composer tools row 0.0014, sidebar meter 0.0014). The tools-row shift is fixed (#6). Home CLS 0.054: measured 0.000 in 10 runs at 1440 and 360, with CPU 4–6x and slow-4G throttling and a full scroll.

## Unfixed (low)
- Sidebar usage card grows ~74 px after the usage ledger loads (CLS 0.0014); needs a reserved height that varies by plan.
- /app/create signed out logs a console `GET /api/sites 401` (the 401 is how the page learns it must show sign-in).
- `/api/health/qa-browser` is public and reveals the browser version.
- `v1/ask` reads the whole body before the 100k check; `/r/<token>` GET counts bots as views; API-key max-keys check is a TOCTOU (can exceed by one under a race).
- `/api/business/agents/schedule` POST works anonymously only where KEPLAR_DEV_TOOLS=1 (prod gates it).

## Final verification
- Production build at HEAD: axe over all 168 sitemap pages at 360 light, 768 light and 1440 dark: 0 violations. /app CLS 0.0035 -> 0.002 (tools-row shift gone).
- Gate at HEAD: `tsc --noEmit` clean, unit tests 1822/1822. Playwright (209 specs on the sweep build): 203 passed; the 6 failures were stale selectors (item 9) and pass after the fix; 8 serial follow-ups did not run in the first pass and the multi-account chain passes in the re-run.

## Could not test
Real model answers (free-model quota was exhausted by earlier live testing; mocks only), paid-plan production behavior, real email/Stripe/Whop/Neon (local file store, no 501-free account endpoints: mfa/passkeys/sessions return 501 without a database), real devices and screen readers, voice with a real microphone (mocked recognition), the browser extension in a store build, the admin traffic card against real traffic, Lighthouse itself (layout-shift observer used instead).
