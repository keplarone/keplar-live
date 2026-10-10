# Keplar QA log

Standing continuous QA notes (America/New_York). Metrics below are measured, not invented.

## 2026-10-04 12:40 EDT — continuous QA pass (signed-out live)

### Checked
- `node scripts/smoke-prod.mjs https://keplar.one` — all PASS (/, /pricing, /signin, /status, /help, /contact, /security, /app, /api/health ok+postgres, /admin 404, HSTS+nosniff). Sample timings: `/` 1043 ms, `/pricing` 79 ms, `/signin` 1289 ms, `/status` 1035 ms, `/help` 236 ms, `/contact` 180 ms, `/security` 198 ms, `/app` 87 ms.
- Playwright `scripts/route-smoke.mjs https://keplar.one` — **90/90** route loads ok (desktop 1280 + mobile 390).
- Deep signed-out Playwright (desktop ~1280, mobile ~390, clip-check ~320): `/`, `/app`, `/app/create`, `/create`, `/pricing`, `/help`, `/docs`, `/changelog`, `/status`, `/signin`, `/signup`, `/security`, `/contact`, `/privacy`, `/terms`, `/simulation`, `/feedback`, `/about`, `/product`, `/how-it-works`, `/models`, `/admin`, `/api/health`, `/settings`, `/app/settings`, `/account` — **58/58** route checks PASS (no sideways scroll, no pageerrors). Desktop load timings (ms, includes wait): `/` 3196, `/app` 817, `/app/create` 683, `/create` 766→`/app/create`, `/pricing` 738, `/help` 732, `/docs` 809, `/changelog` 896, `/status` 987, `/signin` 882, `/simulation` 778, `/contact` 858.
- Themes on `/app`: Dark / Light / Auto controls present; `data-theme` dark→light→light (Auto under this OS preference).
- Create signed-out: `/app/create` shows Sign in gate; `/create` → `/app/create`.
- Ask composer present (placeholder “Ask anything. Keplar consults the right models.”); usage meter “50 of 50 left” visible signed-out.
- One signed-out Ask (`POST /api/keplar`): **429** `daily_limit` (“This network has reached today's question limit…”). Did not retry.
- Cookie consent: banner present without cookie; Accept all writes URI-encoded `keplar_consent` cookie (`v1-analytics`, choices.analytics true); banner gone after reload. No hyphen `keplar-consent` localStorage required.
- CTA e2e signed-out: all ok at 1366 / 390 / 320 (Try Keplar labels + text fits).
- Home nav sample: 25 unique internal links — all reachable (<400).
- `/api/health`: `{"ok":true,"store":"postgres","durable":true,"roundTripMs":19}` (also 18 ms via curl at end of pass).
- `/admin` 404; `/settings` and `/app/settings` 404; `/account` → `/signin` when signed out — expected.

### Bugs found
- None (product or tooling) this pass.

### Not bugs (documented)
- Signed-in Ask/answer quality: **blocker** — no E2E/test credentials in env; skipped founder accounts.
- Free Ask **429** on shared box IP — expected anonymous/network daily cap, not a product defect.
- Session meter can still show “50 of 50 left” before submit while the network is already capped; post-429 UI message is the source of truth.
- `/settings` and `/app/settings` 404; settings via in-app theme controls / `/app?settings=1` and `/account`→signin when signed out — expected.

### Fixes applied
- None (clean pass).

### Deploy
- **No.** Docs-only QA log append; no code changes. Live site left as-is at https://keplar.one (HEAD `fdbe718`). Left others’ WIP unstaged: `docs/create.md`, `Nav.*`, `tokens.css`, `screenshots/tools/`, `scripts/nav-theme-shots.mjs`, `tests/nav-theme.test.ts`.

### Blockers for founder
- Live signed-in QA credentials (or safe test account) still not in env (recurring).
- Stripe live activation / $1 test sale remains founder-side if not already done (recurring; not newly discovered).

## 2026-10-04 02:37 EDT — continuous QA pass (signed-out live)

### Checked
- `node scripts/smoke-prod.mjs https://keplar.one` — all PASS (/, /pricing, /signin, /status, /app, /api/health ok+postgres, /admin hidden 404, HSTS+nosniff).
- Playwright `scripts/route-smoke.mjs` against live — initially 4 FAILs: `/create` and `/admin` on desktop+mobile.
- Custom live Playwright pass (desktop ~1280 dark + mobile ~390 light): key marketing/help/docs/app/simulation/signin routes, home nav sample (17 links), theme Dark/Light/Auto on `/app`, default theme (dark, no flash), CTA e2e signed-out (all ok at 1366/390/320).
- Deep pass: Create signed-out gate ("Sign in to create"), Ask composer present, help/docs/changelog/simulation/pricing link health, mobile horizontal overflow none on sampled routes, sign-in form has email+submit.
- `/api/health`: `{"ok":true,"store":"postgres","durable":true}` (roundTripMs observed in response).
- `/status`: page reports operational for accounts/data, models, checkout (live render).

### Bugs found
1. **User-facing:** `GET /create` returned **404** on production. Create is an in-app view (like slides/study), but the short URL and smoke lists still pointed at bare `/create`. No public sitemap entry, but bookmarks/smoke expected a page.
2. **Tooling:** `scripts/route-smoke.mjs` (and theme-sweep) treated `/admin` as a normal page (`status < 400`) while prod correctly hides it with 404; stale `/create` in the route list caused false smoke failures.

### Not bugs (documented)
- Signed-in Ask/answer quality: **blocker** — no live magic-link/outbox or E2E test credentials in this environment; skipped destructive/founder accounts.
- This box IP hit Free daily Ask cap during the pass (`429 POST /api/keplar`, UI: used today’s Free questions). Expected shared anonymous/IP limit, not a product defect.
- Cookie banner only clears with the real `keplar_consent` cookie (underscore); older QA scripts that set `keplar-consent` localStorage alone do not dismiss it.

### Fixes applied
- Added `/app/create` page (`AppLoader initialView="create"`), permanent redirect `/create` → `/app/create` in `next.config.ts`.
- Updated `scripts/route-smoke.mjs` + `scripts/theme-sweep.mjs` to use `/app/create` and expect `/admin` 404.
- Extended `tests/monolith.test.ts` map for `/app/create`.

### Deploy
- **Yes.** `node scripts/deploy.mjs 11efa10` with `KEPLAR_NODE_MODULES=/tmp/kp-base/node_modules`: verify (typecheck/lint/unit/build/smoke e2e) all passed; Vercel aliased https://keplar.one; post-deploy smoke all PASS. Live check: `/create` → 308 `/app/create` (200).

### Blockers for founder
- Live signed-in QA credentials (or safe test account) not available in env.
- Stripe live activation / $1 test sale still founder-side if not already done.
- Local workspace `node_modules` missing several packages (`katex`, `@vercel/analytics`, etc.); prefer `KEPLAR_NODE_MODULES` for gates.


## 2026-10-04 04:37 EDT — continuous QA pass (signed-out live)

### Checked
- `node scripts/smoke-prod.mjs https://keplar.one` — all PASS before and after deploy (/, /pricing, /signin, /status, /help, /contact, /security, /app, /api/health, /admin 404, HSTS+nosniff). Post-deploy sample timings: `/` 471 ms, `/pricing` 72 ms, `/app` 75 ms, `/signin` 233 ms.
- Playwright `scripts/route-smoke.mjs https://keplar.one` — **90/90** route loads ok (desktop 1280 + mobile 390), before and after deploy.
- Deep signed-out Playwright (desktop ~1280 + mobile ~390): `/`, `/app`, `/app/create`, `/create`, `/pricing`, `/help`, `/docs`, `/changelog`, `/status`, `/signin`, `/signup`, `/about`, `/product`, `/how-it-works`, `/models`, `/security`, `/contact`, `/privacy`, `/terms`, `/simulation`, `/feedback`, `/admin`, `/api/health` — all PASS (46/46 route checks). Measured desktop timings include `/` 3482 ms (incl. wait), `/app` 1025 ms, `/pricing` 996 ms, `/signin` 1159 ms, `/help` 1107 ms.
- Themes on `/app`: Dark / Light / Auto controls present and switch `data-theme` (dark→light→light for Auto under this OS preference).
- Create signed-out: `/app/create` shows sign-in gate; `/create` → `/app/create` (308).
- Usage meter UI: “50 of 50 left” visible signed-out; Ask composer present.
- Cookie consent: banner shows without cookie; Accept all writes URI-encoded `keplar_consent` (`v1-analytics`); valid cookie dismisses banner.
- CTA e2e signed-out: all ok at 1366 / 390 / 320.
- Home nav sample (11 unique internal links) — all reachable (<400).
- `/api/health`: `{"ok":true,"store":"postgres","durable":true,"roundTripMs":23}` (post-deploy).
- `/admin` remains 404 on prod.

### Bugs found
1. **Tooling:** 13 Playwright helper scripts still set `localStorage["keplar-consent"]` (hyphen) with a fake JSON shape, so the cookie banner never dismissed in smokes/shots. Product consent path (`keplar_consent` + `v1-analytics` record) works.

### Not bugs (documented)
- Signed-in Ask/answer quality: **blocker** — no E2E/test credentials in env; skipped founder accounts.
- One signed-out Ask (`POST /api/keplar`) returned **429**; UI: “You’ve used today’s 50 Free questions… come back today at 8:00 PM.” Expected shared anonymous/IP Free daily cap — not a product defect; did not retry.
- `/settings` and `/app/settings` are 404; settings reachable via in-app `/app?settings=1` and `/account` → `/signin` when signed out — expected.
- Initial harness false-positive on consent when cookie value lacked `version`/`at`/`choices` — product OK once format matched `src/lib/consent.ts`.

### Fixes applied
- Updated Playwright init scripts to write `keplar_consent` as URI-encoded `{ version: "v1-analytics", at, choices: { analytics: false } }` (aligned with `scripts/route-shots.mjs`): `route-smoke`, `theme-sweep`, `monolith-e2e`, `monolith-shots`, `cls-check`, `typing-latency`, `app-space-shots`, `signed-cta-e2e`, `no-follower-e2e`, `orb-e2e`, `orb-shots`, `fit-e2e`, `smooth-e2e`.
- Commit: `837f044`.

### Deploy
- **Yes.** `KEPLAR_NODE_MODULES=/tmp/kp-base/node_modules node scripts/deploy.mjs 837f044`: verify typecheck/lint/unit/build/smoke e2e all PASS; aliased https://keplar.one (https://keplar-js29v2xwt-team-6667.vercel.app); post-deploy smoke all PASS. Left others’ WIP unstaged: `docs/create.md`, `e2e/a11y.e2e.ts`, `screenshots/tools/`.

### Blockers for founder
- Live signed-in QA credentials (or safe test account) still not in env.
- Stripe live activation / $1 test sale remains founder-side if not already done.

## 2026-10-04 06:17 EDT — continuous QA pass (signed-out live)

### Checked
- `node scripts/smoke-prod.mjs https://keplar.one` — all PASS (/, /pricing, /signin, /status, /help, /contact, /security, /app, /api/health ok+postgres, /admin 404, HSTS+nosniff). Sample timings: `/` 1037 ms, `/pricing` 83 ms, `/signin` 557 ms, `/status` 407 ms, `/help` 364 ms, `/contact` 188 ms, `/security` 68 ms, `/app` 66 ms.
- Playwright `scripts/route-smoke.mjs https://keplar.one` — **90/90** route loads ok (desktop 1280 + mobile 390).
- Deep signed-out Playwright (desktop ~1280, mobile ~390, clip-check ~320): `/`, `/app`, `/app/create`, `/create`, `/pricing`, `/help`, `/docs`, `/changelog`, `/status`, `/signin`, `/signup`, `/security`, `/contact`, `/privacy`, `/terms`, `/simulation`, `/feedback`, `/about`, `/product`, `/how-it-works`, `/models`, `/admin`, `/api/health`, `/settings`, `/app/settings`, `/account` — **58/58** route checks PASS (no sideways scroll, no pageerrors). Desktop load timings (ms, includes wait): `/` 3034, `/app` 737, `/app/create` 784, `/create` 838→`/app/create`, `/pricing` 718, `/help` 707, `/docs` 770, `/changelog` 1029, `/status` 885, `/signin` 842, `/simulation` 735.
- Themes on `/app`: Dark / Light / Auto controls present; `data-theme` dark→light→light (Auto under this OS preference).
- Create signed-out: `/app/create` shows Sign in gate; `/create` redirects to `/app/create`.
- Ask composer present (placeholder “Ask anything…”); usage meter “50 of 50 left” visible signed-out.
- One signed-out Ask (`POST /api/keplar`): **429** `daily_limit` (“This network has reached today's question limit…”); UI: “You’ve used today’s 50 Free questions… come back today at 8:00 PM.” Did not retry.
- Cookie consent: banner present without cookie; Accept all writes URI-encoded `keplar_consent` cookie (`v1-analytics`, choices.analytics true); banner gone after reload. No hyphen `keplar-consent` localStorage required.
- Home nav sample: 25 unique internal links — all reachable (<400).
- `/api/health`: `{"ok":true,"store":"postgres","durable":true,"roundTripMs":19}`.
- `/admin` 404; `/settings` and `/app/settings` 404; `/account` → `/signin` when signed out — expected.

### Bugs found
- None (product or tooling) this pass.

### Not bugs (documented)
- Signed-in Ask/answer quality: **blocker** — no E2E/test credentials in env; skipped founder accounts.
- Free Ask **429** on shared box IP — expected anonymous/network daily cap, not a product defect.
- Session meter can still show “50 of 50 left” before submit while the network is already capped; post-429 UI message is correct.
- `/settings` and `/app/settings` 404; settings via in-app theme controls / `/app?settings=1` and `/account`→signin when signed out — expected.

### Fixes applied
- None (clean pass).

### Deploy
- **No.** Docs-only QA log append; no code changes. Live site left as-is at https://keplar.one. Left others’ WIP unstaged: `docs/create.md`, `screenshots/tools/`.

### Blockers for founder
- Live signed-in QA credentials (or safe test account) still not in env (recurring).
- Stripe live activation / $1 test sale remains founder-side if not already done (recurring; not newly discovered).


## 2026-10-04 08:23 EDT — continuous QA pass (signed-out live)

### Checked
- `node scripts/smoke-prod.mjs https://keplar.one` — all PASS (/, /pricing, /signin, /status, /help, /contact, /security, /app, /api/health ok+postgres, /admin 404, HSTS+nosniff). Sample timings: `/` 191 ms, `/pricing` 73 ms, `/signin` 244 ms, `/status` 255 ms, `/help` 70 ms, `/contact` 217 ms, `/security` 195 ms, `/app` 62 ms.
- Playwright `scripts/route-smoke.mjs https://keplar.one` — **90/90** route loads ok (desktop 1280 + mobile 390).
- Deep signed-out Playwright (desktop ~1280, mobile ~390, clip-check ~320): `/`, `/app`, `/app/create`, `/create`, `/pricing`, `/help`, `/docs`, `/changelog`, `/status`, `/signin`, `/signup`, `/security`, `/contact`, `/privacy`, `/terms`, `/simulation`, `/feedback`, `/about`, `/product`, `/how-it-works`, `/models`, `/admin`, `/api/health`, `/settings`, `/app/settings`, `/account` — **58/58** route checks PASS (no sideways scroll, no pageerrors). Desktop load timings (ms, includes wait): `/` 3074, `/app` 741, `/app/create` 708, `/create` 846→`/app/create`, `/pricing` 733, `/help` 723, `/docs` 804, `/changelog` 858, `/status` 891, `/signin` 896, `/simulation` 728, `/contact` 1030.
- Themes on `/app`: Dark / Light / Auto controls present; `data-theme` dark→light→light (Auto under this OS preference).
- Create signed-out: `/app/create` shows “Sign in to create” gate; `/create` → `/app/create` (308).
- Ask composer present (placeholder “Ask anything. Keplar consults the right models.”); usage meter “50 of 50 left” visible signed-out.
- One signed-out Ask (`POST /api/keplar`): **429** `daily_limit` (“This network has reached today's question limit…”); UI: “You’ve used today’s 50 Free questions… come back today at 8:00 PM.” Did not retry.
- Cookie consent: banner present without cookie; Accept all writes URI-encoded `keplar_consent` cookie (`v1-analytics`, choices.analytics true); banner gone after reload. No hyphen `keplar-consent` localStorage required.
- CTA e2e signed-out: all ok at 1366 / 390 / 320 (Try Keplar labels + text fits).
- Home nav sample: 25 unique internal links — all reachable (<400).
- `/api/health`: `{"ok":true,"store":"postgres","durable":true,"roundTripMs":59}` (also observed 33 ms via curl earlier in the pass).
- `/admin` 404; `/settings` and `/app/settings` 404; `/account` → `/signin` when signed out — expected.

### Bugs found
- None (product or tooling) this pass.

### Not bugs (documented)
- Signed-in Ask/answer quality: **blocker** — no E2E/test credentials in env; skipped founder accounts.
- Free Ask **429** on shared box IP — expected anonymous/network daily cap, not a product defect. API body still reports `daily.left: 50` / `used: 0` under network `daily_limit` (account quota unused; network capped).
- Session meter can still show “50 of 50 left” before/after submit while the network is already capped; post-429 UI message is correct.
- `/settings` and `/app/settings` 404; settings via in-app theme controls / `/app?settings=1` and `/account`→signin when signed out — expected.

### Fixes applied
- None (clean pass).

### Deploy
- **No.** Docs-only QA log append; no code changes. Live site left as-is at https://keplar.one. Left others’ WIP unstaged: `docs/create.md`, `src/app/layout.tsx`, `src/components/app-ui/KeplarApp.tsx`, `src/components/spatial/SendField.tsx`, `src/components/spatial/SendFieldLazy.tsx`, `screenshots/tools/`.

### Blockers for founder
- Live signed-in QA credentials (or safe test account) still not in env (recurring).
- Stripe live activation / $1 test sale remains founder-side if not already done (recurring; not newly discovered).


## 2026-10-04 10:31 EDT — continuous QA pass (signed-out live)

### Checked
- `node scripts/smoke-prod.mjs https://keplar.one` — all PASS (/, /pricing, /signin, /status, /help, /contact, /security, /app, /api/health ok+postgres, /admin 404, HSTS+nosniff). Sample timings: `/` 302 ms, `/pricing` 70 ms, `/signin` 283 ms, `/status` 265 ms, `/help` 338 ms, `/contact` 179 ms, `/security` 371 ms, `/app` 71 ms.
- Playwright `scripts/route-smoke.mjs https://keplar.one` — **90/90** route loads ok (desktop 1280 + mobile 390).
- Deep signed-out Playwright (desktop ~1280, mobile ~390, clip-check ~320): `/`, `/app`, `/app/create`, `/create`, `/pricing`, `/help`, `/docs`, `/changelog`, `/status`, `/signin`, `/signup`, `/security`, `/contact`, `/privacy`, `/terms`, `/simulation`, `/feedback`, `/about`, `/product`, `/how-it-works`, `/models`, `/admin`, `/api/health`, `/settings`, `/app/settings`, `/account` — **58/58** route checks PASS (no sideways scroll, no pageerrors). Desktop load timings (ms, includes wait): `/` 4463, `/app` 729, `/app/create` 727, `/create` 831→`/app/create`, `/pricing` 844, `/help` 881, `/docs` 946, `/changelog` 1120, `/status` 994, `/signin` 1221, `/simulation` 984, `/contact` 854.
- Themes on `/app`: Dark / Light / Auto controls present; `data-theme` dark→light→light (Auto under this OS preference).
- Create signed-out: `/app/create` shows “Sign in to create” gate; `/create` → `/app/create` (308).
- Ask composer present (placeholder “Ask anything. Keplar consults the right models.”); usage meter “50 of 50 left” visible signed-out.
- One signed-out Ask (`POST /api/keplar`): **429** `daily_limit` (“This network has reached today's question limit…”); UI: “You’ve used today’s 50 Free questions… come back today at 8:00 PM.” Did not retry.
- Cookie consent: banner present without cookie; Accept all writes URI-encoded `keplar_consent` cookie (`v1-analytics`, choices.analytics true); banner gone after reload. No hyphen `keplar-consent` localStorage required.
- CTA e2e signed-out: all ok at 1366 / 390 / 320 (Try Keplar labels + text fits).
- Home nav sample: 25 unique internal links — all reachable (<400).
- `/api/health`: `{"ok":true,"store":"postgres","durable":true,"roundTripMs":14}`.
- `/admin` 404; `/settings` and `/app/settings` 404; `/account` → `/signin` when signed out — expected.

### Bugs found
- None (product or tooling) this pass.

### Not bugs (documented)
- Signed-in Ask/answer quality: **blocker** — no E2E/test credentials in env; skipped founder accounts.
- Free Ask **429** on shared box IP — expected anonymous/network daily cap, not a product defect. API body still reports `daily.left: 50` / `used: 0` under network `daily_limit` (account quota unused; network capped).
- Session meter can still show “50 of 50 left” before/after submit while the network is already capped; post-429 UI message is correct.
- `/settings` and `/app/settings` 404; settings via in-app theme controls / `/app?settings=1` and `/account`→signin when signed out — expected.
- Initial deep-harness Ask click hit a non-submit “Ask” control (status null); follow-up probe with the “Ask Keplar” submit correctly posted `/api/keplar` and got 429 — product path OK; harness note only.

### Fixes applied
- None (clean pass).

### Deploy
- **No.** Docs-only QA log append; no code changes. Live site left as-is at https://keplar.one. Left others’ WIP unstaged: `docs/create.md`, account/settings components, MonolithHome/OrbHero, scramble-related new files, `screenshots/tools/`.

### Blockers for founder
- Live signed-in QA credentials (or safe test account) still not in env (recurring).
- Stripe live activation / $1 test sale remains founder-side if not already done (recurring; not newly discovered).

## 2026-10-04 14:22 EDT — continuous QA pass (signed-out live)

### Checked
- `node scripts/smoke-prod.mjs https://keplar.one` — all PASS (/, /pricing, /signin, /status, /help, /contact, /security, /app, /api/health ok+postgres, /admin 404, HSTS+nosniff). Sample timings: `/` 1021 ms, `/pricing` 97 ms, `/signin` 1320 ms, `/status` 957 ms, `/help` 497 ms, `/contact` 224 ms, `/security` 82 ms, `/app` 112 ms.
- Playwright `scripts/route-smoke.mjs https://keplar.one` — **90/90** route loads ok (desktop 1280 + mobile 390).
- Deep signed-out Playwright (desktop ~1280, mobile ~390, clip-check ~320): `/`, `/app`, `/app/create`, `/create`, `/pricing`, `/help`, `/docs`, `/changelog`, `/status`, `/signin`, `/signup`, `/security`, `/contact`, `/privacy`, `/terms`, `/simulation`, `/feedback`, `/about`, `/product`, `/how-it-works`, `/models`, `/admin`, `/api/health`, `/settings`, `/app/settings`, `/account` — **58/58** route checks PASS (no sideways scroll, no pageerrors). Desktop load timings (ms, includes wait): `/` 3173, `/app` 875, `/app/create` 708, `/create` 855→`/app/create`, `/pricing` 718, `/help` 805, `/docs` 776, `/changelog` 872, `/status` 990, `/signin` 917, `/simulation` 798, `/contact` 1038.
- Themes on `/app`: Dark / Light / Auto controls present; `data-theme` dark→light→light (Auto under this OS preference).
- Create signed-out: `/app/create` shows Sign in gate; `/create` → `/app/create`.
- Ask composer present (placeholder “Ask anything. Keplar consults the right models.”); usage meter “50 of 50 left” visible signed-out.
- One signed-out Ask (`POST /api/keplar`): **429** `daily_limit` (“This network has reached today's question limit… resets at 00:00 UTC”). Did not retry.
- Cookie consent: banner present without cookie; Accept all writes URI-encoded `keplar_consent` cookie (`v1-analytics`, choices.analytics true); banner gone after reload. No hyphen `keplar-consent` localStorage required.
- CTA e2e signed-out: all ok at 1366 / 390 / 320 (Try Keplar labels + text fits).
- Home nav sample: 25 unique internal links — all reachable (<400).
- `/api/health`: `{"ok":true,"store":"postgres","durable":true,"roundTripMs":14}` (also 30 ms via curl earlier).
- `/admin` 404; `/settings` and `/app/settings` 404; `/account` → `/signin` when signed out — expected.

### Bugs found
- None (product or tooling) this pass.

### Not bugs (documented)
- Signed-in Ask/answer quality: **blocker** — no E2E/test credentials in env; skipped founder accounts.
- Free Ask **429** on shared box IP — expected anonymous/network daily cap, not a product defect.
- Session meter can still show “50 of 50 left” before/after submit while the network is already capped; post-429 API/UI messaging is correct for the network cap.
- `/settings` and `/app/settings` 404; settings via in-app theme controls / `/app?settings=1` and `/account`→signin when signed out — expected.

### Fixes applied
- None (clean pass).

### Deploy
- **No.** Docs-only QA log append; no code changes. Live site left as-is at https://keplar.one. Left others’ WIP unstaged: `docs/create.md`, `screenshots/tools/`, `test-results/`.

### Blockers for founder
- Live signed-in QA credentials (or safe test account) still not in env (recurring).
- Stripe live activation / $1 test sale remains founder-side if not already done (recurring; not newly discovered).
## 2026-10-04 16:26 EDT — continuous QA pass (signed-out live)

### Checked
- `node scripts/smoke-prod.mjs https://keplar.one` — all PASS (/, /pricing, /signin, /status, /help, /contact, /security, /app, /api/health ok+postgres, /admin 404, HSTS+nosniff). Sample timings: `/` 1014 ms, `/pricing` 96 ms, `/signin` 289 ms, `/status` 200 ms, `/help` 66 ms, `/contact` 164 ms, `/security` 104 ms, `/app` 298 ms.
- Playwright `scripts/route-smoke.mjs https://keplar.one` — **90/90** route loads ok (desktop 1280 + mobile 390).
- Deep signed-out Playwright (desktop ~1280, mobile ~390, clip-check ~320): `/`, `/app`, `/app/create`, `/create`, `/pricing`, `/help`, `/docs`, `/changelog`, `/status`, `/signin`, `/signup`, `/security`, `/contact`, `/privacy`, `/terms`, `/simulation`, `/feedback`, `/about`, `/product`, `/how-it-works`, `/models`, `/admin`, `/api/health`, `/settings`, `/app/settings`, `/account` — **58/58** route checks PASS (no sideways scroll, no pageerrors). Desktop load timings (ms, includes wait): `/` 3230, `/app` 760, `/app/create` 703, `/create` 783→`/app/create`, `/pricing` 742, `/help` 814, `/docs` 813, `/changelog` 704, `/status` 1046, `/signin` 878, `/simulation` 765, `/contact` 837.
- Themes on `/app`: Dark / Light / Auto controls present; `data-theme` dark→light→light (Auto under this OS preference).
- Create signed-out: `/app/create` shows Sign in gate; `/create` → `/app/create`.
- Ask composer present (placeholder “Ask anything. Keplar consults the right models.”); usage meter “50 of 50 left” visible signed-out.
- One signed-out Ask (`POST /api/keplar`): **429** `daily_limit` (“This network has reached today's question limit… resets at 00:00 UTC”). Did not retry.
- Cookie consent: banner present without cookie; Accept all writes URI-encoded `keplar_consent` cookie (`v1-analytics`, choices.analytics true); banner gone after reload. No hyphen `keplar-consent` localStorage required.
- CTA e2e signed-out: all ok at 1366 / 390 / 320 (Try Keplar labels + text fits).
- Home nav sample: 25 unique internal links — all reachable (<400).
- `/api/health`: `{"ok":true,"store":"postgres","durable":true,"roundTripMs":14}`.
- `/admin` 404; `/settings` and `/app/settings` 404; `/account` → `/signin` when signed out — expected.

### Bugs found
- None (product or tooling) this pass.

### Not bugs (documented)
- Signed-in Ask/answer quality: **blocker** — no E2E/test credentials in env; skipped founder accounts.
- Free Ask **429** on shared box IP — expected anonymous/network daily cap, not a product defect.
- Session meter can still show “50 of 50 left” before/after submit while the network is already capped; post-429 API/UI messaging is correct for the network cap.
- `/settings` and `/app/settings` 404; settings via in-app theme controls / `/app?settings=1` and `/account`→signin when signed out — expected.

### Fixes applied
- None (clean pass).

### Deploy
- **No.** Docs-only QA log append; no code changes. Live site left as-is at https://keplar.one. Left others’ WIP unstaged: `docs/create.md`, `screenshots/tools/`, `test-results/`.

### Blockers for founder
- Live signed-in QA credentials (or safe test account) still not in env (recurring).
- Stripe live activation / $1 test sale remains founder-side if not already done (recurring; not newly discovered).

## 2026-10-04 18:58 EDT — continuous QA pass (signed-out live)

### Checked
- Before deploy, `node scripts/smoke-prod.mjs https://keplar.one`: all PASS (/, /pricing, /signin, /status, /help, /contact, /security, /app, /api/health ok+postgres, /admin 404, HSTS+nosniff). Sample timings: `/` 943 ms, `/pricing` 230 ms, `/signin` 1257 ms, `/status` 1065 ms, `/help` 213 ms, `/contact` 189 ms, `/security` 66 ms, `/app` 235 ms.
- Playwright `scripts/route-smoke.mjs https://keplar.one`: **90/90** before and **90/90** after the deploy.
- Deep signed-out Playwright (desktop 1280, mobile 390, clip-check 320), same routes as before plus `/agents`, `/answers`, `/blog`: **64/64** PASS before and **64/64** after the deploy (no sideways scroll, no pageerrors). Desktop load timings after deploy (ms, includes wait): `/` 3191, `/app` 1174, `/app/create` 1117, `/pricing` 758, `/help` 946, `/docs` 1851, `/status` 978, `/signin` 929, `/agents` 800, `/answers` 1006.
- Theme × width sweep (Dark and Light × 1366/390/320) on 17 routes: no scroll locking, no text clipped or pushed off-screen (the only hits were sr-only `.visually-hidden` text and `/app` composer tool chips inside their own `overflow-x:auto` row). 150 internal links collected from those pages: **0** ≥400. External link (GitHub desktop releases) 200.
- Dead-button click sweep (1366 + 390) on `/`, `/pricing`, `/help`, `/agents`, `/app`, `/app/create`, `/signin`, `/signup`, `/answers`, `/docs`, `/simulation`. I checked each flag by hand: show/hide password works, theme radios on `/signin` work, and the home ProductDemo accordion works (one flag came from the demo replay animation). The one real hit is the `/pricing` page index below.
- `/app` signed-out at 1280/390/320: sidebar open/close (Escape) leaves no scroll lock; Projects, Agents, Business (sign-in gate), Search, New Thread, Ask and Create (sign-in gate) all open with no errors.
- Auth forms (1366 + 320): empty and invalid-email submits show inline errors and send no POST; sign-up shows the 10-character password hint.
- Themes on `/app`: Dark / Light / Auto set `data-theme` dark→light→light. Usage meter "50 of 50 left". One signed-out Ask: **429** `daily_limit` (network cap). Did not retry.
- Cookie consent: banner shows, Accept all writes `keplar_consent` (`v1-analytics`), banner gone after reload. `/api/health` `{"ok":true,"store":"postgres","durable":true}`.
- After deploy (newly live): `/referral-terms` 200 (Dark/Light, 1366/390/320, no overflow, no console errors) and in the sitemap; `/invite/<unknown code>` → 303 `/signup`; `/r/<bad token>` and `/answers/<bad slug>` 404; voice Talk button present on `/app` with no errors; `/pricing` index now has 4 distinct ticks (Free, Business, Keplar Usage, Questions) at distinct scroll positions (475/1309/1748/2325 px).

### Bugs found
- `/pricing` "On this page" rail (≥1360 px, hover devices) had 4 ticks for the side-by-side plan cards (Free, Keplar Lite, Keplar Plus, Keplar Pro). All four scrolled to the same spot (scrollY 458), so three of them did nothing, and only the last one could ever light up.
- Deploy gate (another executor's commit, not live): `ea3cd30` voice mode put "Cancelled" in user-facing copy and failed `tests/us-english.test.ts`. The first deploy attempt of `440a56f` was refused. The voice executor fixed it in `4d5ed30`, and I did not touch their WIP.

### Not bugs (documented)
- `/app/create` signed-out logs a console 401 from `GET /api/sites`. That 401 is how the Create sign-in gate is shown (SiteBuilder maps 401 to the sign-in message).
- Whop Pixel sets `_wuid` / `_wuid_link` before consent on public marketing pages. This is intentional and disclosed in the privacy policy (ad measurement, outside the analytics choice, excluded from app/auth/form pages).
- Signed-in Ask/answer quality, Account → Invite friends, a valid invite code, and Agents scheduling: **blocker**. There are no test credentials in env, and I skipped founder accounts.
- Free Ask **429** on the shared box IP is the expected network daily cap. The session meter still shows "50 of 50 left" while the network is capped (known).
- `/settings` and `/app/settings` 404, `/account` → `/signin` signed out. Expected.

### Fixes applied
- `440a56f` fix(chrome): the page index rail keeps one tick per row of side-by-side headings (`src/components/chrome/PageChrome.tsx`).

### Deploy
- **Yes.** `node scripts/deploy.mjs 4d5ed30` (master HEAD, clean worktree): typecheck, lint, unit tests, build and smoke e2e all PASS. https://keplar-jpr67etkp-team-6667.vercel.app is aliased to https://keplar.one, and the post-deploy smoke is all PASS. Worktree removed. The deploy also shipped the committed-but-undeployed master work since the previous production deploy (Free request governor, scale/a11y pass, shared answers, projects, scheduled agents, referrals, voice mode BETA, templates). Others' WIP stayed unstaged: `docs/create.md`, `src/components/home/MonolithHome.module.css`, `e2e/features2.e2e.ts`, `scripts/_*.mjs`, `screenshots/tools/`, `test-results/`.

### Blockers for founder
- Live signed-in QA credentials (or a safe test account) are still not in env (recurring).
- Stripe live activation / $1 test sale is still founder-side if not already done (recurring; not newly discovered).

## 2026-10-04 ~20:30 EDT (20:25–21:12) — scheduled QA + auto-fix pass (signed-out live, real Ask prompts)

### Checked
- `node scripts/smoke-prod.mjs https://keplar.one`: all PASS before the deploys. Sample timings: `/` 1320 ms, `/pricing` 109 ms, `/signin` 1490 ms, `/status` 1062 ms, `/help` 79 ms, `/contact` 185 ms, `/security` 75 ms, `/app` 84 ms. `scripts/route-smoke.mjs`: **90/90** before and **90/90** after the last deploy.
- New sweep at the brief's widths: 16 routes (`/`, `/app`, `/app/create`, `/pricing`, `/help`, `/signin`, `/signup`, `/docs`, `/agents`, `/answers`, `/simulation`, `/status`, `/contact`, `/privacy`, `/developers`, `/changelog`) × 1920x1080 / 1366x768 / 390x844 × Dark / Light / Auto (144 page loads): every page scrolls, no sideways scroll, no clipped or off-screen text, `data-theme` matches the stored choice, no page errors. Only console error: the known 401 from `GET /api/sites` on signed-out `/app/create` (that is the Create sign-in gate). 124 internal links collected: **0** ≥400. Load timings (Dark context, `load` event, warm browser context, ms, 1920/1366/390): `/` 749/571/531, `/app` 171/920/723, `/pricing` 185/146/284, `/help` 204/300/259, `/signin` 470/293/289, `/answers` 550/397/278.
- Themes: a new visitor gets Dark even with the OS set to Light; sidebar Light/Auto/Dark set `data-theme` light / follows OS / dark and write `keplar-theme`; Light persists across reload and onto `/pricing`.
- Font: body is Google Sans (with the metric-matched fallback) on every route. This is the committed decision in `4d3fb51` ("Google Sans replaces Lexend Deca"), not a regression; the QA brief still says Lexend Deca.
- Ask (signed-out Free, network cap had reset at 00:00 UTC): 7 real prompts at 1366 and 390, all `POST /api/keplar` 200. Meter went 50→49→48→47 (desktop) and 50→49→48 (phone). Answers correct: Canberra (with the 1913 compromise), 391 = 17 × 23, three sensible Next.js speed tips, a balanced coffee answer, "can't predict the 2030 World Cup" (2 of 2 free models agreed), 12 × 12 = 144. Single-model answers took 7–9 s end to end in the harness (the card shows 0.8–2.2 s model time).
- Composer typing (keydown → second animation frame, headless Chrome with software GL, 75-char sentence at 40 ms/key): 1920 p50 52 ms / p95 75 / max 93 with the box idle (p50 94 while a build ran); 390 p50 27 / p95 192 / max 310. No long tasks recorded in either run. The phone spikes are not conclusive in software-GL headless mode; recheck on a real device.
- Pricing: Upgrade to Lite/Plus/Pro go to `/checkout?plan=…`; signed out, Plus goes to `/signin?next=/checkout?plan=plus`. Sign-in shows Google, Microsoft (disabled, "Coming soon"), passkey, password, and email-link options.

### Bugs found
1. **Wrong tone on neutral questions.** "What is the capital of Australia, and why isn't it Sydney?" opened with "I hear the frustration—let's clear this up quickly." The mood regex treated `why isn't it` / `why is it` / `why doesn't it` (and "how many times", "the third time") as frustration, so ordinary questions like "why is it hot in summer" or "how many times does 7 go into 56" got the frustrated tone note.
2. **Answer card actions cut off on phones.** At 390 px the seven 44 px action buttons plus gaps were 332 px in a 326 px footer, so "Ask again" ended at x=409 (past the 390 px viewport) and "Keplar Usage · Low" wrapped to 3 lines.
3. **Chat titles with a stray letter.** The instant title stripped "Why is i" from "Why is it hot in summer?", which gave the title "T hot summer" (also "T raining today"). The subject-word regex had no word boundary, so the "i" of "it" (and the "is" of "issues") got eaten.

### Fixes applied
- `745d0c0` Answer tone: frustration needs a real failure phrase (`why won't it load`, `how many times do I have to ask`, `third time I'm asking`); neutral "why is it…" questions stay neutral. Tests added in `tests/persona-tone.test.ts`.
- `2170093` Answer card: the footer and action row wrap; on touch phones ≤480 px the 44 px targets sit flush under the usage label (`KeplarTurn.module.css`).
- `f498692` Chat titles: verb and subject words are stripped only on word boundaries. Tests added in `tests/chat-title.test.ts`.

### Deploy
- **Yes, twice, both via `scripts/deploy.mjs` from a clean worktree at master HEAD.**
  - `2170093`: typecheck, lint, unit, build and smoke e2e PASS. Live at https://keplar-egilopwnr-team-6667.vercel.app, aliased to keplar.one, post-deploy smoke PASS.
  - `f498692`: the first attempt was REFUSED by the gate because the local e2e server dropped mid-run (`ERR_CONNECTION_REFUSED` on 32 specs, including `/api/health`; an infra flake, not a test assertion). I retried at master HEAD `cc78ecf`, which also includes another agent's `d16331a` e2e selector fixes and `cc78ecf` docs: all gates PASS. Live at https://keplar-gcocysye1-team-6667.vercel.app, aliased to keplar.one, post-deploy smoke PASS.
- Verified live: the 390 px action row now ends at x=358 inside the card (all 7 visible); the 1366 row is unchanged. The Sydney question now answers without the frustration opener. "Why is it raining today?" is titled "Raining today".
- Others' WIP stayed unstaged: `docs/create.md`, `screenshots/tools/`, `test-results/`. I left the e2e files edited by another agent alone (they committed them in `d16331a`).

### Not fixed / noted
- Instant title for "Is coffee good or bad for your health?" is "Coffee or bad health" because "good" is a stop word. It's cosmetic, and model titles replace it when eligible. Left alone.
- The "BETA Source check… paid plans" upsell shows even on trivial questions like "12 times 12". This is a product decision, not a bug. On phones the inline "See plans" link makes that paragraph's last line visibly taller (minor).
- Phone header with an active chat: "49 of 50 left" sits right against the Upgrade pill (crowded but not overlapping).
- Signed-in Ask, Create, settings dialog and Agents: **blocker**. There are still no QA test credentials in env, and I skipped founder accounts.

### Blockers for founder
- Live signed-in QA credentials (or a safe test account) are still not in env (recurring).
- Microsoft sign-in shows "Coming soon". It needs Microsoft (Entra) OAuth app credentials if it should go live (not newly discovered).
- Stripe live activation / $1 test sale is still founder-side if not already done (recurring).

## 2026-10-04 ~22:20 EDT (22:19–23:00) — scheduled QA + auto-fix pass (signed-out live, real Ask prompts)

### Checked
- `node scripts/smoke-prod.mjs https://keplar.one` before the deploy: all PASS. Sample timings: `/` 1132 ms, `/pricing` 82 ms, `/signin` 1327 ms, `/status` 1183 ms, `/help` 81 ms, `/contact` 225 ms, `/security` 74 ms, `/app` 72 ms. `scripts/route-smoke.mjs`: **90/90** before and **90/90** after the deploy.
- Sweep of 21 routes (`/`, `/app`, `/app/create`, `/pricing`, `/help`, `/signin`, `/signup`, `/agents`, `/answers`, `/blog`, `/docs`, `/models`, `/how-it-works`, `/product`, `/about`, `/terms`, `/referral-terms`, `/feedback`, `/contact`, `/templates`, `/checkout?plan=plus`) at 1920x1080 / 1366x768 / 390x844 in Dark / Light / Auto (189 page loads), before and after the deploy. Every page scrolls, there is no sideways scroll, and no visible text is clipped (the only hits were sr-only text). `data-theme` matched the stored choice on all 189 loads, there were no page errors, and no route returned ≥400. The only console error is the known 401 from `GET /api/sites` on signed-out `/app/create`. 157 internal links collected: **0** ≥400. Load times after the deploy (Dark, `load` event, ms, 1920/1366/390): `/` 707/521/489, `/app` 890/165/137, `/app/create` 134/162/115, `/pricing` 172/238/175, `/help` 222/199/138, `/signin` 328/276/256, `/answers` 475/240/257. The slowest of the 189 loads was 890 ms after the deploy and 3516 ms before (`/answers` at 1920 on a cold first hit; 440 ms on the next visit).
- New check: scroll containers whose content runs past their edge, on 20 routes at all three widths. That is how bug 1 below was found.
- Dead-button sweep (1920 + 390) on `/models`, `/how-it-works`, `/product`, `/about`, `/templates`, `/blog`, `/feedback`, `/contact`, `/help`, `/pricing`. All flags were sweep artifacts: I clicked the `/product` demo accordions by hand at 1920 and 390 and all three toggle `aria-expanded`, and the "Dark" theme radio does nothing when Dark is already selected.
- `/app` signed out at 1920/1366/390: Projects, Agents, Business (sign-in gate), Search, New Thread, Ask and Create (sign-in gate) all open with no errors and no scroll lock. The phone sidebar opens and closes with Escape.
- Ask (signed-out Free): 10 real prompts, all `POST /api/keplar` 200. Meter 50→49→48 (1920) and 50→49→48→47 (390), and the count holds after reload. Answers were correct: virus vs bacterium (2 sentences), 72 °F = 22.22 °C (KaTeX formula), the Berlin Wall fell in 1989 (2 of 2 free models agreed), a sensible rainy-hike packing list, "2027 is not a leap year" with the reason, plus 4 short poems/haiku. Model time on the card was 0.9–1.4 s.
- Composer typing on live (keydown → second animation frame, 279 keys): 1920 p50 24.3 ms / p95 34.6 ms, 390 p50 24.1 ms / p95 31.8 ms (frame-limited). Native undo/redo works, and the caret stays put when typing mid-text.
- Sign-up (390 Light) and pricing (1920 Dark) screenshots look right. Microsoft still shows "Coming soon".

### Bugs found
1. **Composer tools cut off on ordinary desktops.** The labelled tool row (Attach, Voice, Talk (beta), Web, Deep Research, Create, Create image, Agent) needs a composer about 1150 px wide. The composer is about 1000 px at 1920x1080 and 800 px at 1366x768, and labels only collapsed below 700 px. So "Create image" showed as "Create" (two "Create" chips side by side) and "Agent" sat behind the row's hidden scrollbar. Measured: row 711 px wide with 858 px of content at 1920, and 539 px with 785 px at 1366.
2. **Poems and haiku shown as one run-on line.** The renderer joined every line of a paragraph with a space. Models send poems with CommonMark hard breaks (`"Soft pages whisper,  \nSunlight pools…"`, taken from the live NDJSON stream), so a three-line haiku came out as "Moonlit waves whisper, Silver foam kisses the sand— Night breathes, deep and still."
3. **Double full stop on every single-model answer.** Details → Consensus read "One model answered. There was nothing to compare.." because the view appended "." to a summary that already ends in one. The same happened in the consensus badge aria-label and the agreement-scene caption, and a "No position holds a majority." summary got the same treatment.

### Fixes applied
- `67c9c08` fix(composer): two container steps. Under 1200 px, Attach, Voice and Talk become icons, except while active so "Listening…" stays readable. Under 960 px, every tool becomes an icon. `tests/composer-tools.test.ts`.
- `b120035` fix(answers): paragraphs and quotes keep their lines as `<br>`. Hard-break spaces and backslashes are dropped, and no extra line is added beside display math. `src/lib/md-lines.ts`, `tests/md-lines.test.ts`.
- `1672411` fix(answer card): new `asSentence()` ends summaries with exactly one full stop (KeplarTurn and AgreementScene). An empty single-model summary falls back to the standard sentence. `tests/sentence.test.ts`.
- Full unit suite: 1831/1831 pass.

### Deploy
- **Yes.** `node scripts/deploy.mjs HEAD` at master `1672411` from a clean worktree. typecheck, lint, unit, build and smoke e2e all PASS on the first attempt. https://keplar-fqr77z4vh-team-6667.vercel.app is aliased to https://keplar.one, and the post-deploy smoke is all PASS. Worktree removed. This deploy also shipped the committed master work since the 20:30 deploy (cleanup pass, footer columns, 11px type floor, other agents' focus-box fixes `e961498`…`a23c300`). The post-deploy sweep above covers it with no regressions.
- Verified live: the composer row now fits at every width I measured (row = content: 1920 680/680 px with Web/Deep Research/Create/Create image/Agent labelled; 1366 and 1280 icon-only 320/320; 2560 all labels 962/962). A fresh live poem renders as `Steam curls like a quiet promise,<br>dark warmth cradles the stillness,<br>day begins in a single sip.` Consensus now reads "One model answered. There was nothing to compare." with one full stop.
- Others' WIP stayed unstaged: `docs/create.md`, `screenshots/tools/`, `test-results/`.

### Not fixed / noted
- Phone (390) composer tools still scroll sideways inside their own row, with the right-edge fade. That is by design.
- The signed-out `/app?settings=1` opens no dialog. Theme is in the sidebar control (known).
- Instant chat titles drop short words ("Test question for layout" → "Test question layout"). Cosmetic, and model titles replace them when eligible.
- Signed-in Ask, Create, settings dialog and Agents: **blocker**. There are still no QA test credentials in env, and I skipped founder accounts.

### Blockers for founder
- Live signed-in QA credentials (or a safe test account) are still not in env (recurring).
- Microsoft sign-in shows "Coming soon". It needs Microsoft (Entra) OAuth app credentials if it should go live (recurring).
- Stripe live activation / $1 test sale is still founder-side if not already done (recurring).
- No new founder-only blockers this pass.

## 2026-10-05 ~02:20 EDT (02:18–02:55) — scheduled QA + auto-fix pass (signed-out live, real Ask prompts)

### Checked
- State first: the 00:19 EDT scheduled run left no log entry, no worktree and no uncommitted QA files (latest worktrees were from 2026-10-04). Nothing of mine to clean up. Note: `scripts/deploy.mjs` never removes its `/tmp/keplar-deploy-<sha>` worktree; 33 older ones from 2026-10-04 are still registered. I left them because I can't tell whose they are. Mine is removed.
- `node scripts/smoke-prod.mjs https://keplar.one` before the deploy: all PASS (`/` 899 ms, `/pricing` 218, `/signin` 192, `/status` 291, `/help` 261, `/contact` 156, `/security` 195, `/app` 78). `scripts/route-smoke.mjs`: **90/90** before and **90/90** after the deploy.
- Sweep of 28 routes (the 21 from the last pass plus `/forgot-password`, `/security`, `/status`, `/simulation`, `/developers`, `/changelog`, `/privacy`, `/enterprise`, `/compare`, `/download`) at 1920x1080 / 1366x768 / 390x844 in Dark / Light / Auto (252 page loads). Every page scrolls, there is no sideways scroll, no clipped text, `data-theme` matched on all loads, the body font is Google Sans everywhere, and there were no page errors. The only console error is the known 401 from `GET /api/sites` on signed-out `/app/create`. 160 internal links: **0** ≥400. Dark `load` times (ms, 1920/1366/390): `/` 586/481/630, `/app` 481/168/155, `/pricing` 188/143/124, `/help` 279/140/134, `/signin` 315/265/233, `/templates` 542/450/349 (slowest).
- Theme: a new visitor with the OS set to Light gets Dark. Sidebar Light/Auto/Dark set `data-theme` and `keplar-theme` correctly.
- **New angles:**
  - **Zoom:** same 28 routes at 200% (1920 → 960x540 CSS), 150% (1366 → 911x512) and 125% (1366 → 1093x614), 84 loads: no sideways scroll, no clipping, no errors.
  - **axe-core** (WCAG 2.0/2.1 A+AA + best-practice) on 18 routes at 1366 Dark and 390 Light: 0 critical/serious findings. The moderate ones are bugs 1–2 below, plus a heading-order skip in the `/product` demo card (left alone).
  - **Keyboard:** Tab order on `/`, `/app`, `/pricing`, `/signin`, `/signup`, `/help`, `/app/create` and `/contact` follows the visual order. The skip link comes first on marketing pages, and there are no traps. Ctrl K search opens as a modal, focuses its input, keeps Tab inside, and Escape returns focus to the Search button (desktop). Focus on pricing FAQ items inside a not-yet-revealed section fades in within 400 ms, so it is fine.
  - **Reduced motion:** with `prefers-reduced-motion: reduce`, `/`, `/product`, `/how-it-works`, `/simulation` and `/app` run 0 CSS animations and the Three.js canvases stay still. Without it, the ambient loops run as designed.
  - **Error states** (mocked, no meter use): a 500 from `/api/keplar` shows "Keplar couldn't finish this answer." with Retry; offline shows "Connection lost. Couldn't reach Keplar. Your question is saved." with Retry. The meter is not charged in either case.
- Ask (signed-out Free): 11 real questions reached the API (9 answered, 2 refused by bug 3). Answers were correct: Everest boiling point ≈68–70 °C (2 of 2 agree), 5 mi ≈ 8.05 km, Pride and Prejudice by Jane Austen in 1813, `print(s[::-1])` (2 of 2), ibuprofen + paracetamol is generally fine with dose limits, 7×8 = 56, Au, seven continents (2 of 2), √144 = 12. The meter went 50→49→48→47 (1920) and 50→46 over the last 4. One `POST /api/keplar` per question.

### Bugs found
1. **Two `<main id="main">` on `/simulation`.** The page wrapped its content in its own `<main id="main">` inside the marketing layout's one: nested main landmarks and a duplicate id (axe `landmark-no-duplicate-main`, `landmark-main-is-top-level`, `landmark-unique`).
2. **Heading skip on `/agents`.** The "Autonomy without losing control." heading was an h3 straight under the page h1 (axe `heading-order`).
3. **Signed-out Free got only 3 questions a minute, not 6.** The 4th question within about 20 s was refused with "You're asking quickly. Wait a few seconds and try again." The cause: the anonymous user's burst key is `use:ip:<ip>:burst`, and the separate network cap used the *same* key. So each question added 2 to one counter, and the limit of 6 tripped on question 4. Reproduced live twice (1920, then the 390 context's first question on the same IP).
4. **Phone sidebar drawer dropped focus on `<body>` when it closed.** This happened on Escape or when you picked Projects/Agents/Business with the keyboard, so the next Tab started from the top of the page.

### Fixes applied
- `bc33451` + `8e79eff` fix(a11y): `/simulation` renders `<Journey />` straight into the layout's main. Static guard `tests/marketing-landmarks.test.ts` checks that no `(marketing)` page renders its own `<main>`.
- `0018643` fix(a11y): the `/agents` controls title is an h2 when the section title is the page h1 (it stays h3 on home).
- `03f3aea` fix(free): the network-wide burst cap for signed-out visitors uses its own key `use:net:<ip>:burst`. New test in `tests/limits.test.ts`: an anonymous Free visitor gets exactly `burstPerMin` questions a minute. It fails on the old code and passes now.
- `13878cf` fix(a11y): when the drawer closes, focus returns to the "Open sidebar" button unless the next view already took it (composer, dialog). There is a Playwright test in `e2e/a11y.e2e.ts`, which runs in the deploy gate.

### Deploy
- **Yes.** `node scripts/deploy.mjs HEAD` at master `13878cf` from a clean worktree. typecheck, lint, unit, build and smoke e2e (including the new drawer test) all PASS on the first attempt. https://keplar-6w4n217sj-team-6667.vercel.app is aliased to https://keplar.one, and the post-deploy smoke is all PASS. Worktree removed. This deploy also shipped other agents' committed master work since the last aliased build (`1705fc5`…`216d0cd`: Free day budget from the real OpenRouter quota, instant titles keep `%`/`$`/`^`, the home tiles fix, the startup-race fix with `data-app-ready`). `data-app-ready` was not on live before this deploy and is there now.
- Verified live: `/simulation` has 1 `main`/1 `#main`; `/agents` reads h1 → h2 → h2…. Four quick signed-out questions in 18 s all got 200s with correct answers (the 4th was refused before). At 390, Escape and picking Projects both leave focus on "Open sidebar". route-smoke 90/90.
- Others' WIP stayed unstaged: `docs/create.md`, `screenshots/tools/`, `test-results/`.

### Not fixed / noted
- On the `/product` demo card, "Keplar Answer" is an h3 with no h2 before it inside the demo (moderate, cosmetic for screen readers). Left alone.
- Keyboard focus is shown as a brightness shift, not an outline or ring. That is the deliberate design from `e961498`. It is subtle on some links, so worth a look with a real screen reader or keyboard user.
- In `/app`, Escape blurs whatever is focused (by design in `KeplarApp`), so keyboard users lose their place in the sidebar after pressing it.
- A 500 from `/api/keplar` shows the server's error string under "Keplar couldn't finish this answer." That is fine as long as server messages stay human-readable.
- Signed-in Ask, Create, settings dialog and Agents: **blocker**. There are still no QA test credentials in env, and I skipped founder accounts.

### Blockers for founder
- Live signed-in QA credentials (or a safe test account) are still not in env (recurring).
- Microsoft sign-in shows "Coming soon". It needs Microsoft (Entra) OAuth app credentials if it should go live (recurring).
- Stripe live activation / $1 test sale is still founder-side if not already done (recurring).
- No new founder-only blockers this pass.

## 2026-10-05 ~06:20 EDT (06:19–06:58) — scheduled QA + auto-fix pass (signed-out live, real Ask prompts)

### Checked
- State first: the 04:17 EDT scheduled run left no log entry, no commit and no worktree, but it did start. `/tmp/qa0505/` has its scripts (`a.mjs` 04:29, `b.mjs` 04:31) and screenshots (`_r_bogus.png`, `_i_bogus.png`, `_team.png`, last written 04:31:46 EDT), then nothing else. It was sweeping less-visited routes (`/r/bogus`, `/i/bogus`, `/team`, `/ai-vs-agi-vs-superintelligence` …) at 768/390/1440 and had started looking at the `/r/bogus` theme (its 390 Light screenshot is Dark, which is bug 1 below). No lock files, no stuck git operation, and disk was fine (66 % used). The most likely cause is that the run was cut off (agent time or turn budget) mid-investigation. I can't tell more from the box. Cleanup: removed the 34 stale `/tmp/keplar-deploy-<sha>` worktrees from 2026-10-04 (every commit is on master; contents were only `test-results/`, plus one ad-hoc `live2.mjs`, archived to `/tmp/qa-archive/`), then ran `git worktree prune`. That freed about 12 GB. Other agents' worktrees (`/tmp/kp-*`, `/tmp/kv`, `/tmp/kw`, `/tmp/cw`, `/tmp/seo-wt` …) and the `next start -p 3475` server running from `/workspace/kp-new` were left alone.
- `node scripts/smoke-prod.mjs https://keplar.one` after the deploy: all PASS (`/` 186 ms, `/pricing` 63, `/signin` 175, `/status` 180, `/help` 60, `/contact` 154, `/security` 66, `/app` 63). `node scripts/route-smoke.mjs https://keplar.one`: **90/90** after the deploy.
- Sweep of 20 routes (`/`, `/app`, `/app/create`, `/pricing`, `/help`, `/signin`, `/signup`, `/forgot-password`, plus the 04:17 run's unfinished set: `/r/bogus`, `/i/bogus`, `/s/bogus`, `/reset-password?token=bogus`, `/verify-email?token=bogus`, `/two-factor`, `/team/join`, `/ai-vs-agi-vs-superintelligence`, `/for-students`, `/glossary`, `/compare-ai-models`, `/this-does-not-exist`) at 1920x1080 / 1366x768 / 390x844 in Dark / Light / Auto, 180 page loads. No sideways scroll, no clipped text (the off-screen spans on `/` at 1920 belong to the Creation gallery's clipped scroll track, which is by design), Google Sans everywhere, no page errors. Only console errors: the known 401 from `GET /api/sites` on `/app/create`, and the 404 status of the bogus routes themselves. `/i/<token>` is a plain-text 404 from the image route and `/s/<slug>` is the published-site renderer's own 404, both expected. The 90 internal links I collected have **0** ≥400 (the two 404 hits are the 404 pages' own URLs). Then 90 loads after the deploy (10 core and dynamic-404 routes × 3 widths × 3 themes): 0 flagged, and `data-theme` matched on every load including `/r/bogus` and `/answers/bogus-x`. Dark `load` times after the deploy (ms, 1920/1366/390): `/` 537/411/541, `/app` 234/289/161, `/pricing` 159/151/123, `/help` 211/170/115, `/signin` 1354/259/370.
- Ask (signed-out Free): 15 real questions sent over 5 fresh browser contexts, 12 counted (2 over-long refusals and 1 quality-gate refusal were not charged). Answers were correct: sodium = Na, a leap year has 366 days (2 of 2 agree), 100 °F ≈ 37.78 °C with the working shown, Leonardo da Vinci painted the Mona Lisa c. 1503–1506 (refined to ~1517), the capital of France and of Egypt asked in Arabic (answered in Arabic: باريس / القاهرة), the meaning of pneumonoultramicroscopicsilicovolcanoconiosis, and `items = items[::-1]` (2 of 2). The meter went 50→49→48→47→46 (1366, 4 questions incl. the double-submit), 50→49→48 (390 Light, 3 sent), and stayed put on the 400s and the refusal. Model time on the card was 0.8–4.2 s. One weak spot: asked to repeat a 180-character `xxxx…` token, the free model wrote "xxxxx... (exactly as given)". On a 120-character `yyyy…` token at 390, the quality gate refused the answer ("couldn't produce a reliable answer"). That's model behaviour, not a site bug.
- **New angles:**
  - **Double-submit:** Enter, Enter, then a click on Send within ~100 ms sends exactly **1** `POST /api/keplar` and charges once.
  - **Long prompt / paste:** a pasted 21,400-character prompt fills instantly (24 ms). The server refuses it with 400 before any charge, but showed the raw "prompt must be under 16000 characters." (bug 3). Typing after a 14.9k-character paste (keydown → second animation frame, 53 keys, headless with software GL): 1920 p50 34.7 ms / p95 91 / max 142, 390 p50 18.1 / p95 20 / max 54, 0 long tasks. A same-harness baseline with an empty composer at 1920 was p50 37–52 / p95 67, and at 3k/15k characters p50 23–29 / p95 70–87. So text length doesn't slow typing down. The 1920 tail is software-GL frame cost at full HD in headless mode, not the composer.
  - **RTL / long words:** Arabic questions and answers rendered left to right, with the Arabic full stop and question mark on the wrong side (bug 2). A 180-character unbroken token wraps inside the bubble and the card, with no sideways scroll at 1366 or 390.
  - **Back/forward:** `/`→`/pricing`→`/help`→`/signin`, then back ×3 and forward ×2: every step restores in 39–74 ms with the theme kept and the page scrollable. Scroll position is restored (1500 → 1500 on `/pricing`). Real bfcache can't be judged here: Playwright's Chrome disables it from the command line (`BackForwardCacheDisabledByCommandLine`). Pages also listed `OutstandingNetworkRequestFetch`, which is worth a real-browser check. The `/app` composer draft is not kept when you leave and come back (there's no draft persistence; noted, not a bug).
  - **Slow 3G** (CDP: 500 kbps, 400 ms RTT, 4× CPU, 390 cold): `/` FCP 2.44 s, `load` 6.2 s, 325 kB. `/app` `load` 5.7 s, `data-app-ready` 9.1 s, 277 kB. `/pricing` FCP 2.13 s, 290 kB. `/signin` FCP 2.26 s, 321 kB. TTFB 78–116 ms.
  - **Deep links with query strings:** `/pricing?plan=pro&utm_source=qa#faq`, `/signin?next=%2Fapp%2Fcreate`, `/signup?ref=qa&next=/pricing`, `/app/create?template=bogus`, `/help?q=billing`, `/app?view=agents`, `/app?%3Cscript%3E=1`, `/forgot-password?email=a%40b.c` and `/?utm_source=x&utm_medium=y` all return 200 with the right page and no errors. `/checkout?plan=nope` redirects to `/pricing`.
  - **404 / dynamic not-found:** `/this-does-not-exist` is a static 404 in the right theme. `/r/<bad>`, `/answers/<bad>`, `/templates/<bad>` and `/topics/<bad>` return 404 with Next's client-rendered error shell (`<html id="__next_error__">`), which caused bug 1. `/glossary`, `/blog` and `/vs` unknown slugs render server-side.
  - **Print:** printing `/pricing` gave 8 mostly blank sheets (bug 4).

### Bugs found
1. **Dynamic not-found pages ignored a saved Light/Auto theme.** On `/r/<revoked token>`, `/answers/<unknown>`, `/templates/<unknown>` and `/topics/<unknown>`, Next client-renders the error shell. React inserts the head THEME_SCRIPT without running it, so `data-theme-pref` stays at the server default, and ThemeWatcher then re-applied Dark from that attribute. Seen live at all three widths. Some loads also showed a brief unstyled moment (Times New Roman, no `data-theme`) before hydration.
2. **Right-to-left text laid out left to right.** Answer blocks and the question bubble had no `dir`, so "عاصمة فرنسا هي باريس." showed its full stop on the left (LTR start) and the question mark sat on the wrong side.
3. **Raw validation text for an over-long question.** Pasting more than 16,000 characters showed "Keplar couldn't finish this answer. prompt must be under 16000 characters." The per-plan check below it already uses a readable sentence.
4. **Print was broken on marketing pages.** Scroll-reveal blocks that were never scrolled into view stayed at opacity 0 (no plan cards, no FAQ), the fixed nav and the skip link repeated on every sheet, Dark printed near-white ink on white paper, and count-up prices that hadn't animated yet printed as "$0" (Lite/Plus/Pro).
5. **"Not charged" said twice.** The Free quality-gate card read "…and nothing was charged. Please retry. You were not charged."

### Fixes applied
- `68f9aff` fix(theme): new `storedThemePref()` (localStorage, then the cookie). ThemeWatcher applies the saved choice before falling back to the attribute. Test in `tests/theme.test.ts`.
- `87a6307` fix(answers): `dir="auto"` on answer paragraphs, headings, lists, list items, quotes and the question bubble. English and other LTR answers are unchanged. Static guard in `tests/answer-rtl.test.ts`.
- `788cf1b` fix(ask): the over-limit message is now "That message is too long (up to 16,000 characters). Shorten it and try again." Test in `tests/long-prompt.test.ts`.
- `d6a5395` fix(answer card): `needsChargeNote()` adds "You were not charged." only when the message doesn't already say it. Test in `tests/no-response.test.ts`.
- `6716e64` fix(print): a print-only block in `globals.css` (reveal forced visible, skip link hidden, Light ink tokens on paper), plus print rules in `Nav.module.css` and `CookieBanner.module.css` that hide the nav and cookie banner. `CountUp` shows the real price on `beforeprint`. The screen is unchanged. Test in `tests/print.test.ts`.

### Deploy
- **Yes.** `node scripts/deploy.mjs HEAD` at master `6716e64` from a clean worktree. typecheck, lint, unit, build and smoke e2e all PASS on the first attempt. https://keplar-cxupi76u2-team-6667.vercel.app is aliased to https://keplar.one, and the post-deploy smoke is all PASS. Worktree removed.
- Verified live: with Light saved, `/r/bogus`, `/answers/bogus-slug-xyz`, `/templates/bogus-xyz` and `/topics/bogus-xyz` stay Light (2 loads each; Dark stays Dark). "ما هي عاصمة مصر؟" answers "عاصمة مصر هي القاهرة." right-aligned with the full stop on the correct side, and the bubble reads correctly. A 17,111-character paste now shows "That message is too long (up to 16,000 characters). Shorten it and try again." and is not charged (meter stayed at 49). Printed `/pricing` now has all plan cards ($0 / $20 / $45 / $99 / Custom), the usage table, FAQ and footer, with ink `rgb(9, 9, 11)`, and the nav and skip link hidden. route-smoke 90/90, smoke-prod all PASS. I did not see the double "not charged" card again (the quality gate didn't trip after the deploy); the unit test covers it.
- Others' WIP stayed unstaged: `docs/create.md`, `screenshots/tools/`, `test-results/`.

### Not fixed / noted
- Dynamic not-found routes (`/r`, `/answers`, `/templates`, `/topics`) still return Next's client-rendered error shell instead of server-rendered not-found HTML, so there can be a short unstyled flash before hydration. The theme is now right; the root cause (notFound() in these force-dynamic or streamed pages) needs a closer look with a local prod build and DB.
- The composer textarea has no `dir="auto"`, so typing Arabic runs left to right while you type. I left it alone because the caret and insert-mode overlays (SmoothCaret / InsertMode) measure the text and need checking with RTL first.
- The composer doesn't warn before sending that a question is over the plan limit (Free 6,000 / 16,000 max). The server refuses it uncharged with a readable message, and Edit puts the text back.
- `/app/create` has no h1 when signed out (axe moderate). The `/app` composer draft isn't kept across navigation.
- Signed-in Ask, Create, settings dialog and Agents: **blocker**. There are still no QA test credentials in env, and I skipped founder accounts.

### Blockers for founder
- Live signed-in QA credentials (or a safe test account) are still not in env (recurring).
- Microsoft sign-in shows "Coming soon". It needs Microsoft (Entra) OAuth app credentials if it should go live (recurring).
- Stripe live activation / $1 test sale is still founder-side if not already done (recurring).
- No new founder-only blockers this pass.

## 2026-10-05 ~08:28 EDT (08:57–09:02) — scheduled QA pass (lean, signed-out live)

### Context
- Two background executors for this run failed immediately with `resource_exhausted` (08:28 and 08:56), so this was a short pass run directly instead of the full browser matrix.

### Checked
- `node scripts/smoke-prod.mjs https://keplar.one`: all PASS (`/` 303 ms, `/pricing` 63, `/signin` 160, `/status` 201, `/help` 64, `/contact` 164, `/security` 66, `/app` 67, `/api/health` 200, `/admin` 404 when signed out, HSTS + nosniff present).
- `node scripts/route-smoke.mjs https://keplar.one`: all 90 route loads ok.
- curl status sweep: `/`, `/app`, `/app/create`, `/pricing`, `/help`, `/signin`, `/signup`, `/forgot-password`, `/security`, `/status`, `/contact`, `/agents`, `/product`, `/simulation` all 200. `/create` 308 to `/app/create`. `/settings`, `/app/settings`, `/login`, `/auth/signin`, `/team` are 404 (none are linked routes; settings is a dialog inside `/app`).
- Ask API (signed-out Free, one real question): "What is 7 times 8?" streamed `56` with one fast model; daily meter reported used 1 / limit 50 / left 49.
- Over-long prompt (17,000 chars): 400 with "That message is too long (up to 16,000 characters). Shorten it and try again." (06:20 fix still live).

### Bugs found / fixes
- None new. No commits besides this log entry. No deploy (nothing to ship).

### Not covered this pass
- No Playwright pass across themes and widths, no console-error crawl, no composer latency measurement (executor capacity unavailable). Next scheduled pass should resume the full matrix.
- Signed-in Ask, Create, settings dialog and Agents: still blocked on QA test credentials (recurring).

### Blockers for founder
- Same recurring list as 06:20 (QA test account credentials, Microsoft Entra OAuth credentials, Stripe live activation). No new founder-only blockers.

## 2026-10-05 ~10:30 EDT (10:28–11:05) — scheduled QA + auto-fix pass (signed-out live, real Ask prompts)

### Checked
- State first: master was at `0a79733`, and production (`keplar-7r19ihmuc`) was already serving `b399800` from the 08:4x deploy. The stale `/tmp/keplar-deploy-b399800` worktree (only `test-results/`) was removed after this pass's deploy. Others' WIP (`docs/create.md`, `screenshots/tools/`, `test-results/`) was left unstaged.
- Sweep (`/tmp/qa1030/sweep.mjs`): 20 routes (`/`, `/app`, `/app/create`, `/pricing`, `/help`, `/signin`, `/signup`, `/forgot-password`, `/status`, `/contact`, `/security`, `/product`, `/simulation`, `/agents`, `/blog`, `/privacy`, `/terms`, `/about`, `/changelog`, `/templates`) at 1920 / 1366 / 390 in Dark / Light / Auto, 180 loads. No sideways scroll, Google Sans everywhere, one `main` and one `h1` each, `data-theme` right on every load, no page errors. The only console error is the known 401 from `GET /api/sites` on signed-out `/app/create`. The 85 internal links I collected have **0** ≥400. Dark `load` (ms, 1920/1366/390): `/` 1904/457/472 (cold first load), `/app` 415/765/721, `/pricing` 492/129/138, `/help` 1453/197/155, `/signin` 400/293/312.
- Sideways overflow at 320 and 360 (22 routes, mobile emulation): none.
- New check, mid-word line breaks: a Range-per-word detector on 24 routes at 3840 / 1920 / 1366 / 1024 / 390 / 320 found bugs 1–4 below.
- `/app` signed out: Dark is the default for a new visitor. The sidebar Light / Auto / Dark radios apply at once and persist across reload and onto `/pricing`. Auto follows the system both ways, including a live system switch. Ctrl+K opens Search. Create, Projects, Agents, Business, Deployments, Slides, Study and History all open their views. Memory, Usage and Settings link to `/account`, which redirects to `/signin` (next defaults to `/account`). At 1280x600 and 1366x768 the last suggestion card scrolls clear of the composer.
- Ask (signed-out Free): 8 real questions sent from the browser (4 at 1366 Light, 3 at 390 Dark, 1 table check at 390), plus 1 API call. All answers were correct: 212 °F (2 of 2 agree); "Who made Keplar?" got the instant creator answer (Hassen, Hussain and the Keplar team, founded 2026, both 14); an `isPalindrome` JS function (2 of 2; it strips spaces but not other punctuation, which is fine for the prompt); seven continents with Asia largest (~44.6M km²); a Python / JavaScript / Go markdown table; 15 % of 240 = 36; Rayleigh scattering in two sentences (single model). The meter went 50→49→48→47→46 and then 50→49→48→47 (new context), one per question. Card time was 3.0–18.4 s (the table took 18.4 s). The API answer came from `free:nemotron-3-super`, which routes to `nvidia/nemotron-3-super-120b-a12b:free` at $0. The answer table at 390 is in an `overflow-x: auto` wrapper (518px of table in a 326px column), so it scrolls sideways rather than being cut.
- Typing: home composer (`scripts/typing-latency.mjs`, 1366) p50 3 ms / p95 6 / max 6, 0 long tasks. `/app` composer (keydown → second frame, headless software GL, 1366): empty p50 35–37 / p95 46–54; with 3k chars p50 16–19 / p95 50–52; with 15k chars p50 16–17 / p95 50–56. Same range as the 06:20 pass, so the length of the text doesn't slow typing down.
- Pricing CTAs signed out: Lite / Plus / Pro go to `/signin?next=/checkout?plan=…` and Contact goes to `/inquire`. Sign-in with a wrong password shows "Incorrect email or password." Submitting an empty sign-up form is blocked by the browser's required-field check on email. No broken images on 15 marketing routes after a full scroll.

### Bugs found
1. **/help topic tiles at 1920:** the tile titles used the page `--t-title` size (55.7px in a ~270px column), so "Connected apps and the desktop app" broke as "Connecte / d apps…" and that tile was 422px tall next to 242px tiles. At 1366 it was 3–4 lines.
2. **Footer, every page, 900–1150px wide:** Learn's two ~80px columns split "What is superintelligence?" as "superintellige / nce?".
3. **/simulation note on phones:** the centred "SIMULATION · Pre-written sample. No model is called, nothing is measured." pill was absolutely positioned at `left: 50%` with no width, so it shrink-wrapped to half the screen. It was 195x90 (5 lines) at 390 and 160x179 at 320, where it ran into the "A guided walkthrough" eyebrow.
4. **Create tabs at 320:** with the 44px-target padding, Site / Images / Video (Beta) / Mobile (Beta) didn't fit, and the labels broke mid-word ("Sit / e", "Imag / es").

### Fixes applied
- `5e479ff` fix(help): tile title `clamp(1.375rem, 1.9vw, 3rem)` with `overflow-wrap: break-word`, and the tiles are equal height (`.tiles > li { display: grid }`). Test in `tests/help-tiles.test.ts`.
- `260c38f` fix(footer): Learn list is one column from 900 to 1199px and two columns again from 1200px. Test in `tests/footer-wrap.test.ts`.
- `cc4c6f1` fix(simulation): `width: max-content` (still `max-width: min(92vw, 720px)`) on the note. Test in `tests/simulation-banner.test.ts`.
- `d229d99` fix(create): `.segBtn` labels never wrap. The Create tab strip can scroll sideways, and at ≤380px the padding is tighter and "(Beta)" quieter. Test in `tests/create-tabs.test.ts`.

### Deploy
- **Yes.** `node scripts/deploy.mjs HEAD` at master `d229d99` from a clean worktree. typecheck, lint, unit (122 s), build and smoke e2e all PASS. https://keplar-nk2b96wvh-team-6667.vercel.app is aliased to https://keplar.one, and the post-deploy smoke is all PASS. Worktree removed.
- Verified live: the mid-word detector on `/help`, `/pricing`, `/app/create`, `/simulation` and `/` at all six widths found **0** breaks. A 600–1600px footer sweep in 10px steps found **0** breaks. The /help tiles at 1920 are all 36px / 240px tall. The simulation note is 294x46 at 320 and 359x46 at 390. The Create tabs are 288/288 at 320 and 351/351 at 390, all 44px tall. route-smoke 90/90.

### Not fixed / noted
- Signed-out `/app/create` still logs a 401 for `GET /api/sites`. It's the signal that shows the sign-in gate, so it isn't user-facing; silencing it would need the session state on the client first.
- Wide answer tables on phones scroll inside their wrapper with no visible scroll hint (an edge fade would help). It's a polish item, not breakage.
- These carry over from 06:20: dynamic not-found routes still use Next's client-rendered error shell; the composer textarea has no `dir="auto"` for RTL typing; there's no warning before sending that a question is over the plan limit; the `/app` draft isn't kept across navigation.
- Signed-in Ask, Create, settings and Agents: **blocker**. There are still no QA test credentials in env, and I skipped founder accounts.

### Blockers for founder
- Same recurring list: live signed-in QA credentials (or a safe test account); Microsoft (Entra) OAuth credentials if Microsoft sign-in should leave "Coming soon"; Stripe live activation / $1 test sale if not already done. No new founder-only blockers.
