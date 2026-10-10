# Keplar One — Grand Release Checklist

Last verified: 2026-10-06 (ET). Owner of this pass: backend / security / ops / dep health worker.
Live: https://keplar.one · Vercel project `team-6667/keplar` · Deploy gate: `node scripts/deploy.mjs`.

Status legend: **Done** · **In progress** · **Blocked** · **Needs 8club sign-off**

---

## Versioning

| Item | Status | Notes |
|---|---|---|
| Web `package.json` version | Needs 8club sign-off | Currently `0.1.0`. Bump to launch version (e.g. `1.0.0`) and tag before announce. |
| Changelog page `/changelog` | Done | Driven by `src/lib/kb/changelog` + desktop releases. Confirm launch entry is drafted before go-live. |
| Desktop latest tag | Done | GitHub `keplarone/keplar-desktop` **v0.1.6** (published 2026-10-05). |
| iOS version / build | Needs 8club sign-off | Expo app `1.0.0` / buildNumber `1` at `/workspace/keplar-ios`. App Store Connect + signing + IAP still founder-owned. |

---

## Build and deploy

| Item | Status | Notes |
|---|---|---|
| Local verify | Done (this pass) | `npm test` 2013+ pass; eslint 0 errors (warnings only in owned-by-others UI); glass-typing / nav-theme tests already aligned (`7aed1ea`). |
| `next build` | In progress | Must be clean before gate deploy. Prefer `node scripts/deploy.mjs` (worktree + verify + prod + smoke). |
| Deploy gate | Done | `scripts/deploy.mjs`: worktree of SHA → `npm run verify` → `vercel --prod --yes` → `smoke-prod.mjs`. Refuses on verify fail. |
| Direct prod deploy | Available | `unset VERCEL_TOKEN; /home/box/.local/bin/vercel --prod --yes` when gate only fails on others' in-progress tests. Smoke with `vercel curl`. |
| Rollback | Done (documented) | `docs/runbooks/rollback.md`: dashboard Promote, or `vercel rollback` / `vercel promote <url>`. DB changes are additive. |

Exact commands:
```bash
cd /workspace/keplar
unset VERCEL_TOKEN
# Preferred (gated):
node scripts/deploy.mjs            # or --dry-run / --quick
# Escape hatch:
/home/box/.local/bin/vercel --prod --yes
# Smoke (WAF often 403s plain curl on HTML):
/home/box/.local/bin/vercel curl /api/health
/home/box/.local/bin/vercel curl /api/ops/openrouter-balance -H "Authorization: Bearer $(cat /home/box/.config/keplar/ops-check-secret)"
# Rollback:
/home/box/.local/bin/vercel rollback
```

---

## Website polish

| Item | Status | Notes |
|---|---|---|
| Site overhaul (UI/layout/marketing/Create UX/SEO) | In progress | Owned by overhaul worker. See `docs/design-progress.md` (route redesign largely deployed Oct 4; further polish ongoing). No `docs/overhaul-progress.md` yet. |
| Dark-default + professional direction | Done | Do not flip theme default or aesthetic. |
| Perf: three.js off critical path | Done (this pass + prior) | Home/scene already afterPaint + dynamic import. **PageMonolith** now afterPaint + dynamic-imports `MonolithCanvas` (no three.js until idle/interaction; Save-Data / no-WebGL / CPU-GL / reduced-motion skip download). SendFieldLazy unchanged. |
| Perf: cache headers + image formats | Done (this pass) | `next.config.ts`: long-cache `/_next/static`, `/icons`, `/fonts`, `/fx`; short `/sw.js`; AVIF/WebP `images`. |
| Offline-friendly static SW | Done (this pass) | `/sw.js` + `StaticAssetSw`: caches only hashed static assets; never HTML/API/cookies. Registered after paint on keplar hosts only. |
| Advanced Three.js scene | In progress | Owned by Three.js worker (`src/field/monolith/**`, planets, story captions). Do not clobber. |

---

## Bug wipe (this pass)

| Area | Status | Notes |
|---|---|---|
| Unit tests | Done | 2013 pass / 0 fail (pre-existing suite) + new openrouter-balance + media-provider-url. |
| Known deploy-gate tests | Done | `glass-typing.test.ts` / `nav-theme.test.ts` already fixed upstream (`7aed1ea`). |
| Typecheck | In progress | Transient `.next/dev/types` noise when another worker's `next build` races; source tsc clean for owned files. |
| Lint | Done (errors) | 0 errors; remaining warnings are unused vars in e2e/scripts and UI owned by overhaul/Three.js (MonolithHome setState-in-effect, location.assign patterns). |
| Console noise / hydration | Needs re-check after overhaul lands | Prior launch crawl (Oct 4) was clean; re-run `scripts/launch-crawl.mjs` post-deploy. |
| Dead code / unused deps | In progress | No high/critical `npm audit` issues per `docs/security.md`; lockfile present. |
| Free plan → OpenRouter `:free` only | Done | Hard-guarded in tests (`free-plan`, free roster). |

---

## Security (this pass + prior)

**Already in place (verified in code / `docs/security.md`):** origin CSRF (`src/proxy.ts` + `src/lib/security/origin.ts`), per-IP + per-route rate limits, Better Auth sessions (HttpOnly/SameSite/Secure), password scrypt + lockout, magic-link open-redirect guard, SSRF pin for product import + MCP, upload magic-byte sniff, webhook HMAC, sealed connector secrets, KaTeX `trust: false`, parameterized Neon store with `checkField`, security headers + `/security` + `security.txt` (overhaul owns headers/trust page — do not duplicate).

| Item | Status | Notes |
|---|---|---|
| OpenRouter low-balance alert | Done (this pass) | Lib + `GET /api/ops/openrouter-balance` (Bearer `OPS_CHECK_SECRET` or `CRON_SECRET`, constant-time, 20/min IP). Emails once per drop below **1%** (store episode + insert-if-absent). Daily Vercel cron `0 14 * * *` (Hobby plan limit). Secret at `/home/box/.config/keplar/ops-check-secret` (chmod 600) and Vercel Production env. Recipient: `KEPLAR_OWNER_EMAIL` → `ADMIN_EMAIL` → `team@keplar.one`. Admin Operations card shows last reading. |
| OpenRouter balance — live reading | Done | 2026-10-06 20:56 ET via `vercel curl`: **$10.02 of $20.00 (50.09%)**, `low: false`. Unauthenticated call → 401. |
| Checkout rate limit | Done (this pass) | `/api/billing/checkout` counted the per-IP hit twice (effective 5/min instead of the documented 10/min); now IP once + account 5/min. |
| Video provider URL hardening | Done (this pass) | OpenRouter poll/download: https-only, no embedded creds, **Authorization only to `openrouter.ai`**, size + timeout caps (`src/lib/create/media.ts`). |
| Headers / `/security` / `security.txt` | Done (verified on prod) | 2026-10-06: CSP (frame-ancestors 'none', object-src 'none', Whop hosts only), HSTS 2y preload, XFO DENY, nosniff, Referrer-Policy, Permissions-Policy, COOP/CORP same-origin; `security.txt` and `/security` 200. Owned by overhaul worker. |
| Security review scope (this pass) | Done | Route inventory (187 handlers): auth helpers, origin/CSRF in proxy, per-route limits; SQL builders validate field paths (`checkField`) and parameterize values; KaTeX `trust:false`; JSON-LD escapes `<`; no hardcoded keys in repo (pattern scan); only `NEXT_PUBLIC_` = site URL/indexing/verification; SSRF-pinned fetchers for user URLs. Gap found + fixed: provider-returned video URLs (above). |
| Upstash shared rate limit | Needs 8club sign-off | Prod uses Postgres fallback today. Set `UPSTASH_REDIS_REST_*` before real traffic. |
| `BETTER_AUTH_SECRET` | Needs 8club sign-off | Confirm set in Production (health reports boolean). |
| `OPENROUTER_MANAGEMENT_KEY` | Needs 8club sign-off | Credits endpoint may require a management key; set if live call returns `management_key_required`. |
| `SENTRY_DSN` | Needs 8club sign-off | Optional forwarder exists; DB error store is live at `/admin/errors`. |
| Remaining residual risks | Needs 8club sign-off | Whop Pixel main-thread cost on marketing; Hobby cron frequency (daily only — rely on external hourly balance check); no formal pen-test. |

---

## Navigation and accessibility (this pass)

| Item | Status | Notes |
|---|---|---|
| Primary nav | Done | Product + Resources menus (Create, live demo, Teams, docs, API, community gallery `/templates`, changelog); multi-menu with arrow keys/Escape/outside click. Landing executor is wiring `/features`, `/showcase`, `/roadmap` into `src/lib/site.ts` (uncommitted, theirs). |
| Cmd/Ctrl-K command palette | Done | Root layout; pages, features, docs index (lazy), settings, and the current page's sections. Modal dialog, combobox/listbox, Tab trap, focus restore. |
| Section jump | Done | Palette "On this page" + existing PageChrome tick index (demo-window headings excluded). |
| Mobile menu | Done | Labelled modal sheet, search entry first, scrolls, focus trap (existing). |
| Keyboard focus | Done | `:focus-visible` only: 2px muted-accent underline; icon controls get a short accent bar; still no outline/box on click (owner rule + `no-focus-box` e2e). |
| axe (WCAG 2.0–2.2 A/AA), 20 routes × dark/light | Done | Before (build 88eb3e2): **4 serious** (label-content-name-mismatch on INS badge, /signin + /signup), 1 heading skip (/product). After: see bug-wipe numbers below. Script: `node scripts/axe-audit.mjs <base>`. |
| Streaming answers | Partial | Stage progress announced via `aria-live`; answer article `aria-busy` while typing. A one-line "answer ready" announcement is a follow-up (app UI owner). |
| Screen reader / real devices | Needs 8club sign-off | Not testable from this box. |

---

## Even scaling and scrolling: what was adjusted

Checks: `e2e/even-scaling.e2e.ts` (overflow on 14 routes x 9 viewports, scripted-scroll frame budget, scroll-lock release, wheel-trap, Ask-home overlay fit, palette), `node scripts/scroll-check.mjs <base>` (frame p50/p95, long tasks, layout shift during scroll, overflow, stuck scroll, lock leak), `node scripts/zero-bug-sweep.mjs <base> --widths=...`, `node scripts/app-home-fit.mjs <base>`.

| Fix | File | Breakpoint |
|---|---|---|
| Page wheel scroll was trapped while the pointer rested on the pinned home hero composer (global `textarea { overscroll-behavior: contain }`); now only a textarea that actually overflows contains scroll | `src/styles/globals.css`, `src/components/glass/TypingFeel.tsx` | Desktop 1280 and 1440 (home stuck at 500px) |
| Shared reference-counted scroll lock (`html[data-scroll-lock]`) replaces three ad-hoc `overflow` writes that could leave the page locked when overlays closed out of order | `src/lib/ui/scroll-lock.ts`, `Nav.tsx`, `CommandPalette.tsx`, `app-ui/Lightbox.tsx`, `globals.css` | All |
| Modal dialogs and the locked page use `overscroll-behavior` so sheet scroll doesn't rubber-band into the page | `src/styles/globals.css` | iOS / Android |
| `100vh` panels get a `100svh` value (no jump when the mobile URL bar shows/hides) | `sections/Creation.module.css`, `inquire/Inquire.module.css`, `legal/Legal.module.css`, `kb/kb.module.css` | Phones, tablets |
| Bottom overlays clear the home indicator (`env(safe-area-inset-bottom)`); presenter stage uses `dvh` | `app-ui/limit-extensions.module.css`, `slides/slides.module.css` | iPhone (notch / home bar) |
| Section-index scroll frame reads layout before its one style write (no forced style pass per frame) | `chrome/PageChrome.tsx` | All |
| Signed-out `/app/create` auth probe no longer logs a 401 | `create/CreateStudio.tsx` | All |
| Ask home: statement, cards and dock gaps scale with viewport height; first card row sits fully above the floating composer overlay | `app-ui/App.module.css`, `app-ui/Composer.module.css` | 1024x470/600, 1280x600, 320x568, 667x375, 844x390 |
| Ask home redesigned as a calm welcome: first-name greeting (fallback "Welcome to Keplar."), one plain line, small mark, four one-line suggestion chips instead of numbered cards, examples + FAQ behind "More ideas"; composer modes tucked into one "Modes" menu (+ for attachments); quieter sidebar/top bar (hover-only shortcut hints, no "Optional" badge, outline Upgrade). Composer stays a floating overlay, content padded by the measured `--dock-h` | `app-ui/KeplarApp.tsx`, `HomeStart.tsx`, `Composer.tsx`, `App.module.css`, `Composer.module.css` | 320-1920, short heights 470-800 |

Verified: production sweep 17 routes x 8 widths (320-1920): 0 horizontal overflow. Scroll check 8 routes x 7 viewports: 0 layout shift during scroll, 0 lock leaks; every scroll handler in `src` is passive and rAF-throttled; the space scene caps DPR, pauses when hidden/off screen, and shows a still frame for reduced motion.

Still uneven: frame times at 1920x1080 on `/`, `/product` and `/enterprise` measured p95 130-270ms on this box, which runs a software rasteriser under heavy load (load average 40-50). Re-measure on real GPU hardware before calling it a regression. Real-device iOS rubber-band and URL-bar behaviour: **Needs 8club sign-off**.

---

## Marketing and social

| Item | Status | Notes |
|---|---|---|
| Batch 1 drafts | In progress | `/workspace/marketing/social/batch-1/` (X, YouTube, Instagram, TikTok, LinkedIn, Threads + `schedule.json`). |
| Postiz posting | Blocked + Needs 8club sign-off | Needs Postiz API key + channel connections. **Nothing posts before 8club approves.** |

---

## Last mile

| Item | Status | Notes |
|---|---|---|
| Meta / OG / Twitter cards | Done (prior) | Root layout + per-route; generated OG/Twitter images. |
| Sitemap / robots / canonical | Done (prior) | `sitemap.ts`, `robots.ts`, www→apex. |
| Favicon + apple-touch + manifest | Done (prior) | Main site icons; docs cyan favicon owned by docs worker. |
| 404 / 500 / error pages | Done (prior) | `not-found.tsx`, `error.tsx`, `global-error.tsx`. |
| Analytics | Done | Consent-gated Vercel Analytics + Speed Insights (`Telemetry.tsx`). First-party visit/presence cookie-free. |
| Error tracking | Done | `/admin/errors` + optional Sentry. |
| Uptime / health | Done | `/api/health`, `/status`, cron heartbeats (incl. openrouter-balance). |
| Security headers + security.txt + `/security` | Done | Overhaul owns ongoing polish. |
| Legal (privacy, terms, cookie notice) | Done | Pages live; **entity/jurisdiction still open** (see below). |
| Accessibility basics | Done (prior LH a11y 100) | Re-check after overhaul. |
| Performance budget | In progress | Prior: home mobile ~95 without pixel; Whop Pixel tanks TBT — decision needed. This pass: SW + cache + deferred PageMonolith. |

---

## Accounts / keys / business (8club-owned)

| Item | Status |
|---|---|
| OpenRouter prod key + credits (+ optional management key) | Needs 8club sign-off |
| Stripe live + test keys and Connect webhooks | Needs 8club sign-off |
| Whop plans, webhook events, one real purchase+refund | Needs 8club sign-off |
| Optional Upstash | Needs 8club sign-off |
| `keplar.site` wildcard + Public Suffix List | Needs 8club sign-off |
| DMARC at IONOS | Needs 8club sign-off (still missing per Oct 4 launch checklist) |
| `docs.keplar.one` DNS at IONOS | Needs 8club sign-off |
| Apple App Store Connect + IAP + signing | Needs 8club sign-off |
| Desktop code signing | Needs 8club sign-off |
| Legal entity / postal / governing law | Needs 8club sign-off |
| Vercel storage / plan (currently Hobby) | Needs 8club sign-off (cron frequency, concurrency) |
| Postiz API key + social channel connections | Needs 8club sign-off |
| Google OAuth consent screen **In production** | Needs 8club sign-off |
| Outside-inbox email delivery proof | Needs 8club sign-off |

---

## Launch-day plan

### T−1 day
- Freeze marketing copy and social batch-1; 8club reviews drafts.
- Confirm OpenRouter balance ≥ comfortable runway; low-balance alert armed (external hourly + daily cron).
- Run `node scripts/deploy.mjs` from a clean SHA; record deploy id; `vercel curl /api/health` + `/status`.
- Re-run `scripts/launch-crawl.mjs` + Lighthouse home/pricing/app.
- Confirm Whop webhook events, Stripe mode decision, DMARC present.
- Desktop v0.1.6 links on `/download` still resolve; iOS build uploaded (if launching iOS).

### Launch hour
- Promote/keep production deploy; watch `/admin` (spend, errors, OpenRouter balance card), Vercel logs, Resend.
- Announce sequence: site live → X thread → LinkedIn → Threads → Instagram/TikTok/YouTube (batch-1) **only after 8club approval** via Postiz.
- Rollback trigger: `/api/health` 503, error spike in `/admin/errors`, checkout broken, or OpenRouter hard fail on paid paths.

### T+1 day
- Review growth/SEO admin cards, support inbox, spend vs caps, OpenRouter percent.
- Social engagement pass; schedule batch-2 if approved.
- File any post-launch bugs in `bugs/`; hotfix via gated deploy.

---

## Launch BLOCKERS (must clear before announce)

1. **Web version string + changelog launch entry** decided and committed.
2. **OpenRouter credits funded** and management/API key working for `/api/ops/openrouter-balance` (live check).
3. **Whop**: webhook event list confirmed + one real purchase/refund.
4. **DMARC** TXT on `keplar.one` (IONOS).
5. **Legal entity / jurisdiction** copy (or explicit "launch with draft terms" sign-off).
6. **Site overhaul + Three.js scene** green on prod (no half-deployed UI).
7. **Social**: either Postiz connected **or** manual post plan with 8club approval (nothing auto-posts).

## Needs 8club sign-off (full list)

- Version bump / launch tag
- iOS App Store submission
- Desktop code signing distribution
- OpenRouter keys + credit top-up
- Stripe live mode decision
- Whop live purchase proof
- Upstash / Sentry / Inngest optional keys
- `keplar.site` PSL + DNS
- DMARC + docs.keplar.one DNS
- Legal entity + counsel
- Vercel plan upgrade (if hourly cron / more concurrency needed)
- Postiz + every social post before publish
- Google OAuth production status
- Whop Pixel keep-vs-defer decision (perf vs attribution)
