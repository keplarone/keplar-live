# Performance progress (2026-10-04)

Measured, not estimated. Nothing here was tested on a real GPU or a real phone: Lighthouse mobile is its simulated Moto-class device on slow 4G, run headless on the build box (software GL). Run-to-run noise is about ±3 points. Not deployed: these commits are local.

## Method
- Lighthouse 13, 3 runs per cell, median reported (`--preset=desktop` for desktop). Routes: `/`, `/pricing`, `/app`, `/app/create`.
- Baseline A: deployed prod keplar.one at b825dc9 (live, behind Vercel).
- Baseline B / after: two local production builds on the same box and the same `next start`, so only the code differs: `b825dc9` vs `HEAD`. Local has no CDN and gzip instead of brotli, so absolute numbers differ from live.
- Open-time test: Playwright, signed in, click Create from /app (software GL).

## What changed (commits)
| Commit | Change | Why |
|---|---|---|
| b419ca7 | `three.js` (136 KB over the wire, 534 KB parsed) is no longer fetched when /app opens. `SendFieldLazy` loads the send-burst scene when the person pauses after typing/pasting, or immediately on send (the first send is replayed into the scene, not re-dispatched, so analytics listeners see it once). Create, Business, Slides and Study are split out of the Ask bundle. | /app and /app/create were the slowest routes: the LCP element renders only after the app bundle runs. |
| 958ca29 | Create's `Backdrop` (three.js) is a dynamic import, so the sign-in gate and first paint skip the three.js chunk. | /app/create also shipped three.js. |
| ccd2782 | IBM Plex Mono is no longer preloaded on every page (`preload: false`). | 2 of 3 font preloads (about 20 KB) competed with the page for no first-paint benefit. HTML now has 1 font preload instead of 3 (checked on /app and /pricing). |
| 1686b42 | Studios load through a Suspense-free loader: Create is fetched when the page is idle, the others when the pointer reaches the sidebar. | `next/dynamic` made opening Create take about 860 ms (React holds a Suspense fallback ~300 ms even when the chunk is in). With this loader it is back to the old range. |

Guards kept: DPR cap, quality tiers, offscreen pause, software-GL/save-data fallbacks (all inside SendField/stage, untouched). Typing stays instant: during a 28-key test, max key latency 7-10 ms and no long task while typing; a send before the chunk arrives still produces the burst (checked).

## Measured: JS on the wire (Playwright, mobile emulation, local prod build, gzip)
| Route | b825dc9 | HEAD |
|---|---|---|
| /app | 495 KB transfer / 1,744 KB parsed, 20 files | 279 KB / 882 KB, 19 files (before the idle Create prefetch) |
| /app/create | 477 KB / 1,645 KB | 339 KB / 1,091 KB |
| /pricing | 206 KB / 643 KB | 206 KB / 643 KB (unchanged) |

Create open time (click to workspace prompt visible): b825dc9 95-182 ms; with `next/dynamic` 860-896 ms (regressed, fixed); HEAD 121-149 ms.

## Measured: Lighthouse, 3 runs, medians (perf score runs listed; LCP / TBT in ms)
Local production builds on the same box and server, `b825dc9` (before) vs `1686b42` (after, includes the Whop Pixel like prod):

| Route | Before: perf (3 runs), LCP, TBT | After: perf (3 runs), LCP, TBT |
|---|---|---|
| /app mobile | 73/72/73, 6069, 247 | 84/78/83, 4378, 160 |
| /app desktop | 97/97/97, 1249, 0 | 99/99/99, 1030, 0 |
| /app/create mobile | 77/77/76, 5808, 139 | 81/81/81, 4936, 71 |
| /app/create desktop | 97/97/97, 1248, 0 | 98/98/98, 1046, 0 |
| / mobile | 70/66/69, 3016, 1347 | 67/64/66, 3301, 1586 |
| / desktop | 89/89/89, 733, 273 | 86/86/89, 694, 317 |
| /pricing mobile | 68/68/67, 3280, 1227 | 66/68/68, 3124, 1407 |
| /pricing desktop | 89/89/88, 692, 277 | 87/89/79, 685, 302 |

Reading it: the wins are on /app and /app/create (mobile +5 to +11 points, LCP -1.7 s and -0.9 s, desktop +1 to +2). `/` and `/pricing` did not change within noise (I touched only a font preload there), and both are held down by the Whop Pixel in both builds.

Live prod keplar.one at b825dc9 (it has the pixel), 3 runs:

| Route | mobile perf, LCP, TBT | desktop perf |
|---|---|---|
| / | 72/72/70, 2806, 1264 | 90/91/90 |
| /pricing | 72/72/73, 2583, 1273 | 89/88/90 |

Live prod earlier today (before the pixel shipped; /app and /app/create never load it): / mobile 95/95/98 (TBT 80), desktop 100; /pricing mobile 98/97/98 (TBT 34); /app mobile 84/81/84 (LCP 4289); /app/create mobile 81/80/82 (LCP 4505). Live "after" numbers for /app need a deploy, which is not done.

Local runs have no CDN and gzip instead of brotli, so they read worse than live; compare before/after within a table only. The local server died twice during the runs (CHROME_INTERSTITIAL_ERROR, discarded and re-run).

## Found, not changed (decision needed)
- **Whop Pixel (b825dc9, other work) costs the marketing pages most of their performance score.** `t.whop.tw/fingerprint.js` runs a 1.31 s main-thread task on simulated mobile. Live keplar.one, 3 runs, medians: home mobile 70-72 (was 95-98 earlier today), TBT 1,264 ms (was 60-120); desktop 90 (was 100); pricing mobile 72-73 (was 97-98), TBT 1,273 ms. Without the pixel (local HEAD-minus-Whop build) the same pages scored 93-95. The snippet is pinned by tests, so I did not touch it. Options: load it after `load` + idle (small attribution loss for sub-second bounces), or accept the score. Your call.
- `/api/compute` is requested twice on /app load (KeplarApp meter + another consumer). Both are tiny; merging them touches the usage meter, so left alone.
- Render-blocking CSS (4 files, about 46 KB) is Lighthouse's estimated 550 ms on mobile home. `experimental.inlineCss` would fix it but changes caching and CSP surface; not attempted.
- Home mobile LCP ~2.7 s is the hero h1 after CSS; TTFB is 76-150 ms and HTML is static (`x-vercel-cache: HIT`), so the server is not the bottleneck.

## Whop Pixel deferral (2026-10-04, 10:47 EDT)
`WHOP_PIXEL_SCRIPT` is unchanged (tests pin it). `WHOP_PIXEL_LOADER_SCRIPT` (src/lib/whop-pixel.ts) wraps it in a once-guarded `go()` that runs after window load + `requestIdleCallback({timeout:3000})` (a 3.5 s `setTimeout` as fallback), or at the first `pointerdown` / `keydown` / `scroll` / `touchstart`, whichever is first. The `__whopApp` options script still runs first; exclusions, CSP and privacy settings are untouched.

Verified in Playwright against a local production build of this change (no t.whop.tw request before load or interaction; after: `s.js`, one `POST /conversions` page view, `fingerprint.js`, `sc.js`; zero CSP or page errors):
- /pricing idle: first request 344 ms after navigation (load at 255 ms); on click 257 ms, scroll 361 ms, key 298 ms.
- click + Tab + scroll in one visit: still exactly 1 page-view POST on `/`; 0 whop requests on /app and /contact.

Lighthouse mobile, 3 runs, local production builds, interleaved (before = `b825dc9` behaviour, after = loader):
| Route | Before: perf, LCP, TBT, speed index | After: perf, LCP, TBT, speed index |
|---|---|---|
| / | 62/67/71, 3085, 1518, 2451 | 64/70/69, 2867, 1535, 2097 |
| /pricing | 67/67/67, 3284, 1375, 1781 | 66/66/68, 3119, 1645, 1743 |

Result: LCP improves about 160-220 ms and speed index on / by about 350 ms, but the score and TBT do not move. Lighthouse loads the page in about 0.6 s of real time, so "after load + idle" still lands inside its measurement window (the 1.4 s fingerprint.js task runs at about 3.9 s simulated, before TTI), and it never interacts. Getting the score back would need a longer minimum delay (for example 6 s after load); interaction would still run it at once.
