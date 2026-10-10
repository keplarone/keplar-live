# Mobile pass - progress

Scope: phones at 360 / 390 / 430 px (first pass), then tablets, short/landscape windows, laptops, 2K/4K/ultrawide, OS display scale 1-3x, browser zoom 80-200%, classic scrollbars, font fallback, forced colors (second pass, below). Nothing here was tested on a real phone, a real iOS keyboard, or a real Windows / macOS / Linux machine.

## Method
- Playwright mobile emulation (touch, DPR 3, iOS-like UA) in Chromium and WebKit (webkit-2359), against local production builds
  (built from `git archive HEAD` into a scratch copy, so the shared `.next` and other workers' files are untouched).
- `scripts/mobile-audit.mjs` (93 cells: 31 routes x 3 widths): sideways overflow, off-screen / clipped elements, tap targets < 44 px,
  inputs < 16 px, fixed bars. `scripts/mobile-audit-summary.mjs` groups the findings.
- `scripts/mobile-e2e.mjs`: 23 regression checks per width (69 per engine).
- `scripts/lh-mobile.mjs`: Lighthouse 13.5 mobile (Moto-class emulation, simulated slow 4G, 4x CPU), 3 runs, median.
- BEFORE = the tree as it was before my commits (port 3470). AFTER = HEAD `78dceca` (port 3472).
- WebKit over plain http needs a tiny proxy that drops `upgrade-insecure-requests` / HSTS from the headers (WebKit otherwise upgrades
  localhost sub-resources to https and loads no CSS). An earlier WebKit audit without it was invalid and was discarded.

## Commits (local only, nothing pushed or deployed)
| Commit | What |
|---|---|
| d750a54 | Cookie card: one compact row of 44 px buttons (was 38 px wrapped stack, 32% of a 360x780 screen) |
| 032433e | `/app` home no longer jumps when the onboarding card arrives |
| c7cbbea | Soft keyboard no longer covers the composer (`ViewportKeyboard`); `/app` top bar keeps room for the title; 44 px top bar and composer controls |
| f3faf0d | `mobile.css`: 16 px text fields on touch (no iOS focus zoom), 44 px nav menu button, no INS/OVR badge on touch |
| 1ce7b0d | 44 px touch targets across Button, Footer, ThemeControl, docs nav, Legal TOC, auth, sim, growth, onboarding, slides, Create builder/workspace, home links |
| 42e3100 | Published-site templates: 44 px nav links, brand and buttons on phones |
| 2c3c0c2 | WebGL: `powerPreference: "low-power"` on phones (field, orb, monolith, scene engine) |
| 78dceca | The audit / e2e / Lighthouse scripts |

Also landed by others and relevant: dd5076d (Creation clip fix - the home "Creation" tiles were half-animated and clipped at both edges
under 900 px), 6bd8b0d, 408781e, 5c611bc, cbfa7c1 (not mine, not touched).

## Lighthouse mobile, median of 3 (local production build)
| Route | Perf before -> after | LCP ms | TBT ms | CLS |
|---|---|---|---|---|
| `/` | 69 -> 70 | 2863 -> 2861 | 1424 -> 1329 | 0 -> 0 |
| `/pricing` | 68 -> 68 | 3044 -> 3123 | 1561 -> 1396 | 0 -> 0 |
| `/about` | 68 -> 68 | 3137 -> 3125 | 1350 -> 1322 | 0 -> 0 |
| `/download` | 68 -> 68 | 3126 -> 3126 | 1412 -> 1384 | 0 -> 0 |
| `/help` | 68 -> 69 | 3136 -> 3129 | 1323 -> 1263 | 0 -> 0 |
| `/signin` | 91 -> 91 | 3438 -> 3451 | 53 -> 41 | 0.03 -> 0.03 |
| `/signup` | 91 -> 91 | 3461 -> 3444 | 65 -> 42 | 0 -> 0 |
| `/simulation` | 64 -> 69 | 3271 -> 3126 | 2801 -> 1249 | 0 -> 0 |
| `/privacy` | 69 -> 68 | 3130 -> 3136 | 1827 -> 1304 | 0 -> 0 |
| `/app` | 60 -> 84 | 4626 -> 4347 | 172 -> 119 | **0.452 -> 0.002** |
| `/app/create` | 78 -> 76 | 5086 -> 5877 | 159 -> 163 | 0.001 -> 0.001 |
| `/account` | 92 -> 96 | 3295 -> 2719 | 54 -> 48 | 0.001 -> 0.001 |

Accessibility is 100 everywhere, before and after. Best-practices 77 (marketing) and SEO 66 are environment artefacts
(Whop third-party cookie; `X-Robots-Tag: noindex` on localhost) and did not change.

Read this honestly:
- The one real Lighthouse win is `/app` (CLS 0.452 -> 0.002, perf 60 -> 84). The other differences of 1-2 points are within run-to-run noise;
  the `/simulation`, `/privacy` and `/account` TBT drops may be partly noise / machine load (the before run and the after run were not
  side by side) and I do not claim them as my doing.
- Marketing pages stay near 68-70 because of one ~1.3 s long task from the Whop Pixel `fingerprint.js`. I left the pixel alone (business
  decision with its own tests). Routes without the pixel (`/signin`, `/signup`, `/account`) score 91-96.
- `/app/create` got worse on LCP (5086 -> 5877 ms, perf 78 -> 76). HEAD also contains the Create-features worker's commits (Features tab,
  +~100 KB transfer), so I believe it is theirs, but I did not bisect it. **Unverified.**
- `/s/<slug>` cannot be audited with Lighthouse (its CSP `sandbox` header blocks DevTools `Runtime.evaluate`). Only tap targets of the
  published templates were checked.
- Lighthouse runs headless on software GL, so it measures the WebGL fallback, not the real scenes.

## Phone regression checks (`mobile-e2e.mjs`), failures before -> after
| Engine | Before | After |
|---|---|---|
| Chromium | 24 failed of 69 | 0 of 69 |
| WebKit | 24 failed of 69 | 0 of 69 |

What failed before: cookie buttons 38 px; nav menu button 40 px; `/app` composer font 15 px; composer / top bar controls 40 px; `/app` top bar
left 5 / 35 px for the title at 360 / 390 px; Creation tiles cut off at the edges (390, 430); with a simulated 336 px keyboard the app shell
stayed full height so the composer ended up under the keyboard (shell ended at 780 / 844 / 932 instead of 444 / 508 / 596). After: all pass.

## Audit (93 cells, WebKit at HEAD)
- No sideways overflow on any route at any width (also true before).
- Left: `/account` settings chips 36-40 px (`account.module.css` is off limits - owner should raise it); `/vs/*`, `/compare` breadcrumb and
  list links at ~20 px and FAQ `summary` ~43 px (minor, skipped); the `/app` composer textarea is 28 px tall when empty (a text field
  that grows, not a button); `/app/create` "CUT" rows are the closed off-canvas rail drawer (false positive).

## Decisions
- First pass did NOT add `viewport-fit=cover`. The second pass did (it landed inside e058a0b, another worker's commit): body gets safe-area side/bottom padding, nav, app shell, cookie card and composer dock add their own insets. Checked only with CDP `setSafeAreaInsetsOverride` (844x390: 47/47/21, 390x844: top 47, bottom 34) on `/`, `/pricing`, `/signin`: nothing interactive or text inside the insets after `11b128a`. No real notch.
- WebGL: DPR caps, quality tiers, visibility / IntersectionObserver pause, reduced-motion and saveData handling already existed; only
  `powerPreference` changed.

## Not verified
- Anything on a real phone: real iOS Safari, real keyboard (it is simulated by shrinking `visualViewport.height`), real touch scrolling, real GPU.
- WebGL on a real GPU; scroll jank; Style & Layout cost on `/` (~3.7 s under 4x throttle) was measured but not investigated.
- Create workspace on a phone end to end with a freshly built site (only tap sizes, 16 px prompt and no overflow were checked; screenshot of the empty state looked right at 390 px).
- Composer typing latency on mobile was not re-measured (earlier desktop-throttled doc: 7-10 ms max key latency).
- Unit tests: 2 failures exist at HEAD independent of this work (`tests/privacy.test.ts`, `tests/us-english.test.ts` - `lib/site-builder/coverage.ts: enquiry`).

---

# Second pass: every device, every scale (Oct 4)

Commits (local only): Recents `b0da10b`; build fix `1aa7a5a`; audit + matrix scripts `d2d1f02`; touch targets `b967e2f`, `1acff16`; Composer `6254a57`;
ProductDemo `0f0e484`; Creation `e4a2624`; /app CLS `f90f28f`; fluid tokens + font fallback `b10416c`; scrollbar-gutter / forced-colors / safe-area `fbb910c`;
hero + cookie scaling `038ae35`; short windows `7427a37`; font test `3d9d634`; home LCP `197adc4`; cookie safe-area `11b128a`.

## Recents bug in the /app sidebar (b0da10b)
Root cause: Recents was `flex:1; min-height:0` in a fixed-height sidebar with no overflow handling, below a content-sized usage card (225-264 px). It got ~92 px at 800 px tall,
~27 px on a 844 px phone and 0 px under ~720 px tall, so the toggle was drawn over the card's top border and the opened list showed nothing.
Also: the badge showed the real total but the list stopped at 14 with no way to the rest. Fix: nav + Recents scroll as one area above the pinned card (whole sidebar scrolls
when under 720 px tall), "See all N chats" opens History. Regression: `e2e/recents.e2e.ts` (800/600/480 px tall, 16 chats, 390 px drawer) - fails on the old code at 800 px, 10/10 pass now.
Reproduced as team@keplar.one (12 chats), Light and Dark. I could not see the founder's exact window; the screenshot matched this defect.

## Build break found on the way (1aa7a5a)
HEAD `add370f` did not build: the client Traffic & revenue card imported `RANGES` from the server-only `lib/admin/revenue` (Turbopack "node:fs in a client chunk"). Ranges now live in `lib/admin/ranges.ts`.

## Method
- `scripts/scale-matrix.mjs`: cell = physical screen x OS scale (1, 1.25, 1.5, 2, 3) x browser zoom (80-200%) x text scale. CSS viewport = physical / (scale x zoom), DPR = scale x zoom.
  Screens 1024x600, 1366x768, 1920x1080, 2560x1440, 3440x1440 (ultrawide), 3840x2160. 56 cells x 4 routes (`/`, `/pricing`, `/signin`, `/app`) = 224 cell-routes per engine.
  1024x600 at 3x (CSS 341x200) is skipped as unrealistic. Chromium runs with classic (non-overlay) scrollbars (10 px gutter in the probe).
- `scripts/mobile-audit.mjs --matrix=tablets|short|desktops|zoom|all`: 31 routes per device (744/820/1024 portrait + landscape, 844x390, 740x360, 1280x500, 1024x600, 1280-2560 desktops, 200/300/400% zoom, 200% text).
- Engines: Chromium 154, WebKit (Playwright build, stands in for Safari) behind the http proxy, Firefox (Playwright build).

## Results
| Check | Before | After |
|---|---|---|
| Scale matrix, sideways overflow / poking elements, 3 engines x 224 cell-routes | n/a (tokens stepped at 1800/2400/3200 px) | 0 findings in Chromium, WebKit and Firefox |
| Body text at 3840x2160 @1x | 25 px (stepped) | 28.4 px (fluid, 30 px cap), 1366 wide unchanged (15.3) |
| Nav height at 3840x2160 | 76 px | 84 px |
| Home headline at 2560x1440 / 3840x2160 | 92 px (capped) | 115 px / 173 px (follows window height, under a >=1800 px media query) |
| Home input height at 4K | 51 px | 65 px |
| Cookie card at 3440 wide | buttons scrolled inside the card (416 > 378 px) | 565 px wide, no scroll; wraps instead |
| Creation pinned scene fits the screen | not at 2560x1440 (1468 vs 1440 px) | fits at 1920x1080, 1920x950, 2560x1440, 3440x1440, 3840x2160, 2560x1080, 1024x600 and tablets; static layout when it cannot |
| Scrollbar: content shift when the page becomes scrollable (classic 10 px bar) | n/a | 0 px (`scrollbar-gutter: stable`); /app opts out |
| Layout change when web fonts are blocked (doc height) | +1.4% to +5% (h1 wrapped one extra line on /pricing) | -0.3% to +0.8% (one page +2.3%), h1 wrap identical |
| /app CLS (paid/admin account) | 0.033 | 0.007 on a repeat visit (first visit 0.033: plan unknown until it loads) |
| Touch targets on tablets (cookie 38, nav 36, sidebar 34-40, ws 30-36, sim dots 33, FAQ summary 43, /vs crumbs 20, published-site nav 29 and footer 25, rails 34) | 45 cells with findings | 0 for these; left on purpose: account settings chips (other worker's file), Composer textarea 29 px (autosize), AccountMenu email ellipsis |
| /simulation under 540 px tall | slide 144 of 390 px, text cut | slide 208 px, type follows height, rest scrolls inside the slide |
| ProductDemo window at 1133 px landscape | overflowed by 69 px | fits |
| Composer tool labels on touch tablets >= 900 px | clipped by a 44 px width rule | labels by composer width (container query) |
| Lighthouse mobile `/` (simulated 4x / slow 4G) | 69-70, LCP 2.86-3.0 s | 70 (65-72), LCP 2.7 s after `197adc4`. A first version of the headline cap cost +700 ms LCP (67) and was moved into a media query |
| Lighthouse other routes, same machine, interleaved | /account 91, /signin 91, /download 68 | 92, 91, 69 (no regression; CLS /signin 0.03 and /download 0.024 unchanged) |

Forced colors (Windows High Contrast) is emulated in Chromium and Firefox: controls keep system-colour borders and focus rings; screenshots in `/tmp/sm-font/chromium-forced-*.png`.

Desktop app shell: the repo has no Electron / Tauri project. Only the `/desktop` download page, `data-keplar-drag` hooks in Sidebar and Nav, and `lib/desktop-auth`. Nothing to test there.

Screenshots (not in git): `/tmp/sm-chromium`, `/tmp/sm-firefox`, `/tmp/sm-webkit` (1024x600, 1366x768, 1920x1080@1.25, 2560x1440@1.5, 3440x1440, 3840x2160@1/@2 for `/`, `/pricing`, `/signin`, `/app`),
before/after home at 5 sizes in `/tmp/ba`, `/simulation` short in `/tmp/sim-844x390.png`.

## Not verified (second pass)
- No real Windows, macOS or Linux machine, no real display scaling, no real Safari. WebKit and Firefox are Playwright builds on Linux. Scale and zoom are emulated by viewport + DPR, not by the OS or the browser's zoom UI.
- Firefox / WebKit headless on Linux draw overlay scrollbars (gutter 0), so classic-scrollbar behaviour is measured in Chromium only. WebKit on Linux does not resolve `local(Arial)`, so its font-fallback number (home 390 px: +12.8%) says nothing about macOS, where Arial exists.
- The OS text-size setting is approximated with `html{font-size}`; forced-colors and safe-area insets are emulated; 3D scenes ran on software GL (layout only, not frame rate).
- The Windows font stack (Segoe UI etc.) is not exercised: the fallback face is Arial-based on purpose so all three OSes show the same layout before Google Sans loads.
- `/app` CLS on a first visit by a paid account is still 0.033 (below the 0.1 limit).
- Whop pixel TBT (~1.3 s on marketing pages) untouched.

## Creation scene regression (2e92abd, 98524cb)
`e2e/creation-clip` failed at 1440x900 (sticky scrollH 934 > 900). Cause: my pinned-or-stacked decision (e4a2624) compared the scene height with the full pinned screen and ignored the sticky's own top (nav clearance, ~97 px) and bottom (32 px) padding, so the scene was "fitting" while really sticking out 2-31 px at the bottom (and sliding under the nav at the top). Now the decision uses the real room, shrinks the two preview rows (`--creation-shrink`, measured and topped up) to fit, and uses the stacked layout when the previews would be under 96 px.
Result: pinned and fitting at 1440x900, 1536x864, 1680x1050, 1920x1080, 2560x1440, 3440x1440, 3840x2160; stacked at 1366x768 and shorter (1024x600, 1280x500, 1280x720). creation-clip now has 24 cases (12 sizes x Light/Dark), all pass. The live site (checked 19:17 ET) still runs the old logic: bottom of the scene is 2 px (1440x900), 8 px (1536x864) and 31 px (1920x1080) past the viewport.
