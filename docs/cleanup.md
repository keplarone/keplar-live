# Website cleanup log (Oct 4)

Rules: tiny commits, explicit paths, nothing pushed or deployed; code is removed only when tsc, lint, tests and the build stay green. Screenshots: `/workspace/keplar-assets/cleanup/{before,after}/`.

## Code
- Removed 8 files nothing imported (only a barrel `create/index.ts` that nobody imported re-exported 4 of them): `create/{MediaGenerator,ProjectBuilder,PublishPanel,ui}.tsx`, `create/index.ts`, `spatial/CreateLane.tsx`, `ui/FitText.tsx`, `business/index.ts`. tsc green, 46 related tests pass.
- Removed the dev dependencies `potrace` and `svgo` (nothing imports them; they were a one-off wordmark tracer, the traced path is committed in `brand/geometry.ts`): `package.json`/`package-lock.json` lose 90 packages and the 5 moderate dev-audit findings; `npm audit` now reports 0. `node_modules` was not touched.
- Removed 136 CSS-module rules whose class is referenced nowhere (no `styles.x`, no `styles["x"]`, no dynamic lookup, no selector elsewhere). Found with a postcss-based detector and removed rule by rule: App/Composer/KeplarTurn/business 46, Create stylesheets (create, discovery, images, productImport, video) 85, MonolithHome/Inquire/kb/Shared 5. Build and the related tests stay green.
- Removed unused `CreateView` (+ its `creations` array and 15 CSS rules), `IconFile`, `docCount`, `GLOSSARY_COUNT`, `firstParagraph`, `docsLastUpdated`, the unused imports `IconClose`, `BUILDER_LIMITS`, `plain`, `glossary`, `allDocs`, and an unused `WIDTHS` const in `scripts/mobile-audit.mjs`. ESLint warnings 34 → 28, errors 0.
- Added `scripts/cleanup-shots.mjs`: full-page shots for every public route at 360/768/1440 × Light/Dark with automatic checks (horizontal overflow, clipped text, duplicate paragraphs, fonts, blue hues, tiny text, button radii).

## Visual
The automatic audit of 42 routes × 3 widths × 2 themes (252 shots) found no horizontal overflow, no clipped or truncated text, no duplicated paragraphs, no non-Google-Sans font, no blue. Button radii are the shape system's pill and 12px control (plus the documented rectangular ProductDemo tabs). Fixes:
- **Footer**: "Learn" had 13 links in one column beside columns of 3–5 links. Now it spans two tracks in two columns. The brand column is narrower so "What is superintelligence?" no longer breaks mid-word. The contact email used uppercase-label letter-spacing and read "t e a m @ …"; it is normal text now. (Before: `before/*` footers; after: `after/*`.)
- **Small type**: 10.5px (home model names/note) and 10.8px (source-note line on editorial pages) raised to 11px+.

## Selection / focus boxes (founder add-on)
Cause of the box around Plans/nav on click: (1) `polish.css` drew a 1px ring + glow on `__plan/__card/__tile` hover (so a click on a plan boxed it); (2) `.lg:focus-within` ringed the whole nav capsule when any button/link inside was pressed (same for the app composer, search bar, home composer, template cards); (3) a "click shock" outline ring on every `data-lit` button; (4) no `-webkit-tap-highlight-color`, so phones drew the default tap rectangle; (5) a global 2px `:focus-visible` outline rectangle.
- `e961498` global: tap highlight transparent; `:focus`/`:focus-visible` never draw an outline (`!important`, except forced-colors where the system outline stays); keyboard cue is `filter: var(--focus-filter)` (brightness) plus a 1px underline on links/buttons/summary/tabs; buttons, canvas and nav are `user-select: none`; click-shock ring and its listeners removed.
- `7a1748e` containers: `:focus-within` rings now only when a text field inside is focused.
- `168b11b` plan/card/tile hover lifts 3px only, no ring or glow.
- `5602a3e` regression: `tests/no-focus-box.test.ts` (static) and `e2e/no-focus-box.e2e.ts` (press sections, cards, canvas, nav items, buttons on /, /pricing, /about, /help, /signin at 360 and 1440, Light and Dark, plus /app; asserts no outline, no tap highlight, no new ring or glow on the pressed control or any container; keyboard Tab shows no outline but a filter and underline). The first run, before the hover fix, caught the `li.plan` ring.
- Screenshots: `/workspace/keplar-assets/cleanup/focus/{before,after}-{nav-click,cta-press,plans-click}-{360,1440}-{light,dark}.png`.
- Not changed: module-level `:focus-visible` outline rules are still in the source (about 90) but are neutralised by the global `!important`; custom-radio `.radio:has(input:focus-visible)` outlines (keyboard only, hidden native input) remain; typing fields keep their quiet glow while typed in; admin and /app/create were covered by the global rule, not clicked one by one.

- `864986c` follow-up: the home send button (`.go`, MonolithHome and the unused OrbHero) grew a 40px white glow on hover/press. It now only scales. Help tiles lost their outer hover glow. The e2e also sweeps hover on up to 14 buttons per page (/, /pricing, /signin, /download, /help at 1440, Light and Dark) and fails on any new outer box-shadow. All 8 no-focus-box tests pass, including signed-in /app (a magic-link test account) at 360 and 1440, Light and Dark.

## Typing stall in the mocked `basics` specs (investigated)
- Symptom: the answer card shows "Keplar Answer" + "Use" and never reaches "Use Postgres." within 30 s.
- Reproduction on a production build: 30/30 runs pass when the machine is idle (about 2 s each). With 16 busy loops on 8 cores, 15/15 still pass but take 7-30 s. With CDP CPU throttling at 25-80x, frames are 1.2-2.4 s apart and the whole ask takes 7-14 s, most of it before the card appears.
- Root cause: mostly headless swiftshader / main-thread starvation. It is not a logic hang: requestAnimationFrame keeps firing, the page stays visible, and every frame advances the reveal. One real weakness made it worse: every frame was clamped to 100 ms of reveal, so on slow frames the reveal ran in frames, not seconds. A 600-character answer needed 20 frames at 60x throttle, about 40 s of wall time at 2 s per frame.
- `e925f90` fix: after two frames in a row slower than 100 ms, a frame may advance up to 1 s of real time. A single hiccup is still clamped, so a busy tab never teleports. Tests: `tests/typing.test.ts` (unit) and `e2e/typing-slow.e2e.ts` (60x CPU throttle; 20 frames before the fix, 2 after; verified failing on the old hook).
- The 13-character mocked answer needs only 3-4 frames either way, so on a very loaded CI box a `basics` timeout is still possible. That is frame starvation, not a bug.

## Startup race on /app (production bug, fixed)
- Bug: a question sent before `/api/compute` answered got its 200 answer, then the view went back to the empty home and the answer was lost.
- Cause: the app starts with scope `"pending"`. The first `/api/compute` answer was handled like an account switch: every run controller was aborted and the `scope` reducer replaced the threads with the stored ones (`{...state, ...loaded}`), dropping the in-memory first turn.
- Fix (`ac40f54`): moving from pending to a real scope merges the chats that have messages in front of the stored ones and keeps the active chat. The run is no longer aborted. A real account switch still replaces everything. The app root carries `data-app-ready` once the scope is known.
- FAQ: before `/api/faq` answers, the home list shows the fallback (pinned question plus starters), never an empty list. The flaky check compared that fallback (or an unmounted list) with the API. The list now exposes `data-faq=loading|loaded|fallback` (`4100fc8`), and the specs wait for it (`e35fb67`).
- Tests: `tests/startup-race.test.ts` and `e2e/startup-race.e2e.ts` (delays `/api/compute` 5 s and `/api/faq` 6 s; the first answer stays, survives a reload, and a late FAQ fills the list). Before the fix the e2e ends on the empty home screen.

## /app tab URLs (founder ask)
Each main tab is a real App Router path. In-app switches use `history.pushState` so the shell stays mounted (a Next.js navigation would remount and drop in-flight answers). Browser back/forward listens to `popstate`.
| Tab | Path |
|---|---|
| Ask | `/app/ask` |
| Create | `/app/create` |
| Projects | `/app/projects` |
| Agents | `/app/agents` |
| Business | `/app/business` |
| Deployments | `/app/deployments` |
| Approvals | `/app/approvals` |
| Slides | `/app/slides` |
| Study | `/app/study` |
| History | `/app/history` |
Redirects: `/app` and `/app/` → `/app/ask` (308 via next.config + `permanentRedirect` in `app/page.tsx`). Short `/create` still → `/app/create`. Settings / Memory / Usage stay under `/account` (not app tabs). Project filter inside History/Projects stays React state (no `?project=` yet).

## Kept on purpose (looks like placeholder copy, is not)
"Coming soon" badges on Google/Microsoft sign-in, "(image ideas are placeholders)" on the Plus card, beta-label copy on /about, `[placeholders]` in /prompts templates are marked, honest labels. ProductDemo's 14/22px rectangles are documented in `docs/shape-system.md`.

## Skipped
- `FieldHome`, `FieldFigure`, `OrbHero` (+ CSS) and `PageField`: not in the app, but about 8 tests read their sources and `PageField` is documented as kept for reuse. Removing them means rewriting others' tests.
- `src/field/*`: workers / dynamic usage, not proven dead.
- ~45 unused exports in recent feature code (referrals, team, higgsfield, API keys …): in-progress work by others.
- `console.log` kept: local-scheduler, the `api/docs` sample code, the `ops/log` sink.
- `account.module.css` unused `oauth*`/`divider`/`switch`/`check`, and classes in `builder`/`ws`/`Button` modules (dynamic lookups), `katex`/`keplar-desktop` (global), `logo`/`sc`/`pos`/`card`/`q`/`pill` (selectors elsewhere).
- Remaining lint warnings (`react-hooks/set-state-in-effect`, `window.location.assign`, unused vars in tests/scripts): not trivially safe.
- Not verified: real devices (Chromium only); CSS removals rely on static analysis + build + tests, not a pixel diff of every page.
