# Public launch checklist

Pass date: Sunday Oct 4, 2026 (ET). Production: https://keplar.one. Everything below was measured or run in that pass;
nothing is estimated. "Verified" says how: **prod** = against the live site, **local** = production build on this machine,
**unit** = `npm test` (node:test), **e2e** = Playwright suite (`npm run test:e2e`, Chromium).

QA scripts added in this pass (re-runnable):

| Script | What it does |
|---|---|
| `node scripts/launch-crawl.mjs [base]` | Visits every sitemap URL (plus `/app`, `/signin`, `/signup`, …) in Chromium; reports status, console errors, failed requests, broken images, placeholder text, missing title/description/canonical/one h1, horizontal scroll; then checks every internal and external link found. |
| `node scripts/launch-tour.mjs http://localhost:3470` | Signs in with a magic link on a **local** test server (dev outbox) and visits every signed-in surface at desktop and phone width. |
| `npx lighthouse@12 <url> [--preset=desktop]` | Lighthouse (headless Chromium, default mobile throttling: 4x CPU, slow 4G). Raw numbers below. |

## Done (verified)

### 1. Public routes and links
- **168 pages** crawled on prod (162 sitemap URLs + app/auth/status/404 probes): every sitemap URL is 200; no console errors, failed requests or broken images; every page has a title, description, canonical and exactly one `h1`; no horizontal scroll at 1280 px. All internal links found, all 28 external links and all 10 GitHub release links on `/download` (v0.1.5 installers, checksums, release page) answer 2xx/3xx.
- Text scan found no lorem/TODO/undefined. The only hits are legitimate words (docs say image ideas are "placeholders" in decks; `example.com` as a DNS example; the desktop install doc's "if the page says … coming soon" troubleshooting line).
- Fixed: `/signin` and `/signup` showed a disabled **Microsoft** button with a "Not configured" badge to every visitor. It now says **Coming soon** and carries no server/key wording (`ProviderButtons.tsx`, test `tests/launch-auth.test.ts`).
- Added `/status` (was a 404): live checks of website, database round trip, model access, checkout and the two cron jobs. Linked from the footer, `noindex`, not in the sitemap.

### 2. Accounts and billing
- Magic link, password sign-up/sign-in, forgot/reset password, email verification, Google/Microsoft wiring, account export/delete, Whop checkout, webhook, plan limits and usage meter are covered by `tests/*.test.ts` (1,220+ unit tests pass: `magic-link`, `password-auth`, `oauth`, `privacy`, `whop`, `billing-*`, `free-plan`, `lite-plan`, `limits`, `usage-meter`, `daily-use*`) and the e2e suite (`usage-meter`, `multi-account`, `desktop-auth`, …).
- **prod**: real email from the real sender. Gmail history for team@keplar.one shows "Your Keplar sign-in link", inquiry, and alert mails from `no-reply@keplar.one` in the **Inbox** (not spam) as recently as Oct 3. That is the same Google Workspace domain, so delivery to outside providers (gmail.com, outlook.com, Yahoo) is **not** proven here.
- **prod**: "Continue with Google" on `/signin` reaches Google's own sign-in for "Keplar One" with `redirect_uri=https://keplar.one/api/auth/callback/google` and no error page.
- **prod**: both Whop checkout plans (`plan_wd9Xs4iDlwvDi` Plus, `plan_M6ztgSJDucMJA` Pro) resolve at whop.com/checkout. Prices on `/pricing` match code (Lite $20, Plus $45, Pro $99). No purchase was made.
- **prod**: unauthenticated `POST /api/billing/checkout` and `/api/account/delete` → 401; unsigned `POST /api/webhooks/whop` → 401.

### 3. States
- Signed-out `/app` renders (Free meter, starters, composer), `/account` and `/checkout` redirect to sign-in with `next=`, first sign-in lands on `/welcome` (onboarding), `/admin` is a plain 404 for non-admins. Local signed-in tour: 13 surfaces × 2 widths, no console errors, no placeholder or "Not configured" text, no horizontal scroll.
- 404 page ("Nothing converged here.") is served with HTTP 404. `error.tsx` now shows the error **reference** and `team@keplar.one`; new `global-error.tsx` covers a failing root layout. Test: `tests/launch-field-guard.test.ts`.

### 4. Security (prod unless noted)
- Headers on `/`: CSP (default-src 'self', frame-ancestors 'none', object-src 'none', upgrade-insecure-requests; script/connect/img/frame allow `cdn.whop.com`/`api.whop.com` only for the embedded checkout), HSTS 2 years + preload, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, COOP same-origin. `security.txt` served.
- Authz: `tests/authz.test.ts` walks every `route.ts` (127 routes) and fails if an unreviewed route answers an anonymous caller; cross-user isolation tests. prod probe of 15 sensitive GETs: 401/404 (only reviewed public routes answer 200).
- CSRF: cross-site `POST` (Origin `evil.example`) to `/api/feedback` and `/api/account/delete` → 403 `bad_origin`.
- Rate limits: edge 240/min per IP on `/api`; per-account/IP limits on sign-in, magic link, `/api/keplar`, checkout, images, video, sites, MCP, feedback, inquire (see `docs/security.md`). Limiter is Postgres-backed in prod (no Upstash key set), so it is shared across instances.
- Spend: operator kill switches, hourly provider/model caps, spike auto-pause, per-plan quotas, admin daily cap (`src/lib/ops`, `docs/cost-model.md`, runbook `cost-emergency.md`). Input caps: 16,000-character prompts, 4.5 MB bodies, image type/size/count validation.
- Secrets: the only `NEXT_PUBLIC_` variable in Vercel is the site URL; all others are server-only and the sensitive ones are marked Sensitive.

### 5. Performance
Real Lighthouse 12 numbers (headless Chromium, run from this box on Oct 4, 2026) are in the table at the end of this file. Page weight is 560-720 KiB per page; total built JS is 2.7 MB split into chunks (largest 533 KB, loaded only by the surfaces that need it). `public/` has no raster images over 20 KB (icons only); OG images are generated.
- Fixed: on a CPU-rendered WebGL context (no GPU: SwiftShader/llvmpipe, VMs, remote desktops, headless audit tools) the home page's particle engine stalled the main thread for seconds (Lighthouse mobile 60). Both particle layers (home and page-wide) now stay off there and when WebGL is missing, and the home page shows its static composition (`src/field/caps.ts`, `PageField.tsx`, `engine.ts`). Real GPUs are unaffected. The `?fq=` QA override still forces the layer on.
- Fallbacks present: no WebGL → static figure; reduced motion → slow drift (see Known issues); weak devices/data saver/mobile → lower tier and capped pixel ratio; context loss → rebuild.

### 6. Accessibility basics
- Lighthouse accessibility **100** on every audited page, mobile and desktop. Skip link, `lang="en"`, labelled cookie region, visible `:focus-visible` rings; keyboard Tab walk on `/`, `/signin`, `/pricing`, `/feedback` reached 14 stops each and every stop had a visible ring except the home composer textarea (its container shows the focus state).

### 7. SEO and social
- Titles, descriptions, canonicals, OG/Twitter images (1200×630, generated), favicon (ico/png/svg), apple-icon, manifest, `robots.txt`, `sitemap.xml` (162 URLs, real `lastmod`), `llms.txt`, `www` → apex 308. `/app`, `/signin`, `/account`, `/checkout`, `/feedback`, `/status` are `noindex`. Lighthouse SEO is 100 on indexable pages (66 on the intentionally `noindex` ones).

### 8. Observability
- `/api/health` (store + write/read/delete round trip, 503 on failure) and now `/api/health?crons=1`. New cron heartbeats: each Vercel cron records success/failure and `/status` shows **ok / late (>30 h) / failed / never**. First real readings appear after the next scheduled runs (04:37 and 05:17 UTC).
- Every `/api` response has `x-request-id`; server logs are JSON lines with `reqId`; operator alert emails (refunds, abuse reports, failures) go to team@keplar.one; `/admin` shows spend, model errors, key status.
- Error tracking (added by another executor in this window, commit 7510daa): scrubbed, fingerprint-grouped errors in the database (server, `onRequestError`, browser error boundary), viewable at `/admin/errors`; optional Sentry forwarder when `SENTRY_DSN` is set. Mock-tested only; not exercised with a real Sentry project. The error page shows the digest to the user.

### 9. Legal and contact
- `/privacy` and `/terms` linked from the footer, the cookie notice and sign-up. Cookie notice: essential cookies always; analytics off until accepted ("Accept all" / "Reject non-essential" / "Customize"; footer "Cookie settings" reopens it). `team@keplar.one` is the contact in the footer, on `/feedback` (also emailed there via Resend), `security.txt`, error pages and `/status`.

### 10. Cross-browser
- **Chromium**: everything above.
- **Firefox 155 (Playwright build, desktop and phone width)**: `/`, `/pricing`, `/signin`, `/signup`, `/how-it-works`, `/docs`, `/feedback`, `/privacy`, 404 → right status, `h1`, no console errors, no horizontal scroll (18 page loads).
- **WebKit 26.6 (Playwright's Linux build, not Safari)**: same pages load and render; this build has no WebGL, so it exercised the no-WebGL path (before the fix it logged three.js "Error creating WebGL context"; the layer is now skipped when WebGL is missing).
- **Safari (macOS/iOS) and real mobile browsers cannot be run here.** Not tested: Safari-specific behaviour (date inputs, `100vh`, audio/mic permission prompts, ITP cookie limits on the Google/Microsoft redirect), iOS PWA install, real GPU performance.

## Needs founder action

| # | What | Why / how |
|---|---|---|
| 1 | **Add a DMARC record** | `dig`/DNS check: `_dmarc.keplar.one` does not exist. SPF (Google + IONOS) and DKIM (`google._domainkey`, `resend._domainkey`) exist; Resend's bounce domain `send.keplar.one` has its own SPF and MX. Add TXT `_dmarc` = `v=DMARC1; p=none; rua=mailto:team@keplar.one; adkim=r; aspf=r` now; move to `p=quarantine` after two weeks of clean reports. Gmail/Yahoo bulk-sender rules expect it. (DNS is at IONOS: ns1032.ui-dns.de etc.) |
| 2 | Confirm outside-inbox delivery | Request a sign-in link to a gmail.com and an outlook.com address you own; check Inbox vs Spam. |
| 3 | Google OAuth consent screen status | Must be **In production** (not "Testing") and the Privacy/Terms URLs set, or only listed test users can sign in. Can't be seen from here. |
| 4 | Microsoft sign-in keys | `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` (redirect `https://keplar.one/api/auth/callback/microsoft`). Until set the button reads "Coming soon". |
| 5 | Whop | In the Whop dashboard confirm the webhook `https://keplar.one/api/webhooks/whop` is subscribed to `payment.succeeded`, `membership.activated`, `membership.deactivated`, `payment.failed`, `membership.cancel_at_period_end_changed`, `refund.created`, `dispute.created` and uses the secret stored as `WHOP_WEBHOOK_SECRET`. Then make **one real purchase of the cheapest plan and refund it** (end-to-end proof; no test can replace it). `WHOP_PLAN_LITE` is set; Plus/Pro use the built-in plan ids. |
| 6 | Stripe live-mode decision | Stripe is used only for sellers' payments in Business (Connect). Production runs in test mode unless `KEPLAR_STRIPE_MODE=live`; follow the go-live checklist in `docs/business-os.md`. If Business is not part of launch, leave it in test and keep it labelled Beta. |
| 7 | Legal entity, postal address, governing jurisdiction | Terms/Privacy show marked notes until supplied (`docs/legal-open-decisions.md`, `site.legalEntity`). Counsel review; the pages say they are not attorney-reviewed. |
| 8 | Search Console / Bing | `google-site-verification` TXT already exists on keplar.one, so a Domain property can be claimed; submit `https://keplar.one/sitemap.xml`; add Bing Webmaster. |
| 9 | Optional but recommended keys | `UPSTASH_REDIS_REST_URL/TOKEN` (faster shared rate limits; Postgres is the fallback today), `INNGEST_EVENT_KEY/SIGNING_KEY` (Business agent schedules do not run without them; `/api/inngest` answers 503), `KEPLAR_ALERT_WEBHOOK_URL`, `SENTRY_DSN` if you want errors forwarded to Sentry. |
| 10 | Clean up env and inbox | Vercel still holds `KEPLAR_DEMO_PLAN` and `KEPLAR_BILLING_MODE`, which no code reads anymore: delete them. team@keplar.one holds ~200 `[Keplar alert] Whop refund for own-…@example.com` test alerts from earlier webhook testing: filter or delete. |
| 11 | HSTS preload | Header is preload-ready; submit keplar.one at hstspreload.org once you are sure every subdomain is HTTPS. |
| 12 | Check `/status` tomorrow | Both cron lines should read Operational after the next daily runs. If "Late"/"Last run failed", see `docs/runbooks`. |

## Known issues

- **Reduced motion is a slow drift, not a stop.** By founder decision the particle field is "never off, never frozen"; `prefers-reduced-motion` only slows it to 12% speed. Strict WCAG 2.2.2 readers may want a pause control or a full stop.
- **Home page (Monolith) layout shift, intermittent.** In 3 of 4 headless runs the home scored CLS 1.0-1.1 (perf 72-76; the one clean run had CLS 0.05 and perf 94). Cause: `MonolithHome` starts in mode `pending` and then switches to `static` (no GPU/CPU-rendered GL/reduced motion) or `webgl`; the `.world` block changes from the pinned 100svh layout to in-flow content (about 2000 px tall), which Lighthouse counts as one huge shift. Real-GPU visitors switch to the 780svh pinned layout instead; not measurable here. Fix belongs to the design owner: reserve the same box in `pending` as in the resolved mode (or decide the mode before first paint) so the switch moves nothing.
- **Home page accessibility 96-97**, not 100: `aria-label` on a `<p>` and on `<span>` elements (`aria-prohibited-attr`) in `MonolithHome.tsx` (prompt text and the animated headline spans). Use visually hidden text or `role` instead.
- **Any new WebGL layer must honor `probeCaps().webgl` and `softwareRenderer()`** (`src/field/caps.ts`); `MonolithCanvas`/`MonolithHome` do. `tests/launch-field-guard.test.ts` guards the older layers.
- **Home page LCP on slow mobile** is the cookie notice text on a first visit (it appears after hydration); the hero headline paints earlier. A returning visitor (consent stored) doesn't have this.
- **No offline page / service worker.** Offline shows the browser's own error. The web manifest exists (installable shell only).
- **No Safari/real-device testing**, no real-GPU Lighthouse (this box has no GPU).
- **Shared-IP rate limit**: 240 `/api` requests per minute per IP can affect large offices/schools behind one IP; raise `API_PER_IP_PER_MIN` in `src/proxy.ts` if support hears of it.
- `npm audit --omit=dev` reports 2 high findings in `image-size` (via `pptxgenjs`: JXL/HEIF/ICNS parser loops). Keplar never calls pptxgenjs `addImage`, so no user image reaches the parser; the fix is a breaking downgrade, so it is left.
- Phone checkout logs a harmless "accelerometer is not allowed" Permissions-Policy console warning from the Whop embed.
- Full Playwright run on a production build: 46 passed, 2 failed, 8 skipped (serial tests after a failure): `multi-account` "sign in as Ada" (magic-link sign-in timed out) and `usage-meter` "a real Free account…" (card read 50 vs bar 49). Both pass when their spec files are re-run alone. Likely state and rate limits accumulating over one long run from one IP; that is a hypothesis, not proven.
- `tsc` reports errors only in test helpers when optional dev dependencies are missing from a stale `node_modules`; run `npm install` first.

## Status of this pass (updated as work lands)

- **Lighthouse: final numbers are in the table below** (prod after the Monolith home, Oct 4, 2026 ~2:30-3:00 AM ET).
- Process note: `node scripts/deploy.mjs` is the supported deploy and runs a full gate. Concurrent gates share `/tmp/keplar-verify/` logs and a per-sha worktree directory; two executors deploying the same commit collide. Run one at a time.

## Lighthouse (production, Lighthouse 12, headless Chromium 153, this box has no GPU)

Single run per cell unless noted; mobile = default emulation (4x CPU, slow 4G), desktop = `--preset=desktop`. Box load average was 3-9 during the run. Treat +/-5 points as noise. CPU-rendered GL means the Three.js scene is **not** exercised here; real-GPU results are unmeasured.

| Page | Mobile perf | Mobile LCP / TBT / CLS | Desktop perf | Desktop LCP / TBT / CLS | A11y | BP | SEO |
|---|---|---|---|---|---|---|---|
| `/` (home) | 71 (94 and 72 on two reruns) | 2.5 s / 160 ms / 1.1 (0.05 on the 94 run) | 76 | 0.6 s / 0 / 1.0 | 96-97 | 100 | 100 |
| `/pricing` | 99 | 1.8 s / 120 ms / 0 | 100 | 0.5 s / 0 / 0 | 100 | 100 | 100 |
| `/how-it-works` | 92 | 2.3 s / 280 ms / 0 | 100 | 0.6 s / 0 / 0 | 100 | 100 | 100 |
| `/docs` | 92 | 2.1 s / 300 ms / 0 | 100 | 0.6 s / 10 ms / 0 | 100 | 100 | 100 |
| `/signin` | 96 | 2.6 s / 90 ms / 0 | 100 | 0.6 s / 0 / 0 | 100 | 100 | 66 (noindex) |
| `/signup` | 96 | 2.6 s / 90 ms / 0 | 100 | 0.6 s / 0 / 0 | 100 | 100 | 66 (noindex) |
| `/app` | 86 | 3.3 s / 290 ms / 0 | 100 | 0.5 s / 0 / 0 | 100 | 100 | 66 (noindex) |
| `/feedback` | 99 | 2.0 s / 100 ms / 0 | 100 | 0.5 s / 0 / 0 | 100 | 100 | 66 (noindex) |
| `/status` | 90 | 2.4 s / 340 ms / 0 | 100 | 0.6 s / 40 ms / 0 | 100 | 100 | 66 (noindex) |

Earlier run on the pre-Monolith home (before the software-GL guard): mobile 60 (TBT 3,400 ms); with the guard 84 locally. Raw JSON lives in `/tmp/lh/final` on the box (not committed). Re-run after any front-page change: `npx lighthouse@12 https://keplar.one/ --chrome-flags="--headless=new --no-sandbox"`, summarize with `node scripts/lh-summary.mjs <dir>`.
