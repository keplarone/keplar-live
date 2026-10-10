# Design progress (Monolith home, space layer, site-wide pass)

Notes so work survives interruptions. Newest first. "deployed" = live on keplar.one (worktree deploy).

## Done and deployed
- **Home CLS and a11y** (`18daf3a`): `data-fx` is set on `<html>` before first paint (`src/lib/home-fx.ts`, in the layout head), so the pinned (webgl) or stacked (static) home layout is chosen up front and does not shift on hydration. `aria-label` on `<p>`/`<span>` replaced by visually-hidden text + `aria-hidden` visuals. Measured with `scripts/cls-check.mjs`: CLS 0 in default (static) and `?fq=low` (webgl), desktop and mobile. Lighthouse after: mobile perf 95/98/97 (three runs), a11y 100, CLS 0; desktop perf 100, a11y 100, CLS 0.
- **Typing stays instant** (`scene.typing()` via `agitate`): 20 fps light mode with the space parts off for 1.4 s after a keystroke, shader programs compiled once after the first frame. `scripts/typing-latency.mjs`: median key round trip 3–4 ms, p95 ≤ 13 ms with the canvas running on a CPU rasteriser.
- **Space layer**: nebula, depth stars, warp streaks, galaxy, eight solar-system planets with chromatic hues (Saturn + rings), orbit rings, aurora, mist (`src/field/monolith/space*.ts`). UI chrome stays B/W; only the Three.js planets are colorful. Dark base is the original graphite `#0b0b0d`, not black.
- **Fit at 320 px**: wrap-able rows/chips are soft rectangles. `scripts/fit-e2e.mjs --signed-out-only --quick`: 42 audits, 0 problems (was 12).
- **Open Keplar when signed in**: `scripts/signed-cta-e2e.mjs` (mocks `/api/compute`): signed out shows only "Try Keplar", signed in only "Open Keplar", on 8 routes.
- **Caret and pointer**: `scripts/no-follower-e2e.mjs`: no fixed or absolute element moves with the pointer on 6 routes; the smooth caret follows typing. (Control hover glints `ProximityLight` and `Magnetic` lean exist on buttons only.)
- **Neutral greys**: slate shadows replaced in glass, nav, onboarding, account menu, pipeline, app css, KeplarTurn, Create workspace.
- **Ambient + PageChrome** (`b3f25ec`, `6496be4`): CSS smoke only where the 3D page layer is not running, heading glide, reading-progress hairline and left tick index from the page's own h2s. Fixed `PageMonolith` leaving an empty canvas on CPU-GL.

- **Polish + cookie card** (`349017e`) and **heading glide at 60% opacity** (`5e10573`, deployed): axe read the glide's near-zero start opacity as a contrast failure (a11y 96). After the fix on https://keplar.one/ (Oct 4): mobile perf 97 / 95 (one run returned 0 = transient Lighthouse failure), a11y 100, best-practices 100, SEO 100, LCP 2.3-2.7 s, TBT 110-120 ms, CLS 0; desktop 100/100/100/100, LCP 0.6 s, TBT 0, CLS 0.
- Deploy gotcha: another executor's deploy of an older commit (`78b9fce`) replaced mine at 04:00; check the live CSS (`amb-rise` start opacity `.6`) after every deploy, and redeploy from HEAD if it regressed.

## Route-by-route redesign (Oct 4, second pass)
Language: pill eyebrow with a lit dot, big tight titles, a light seam under heroes, lit panels (soft top light + hairline edge, `src/styles/monolith-ui.css`), numbered rails/sections, no blue. One change per commit, deployed from workspace HEAD; check live CSS after each deploy.
- `9958ba7` Pricing: lit plan panels, big light numerals, full-width Custom row, glowing meter panel.
- `355f1e5` Shared page hero (`RoutePlaceholder.module.css`) + Editorial template (about, models, guides, landing pages): sticky numbered contents rail on wide screens, lit short-answer panel, numbered section heads, lit tables.
- `119d6a2` Help: topic tiles, sticky topic rail, panelled accordions with plus marker (new `Help.module.css`).
- `b48d921` Auth (sign-in/up/recover): statement panel left with numbered points, lit form card right.
- `79590a9` Legal (privacy/terms/security docs): pill eyebrow, big title with seam, lit intro, a panel per clause.
- `00f524b` Feedback/contact forms. `107f845` Download. `0bf2358` Account/settings. `0936f0c` Ask start page (behaviour unchanged). `4fc618a` Business OS + Compare. `7f03459` Simulation shell.
- Lighthouse mobile 0 explained: NO_NAVSTART from Lighthouse itself (trace recording failed once, runtimeError code), not the site; five re-runs on https://keplar.one/ after: perf 95/97/96/95/95, a11y 100, BP 100, SEO 100, CLS 0.
- `a7ce12b` 320px fit after the redesign: pricing meter rows stack, legal layout stays one column below 1081px, fit audit counts a framed scroller as reachable. `fit-e2e --signed-out-only --quick`: 42 audits, 0 problems.
- `8f6c40d` Legal clause headings skip the scroll glide + numbers use ink-2 (Lighthouse a11y on /privacy 96 -> 100, live and verified). `41f6062` Download reserves the device panel height (Lighthouse mobile CLS 0.064 -> 0 expected; verify after deploy).
- Route status (all deployed, live CSS checked): pricing `9958ba7`, /app Ask `0936f0c`, help `119d6a2`, settings/account `0bf2358`, sign-in/up `b48d921`, legal `79590a9`, about+models `355f1e5`, compare+business `4fc618a`, download `107f845`, contact `00f524b`, simulation `7f03459`.
- Lighthouse mobile after the redesign (https://keplar.one, Oct 4): home 95/95/98 (+desktop 100), pricing 97, help 97 (one run 64 with TBT 10.5 s while the box was stalled, rerun 97), about 97, models 97, contact 98, docs 97, enterprise 98, security 98, terms 98, privacy 98 after the fix; a11y 100, BP 100 everywhere; SEO 66 only on /signin and /signup (noindex by design).
- Compare montages: `/workspace/shots/compare2/{d,m}-{dark,light}-<route>.png` (before left, after right; account and signed-in /app after = local dev, signed-in).
- Screenshots: before `/workspace/shots/before2/{d,m}-{dark,light}-<route>.png` (prod, pre-redesign; they still show the cookie card), after `/workspace/shots/after2/...`.

## In progress / next
- Route-by-route pass: pricing, /app Ask, help, settings, auth, legal, dashboard; before/after in `/workspace/shots/routes-before` and `routes-after*`.
- Theme sweep: `scripts/theme-sweep.mjs` found no hard-coded blue. Remaining flags are disabled-state buttons and mid-animation text (not real). `/admin` is dark only by design.
- Lighthouse re-run after each deploy (`/tmp/lh`, `npx lighthouse`).

## Parked
- Alive effects beyond the calm smoke and heading glide (floating cards were dropped: many animated layers).
