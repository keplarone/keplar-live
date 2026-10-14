# Interface overhaul, October 2026

A pass against the "Master interface displacement and product design overhaul" brief. The brief's goal was one coherent product,
not a new coat of paint. So this pass replaces patterns that compete with each other: a second home screen, two hand-copied
themes, four button motion systems, translucent menus. It does not add new decoration. Earlier passes are in
docs/experience-pass-2026-10.md, docs/minimal-pass.md and docs/design-progress.md. Their decisions stand unless this file says
otherwise.

Nothing that works was removed: every view, mode, menu, setting and backend contract is unchanged.

## How it was checked

- **Audit script.** `scripts/interface-audit.mjs` drives a production build signed in, against the local fake model server
  (`scripts/fake-llm.mjs`, no provider keys, no spend).
  - Screens: every public and app surface below, at 1440x900 and 390x844, in Light and Dark.
  - Checks per screen: axe-core (WCAG 2.0, 2.1 and 2.2, A and AA), sideways overflow, targets under 24x24 (WCAG 2.5.8),
    controls cut off at the viewport edge and unnamed controls.
  - Run it with: `CHROMIUM_PATH=... AUDIT_DATA_DIR=<server data dir> node scripts/interface-audit.mjs <base> <outdir>`.
- **Before and after comparisons:** `docs/assets/interface-overhaul/*.jpg`.
- **Tests:** see "Verification" at the end.

## Screen inventory (before)

| Surface | Route / component | Found |
|---|---|---|
| Landing, nav, footer | `/`, `sky/SkyHome`, `chrome/Nav`, `chrome/Footer`, `chrome/PageChrome` | Mature. The section index on the left had 24x11 hit areas 17px apart (fails 2.5.8). axe flagged the muted half of three headings, but at rest it is 5.1:1: the scroll-reveal fade was mid-animation when measured (not a defect). |
| Pricing, features, download, help, 404 | `sections/Pricing`, `FeaturesView`, … | Same index-target issue; otherwise clean. |
| Sign in, sign up, recovery | `auth/AuthShell`, `AuthForm`, `RecoveryForms` | "Log in" on the page, "Sign In" in the nav, "Sign in" in the app. The Sign up / Log in toggle was the boldest (black) element, while the only way in (the email link, when passwords are off) was a pale secondary button. Buttons swelled on hover and squashed on press. |
| App shell (sidebar, top bar) | `KeplarApp`, `Sidebar`, `App.module.css` | **Duplicated:** a ~150-line light layout block plus a "generated" dark copy with hard-coded hex values (106 colour literals in the file). The light theme (the default) painted a moving sky backdrop plus four corner glows behind the work. The phone drawer was translucent, so the greeting and composer read through it. Top-bar actions were floating white discs with drop shadows. |
| Welcome-back screen | `WelcomeBack` | **A second home over the real one:** greeting, composer, starters and the last three chats, with the website's nav pills, a model carousel and the sky backdrop. Shown once per visit to returning people; it had to be dismissed or acted on before the workspace. The desktop app had already dropped it. |
| Empty chat | `KeplarApp` welcome | The greeting was an animated four-colour gradient (`background-clip: text`, 9 s loop). |
| Composer and its menus | `Composer` | **Duplicated** light and dark blocks again (42 literals). The Modes, Attach and routing pop-ups were 88%-opaque frosted glass, so the disclaimer and starter chips showed through the menu text. |
| Answer turn | `KeplarTurn` | axe: `aria-label` on a plain `<span>` (the model bars). "Edit" and "Shortcuts" (designed as quiet text actions) rendered as floating shadowed pills because of a global rule. |
| Modes (Study, Deep Research, Reason, Debate, Slides, Create image) | Composer Modes menu, `StudyMode`, `research/*`, `DebateView` | Reached from one Modes menu. The menu legibility issue above. |
| Create (apps, images, video, mobile) | `CreateStudio`, `apps/studio.module.css` | The kind tabs were defined three times in one file (underline, then pills, then shadowed pills with a springy lift). On a 390px phone "Mobile (Beta)" was cut off. App cards had pastel gradient "posters" and jumped 4px on hover with an overshoot spring. |
| Slides | `SlidesStudio` | The slide-count slider had a 16px-tall hit area. |
| Settings, memory, billing, usage | `SettingsDialog`, `AccountSettings` | Well organised (grouped, searchable). On phones the category row scrolled sideways with no sign that it continued. |
| Projects, All chats | `Views` | The page title said "History"; the sidebar, search and page heading said "All chats". |
| Agents, Business, Approvals | redirect to business.keplar.one | Keplar Business, a separate product: out of scope here, and kept clearly separate. |
| Errors, offline, loading | `app/error.tsx`, `app/app/loading.tsx` | No error boundary for `/app` (a crash fell through to the website's error page). The site error page was inline-styled. No offline state in chat. |

**Cross-cutting findings**

- **Tokens re-declared down the cascade.** Radii, shape and border tokens were defined in `tokens.css` and then re-declared in
  `glass.css`, `light.css` and `redesign.css`. The values in the documented source were not the ones on screen: the shape test
  pinned `--shape-control: 12px`, while every page rendered 14px.
- **Four button motion systems on one element.**
  - `Button.module.css`: swell on hover, squash `scale(0.97, 0.92)` on press.
  - `redesign.css`: 1px lift on hover, 0.97 press.
  - `lit.css`: `translateY(1px) scale(0.985)` on press, with a 1.56 overshoot.
  - `Magnetic`: the button leans toward the pointer.
  - Ten more modules had their own `scale(1.03, 1.015)` swell. On primary buttons the hover background was the same as the rest
    state, so the swell was the only hover feedback.
- **A global class-name rule.** `redesign.css` gave a drop shadow (with `!important`) to anything whose class contained
  btn, chip, pill, tab or cta. Inside the app it overrode components' own quiet designs. The October experience pass had already
  flagged this as the main design-system debt.
- **Terminology.**
  - "Log in" vs "Sign in" vs "Sign In".
  - "See plans" vs "View plans" vs "Compare plans" for the same link.
  - "History" vs "All chats".
- **Repeated implementations not changed in this pass** (see "Next"): about 13 dialog implementations, 10 toast styles and four
  confirm patterns (including `window.confirm`).

## Principal design decisions

1. **The product canvas is calm and flat in both themes.** No backdrop art, corner glows or gradient text in `/app`. The website
   keeps its sky and aura (brand marketing); the workspace is where work happens. This matches the desktop app, which already
   worked this way.
2. **One layout, two palettes.** The app shell and composer are each one block that reads product surface tokens. A theme
   changes colours, never layout.
3. **Overlays are opaque.** Menus, popovers, drawers and dialogs use `--surface-overlay`. Inside `.app` the "liquid glass"
   tokens resolve to opaque surfaces, so every component that reads `--lg-*` became legible with no per-component rewrite.
4. **One home.** The welcome-back overlay is retired. Its one unique piece, the last three chats, moved onto the app's own empty
   screen as "Pick up where you left off". It shows only under 900px; on wider screens the sidebar's Recents show the same chats.
   Resuming is still one click, with no overlay to dismiss and no second nav system.
5. **Quiet controls by default, one ink action per area.**
   - Top-bar actions are transparent icon buttons that fill on hover.
   - The chat title is plain text, not a floating pill.
   - Starter chips are outlined.
   - The sign-in toggle and Create's kinds are segmented controls (a quiet track with the selected item raised).
   - The submit, send and New chat stay ink.
6. **One motion model.** Hover changes colour or shadow. Press is a uniform `var(--m-press)` dip on the `scale` property, so two
   rules can never compound. There is no swell, squash or pointer pull, and reduced motion removes the press movement.
   Overlay, route and stream motion are motion.css's, unchanged.
7. **Honest states.** The offline notice reads the browser's real online/offline events. The error copy says what is safe and
   offers one way forward. No fake progress was added.

## Design system changes

| Piece | Where | What |
|---|---|---|
| Product surface tokens | `tokens.css` | `--surface-panel`, `--surface-raised`, `--surface-overlay`, `--hairline(-strong)`, `--hover-wash`, `--press-wash`, `--elev-1/2/3`, defined for Light and Dark. |
| Radius and shape tokens | `tokens.css`, `src/lib/tokens.ts` | Declared once, with the values that actually render (10/14/18/24/28; shape control 14, card 22). Removed from `glass.css` and `redesign.css`. Border tokens moved into `tokens.css` (dark) and `light.css`. |
| Lifted-button rule | `redesign.css` | Scoped out of the product with `[data-product]` (set on the app shell and the Settings dialog). Marketing pages keep the canvas look. |
| Button motion | `Button.module.css`, `glass.css`, `lit.css`, 11 modules | Swell and squash removed. Primary hover uses `--c-ink-hover`. Lit's press moved to `scale`. `ButtonLink` no longer has the magnetic pull by default. |
| `StatusScreen` | `components/status/` | One full-view status (mark, title, sentence, one primary and one secondary action, help line) on the shared `Button`. Used by the site and app error pages. |
| Segmented control pattern | auth toggle, Create kinds | A quiet track with the selected item raised (the routing panel's existing look). |

## Interfaces replaced

- **Welcome-back overlay:** replaced by "Pick up where you left off" (`ResumeChats`) on the app home, under 900px.
- **Light layout plus generated dark copy (App, Composer):** replaced by one token block each. `App.module.css` went from
  1,934 to ~1,800 lines with no hex values in the layout block. The Composer went from 42 colour literals to 1 (a fallback).
- **Animated gradient greeting and sky backdrop in `/app`:** replaced by the greeting in ink on the plain canvas.
- **Frosted menus and drawer:** replaced by opaque overlays.
- **Floating top-bar discs and title pill:** replaced by quiet icon buttons and a plain title.
- **Create's three competing tab styles:** replaced by one segmented control that fits a 360px phone. Pastel poster gradients
  and the jumping cards are replaced by flat posters and an edge highlight.
- **Inline-styled site error page and no app error page:** replaced by `StatusScreen` on both, with an app-specific message
  ("Your saved chats are safe", Try again, Start a new chat).

## Usability

| Task | Before | After |
|---|---|---|
| New user starts a chat | Composer focused on the app home | Unchanged (0 clicks) |
| Returning user resumes a chat | A full-screen overlay first: pick a chat from it, or dismiss it to reach the workspace | Lands in the workspace. Desktop: sidebar Recents (1 click). Phone: "Pick up where you left off" (1 click) |
| Launch Deep Research | Modes, Deep Research; the menu was see-through over the starters | Same 2 clicks; the menu is legible |
| Create an image or video | Create, kind tab (cut off on phones), prompt | Same path; all kinds visible on a 360px phone |
| Change a preference | Settings (grouped, searchable) | Unchanged; the phone category row shows it scrolls |
| Hit an error and recover | Inside `/app`, the website's generic error page | The app's own error view: Try again in place, or start a new chat; says saved chats are safe |
| Lose the connection | Nothing until a send failed | A quiet "You're offline" line above the composer, gone when the connection is back |

## Accessibility

- **axe-core (WCAG 2.0, 2.1 and 2.2, A and AA) on every audited screen, both themes, both sizes.**
  - The app's real violations are fixed: the answer card's prohibited `aria-label` now sits on `role="img"`.
  - The home page's three remaining contrast reports are the scroll-reveal fade measured mid-animation. At rest it is
    #686d78 on #f7f8fa, 5.1:1.
  - The Agents report was Chrome's own offline page: `/app/agents` redirects to Keplar Business, which the test container
    cannot reach.
- **Target size (2.5.8):** fixed for the sidebar logo link (18px to 32px; 44px on touch), the page section index (11px to 24px
  rows), and the Slides count slider (16px to 24px). Remaining small items are inline text links and a checkbox with a full
  clickable label, both allowed by 2.5.8.
- **Contrast:** overlays are opaque, so menu and drawer text no longer depends on what is behind it.
- **Keyboard focus:** unchanged on purpose. The owner's rule (`e2e/no-focus-box.e2e.ts`: a brightness shift plus an underline
  or bar, never a box) still holds. Opaque overlays make that cue easier to see.
- **Not done:** a screen-reader walk-through (VoiceOver, NVDA) of ask, answer and share, carried over from the last pass.

## Terminology

- "Sign in" everywhere in English copy: page titles, the toggle, recovery, passkeys, two-factor, security page, nav. "Sign
  out" was already consistent. Other locales keep their own translations.
- "See plans" for every in-app link to pricing. "Upgrade" stays the direct action and "Get more" the paid-plan top-up.
- "All chats" for the history view's page title and the workspace card link.

## Verification

All results below are from production builds (`next build`) on Oct 13–14, 2026.

**Static checks**

- `tsc --noEmit` is clean.
- ESLint is clean on every changed file.
- `next build` succeeds. Its one warning, a Google Sans font-override, was already there.

**Unit tests (`npm test`): 2,796 of 2,801 pass**

- The 5 failures fail identically on untouched `main`:
  - Keplar Browser acceptance x2 (needs outbound network);
  - the two "electric blue" palette checks;
  - privacy collection classification.
- New: `tests/interface-overhaul.test.ts`, 11 contracts:
  - product tokens defined in both themes;
  - one layout block for both themes;
  - opaque overlays;
  - no backdrop art in the app;
  - the lifted-button rule scoped out of the product;
  - one motion model;
  - radius tokens declared once;
  - "Sign in";
  - the error boundary and offline notice;
  - the resume list and its dates.
- Updated where they pinned replaced behaviour: `light-aura`, `desktop-nav-controls`, `drafts`, `chat-cards`, `shape-system`,
  `controls`, `business-app`. The last now checks that every lifted-button rule skips Business, instead of counting rules.
  `welcome-back.test.ts` is removed with the overlay.

**Browser e2e (Playwright, production build, the repo's fake model server)**

- **Same four suites against `main` and this branch** (even-scaling, no-focus-box, chat-delete, answer-card):
  - `main`: 32 failures.
  - This branch: no new failures. Fixed: chat-delete, no-focus-box "/app: pressing the composer's tool buttons and sidebar
    draws no box", and "no box on press at 360 dark".
  - After the hover-shadow change, no-focus-box goes from 2 of 8 passing on `main` to 6 of 8.
- **Final full run, 12 suites, 246 tests: 217 pass.**
  - Suites: basics, smoke, mobile, recents, chat-delete, app-tabs, a11y, no-focus-box, answer-card, even-scaling,
    typing-hidden, split-view.
  - Every one of the 29 failures also fails on `main`, or cannot run here:
    - **Can't run in this container (11):** `/enterprise` (a11y x2, even-scaling x9) and app-tabs "deep links" redirect to
      business.keplar.one, which the container cannot reach. "Deep links" also still expects Agents and Business to open
      inside `/app`, though they now hand off to Keplar Business (a product decision for the owners).
    - **Starter cards (12):** "the floating composer overlay never cuts the first row of starter cards" fails at all 12
      sizes on `main`. The empty-chat layout centres the composer above the starters on purpose (minimal pass); the test
      predates that.
    - **Scroll lock (1):** "mobile menu and command palette release the scroll lock": `#mobile-menu` no longer exists
      (the nav's Menu pill morphs in place).
    - **Answer card (2):** "a clarifying question keeps its chips" and "the card has one style". Already listed as failing
      on `main` in the previous pass.
    - **No focus box at 1440 (2):** the Help tiles. `polish.css` lifts a tile 3px over 0.5s on hover while the light theme
      swaps in a deeper shadow, so a press mid-lift reads as a new glow. On `main` these tests stopped earlier, on the hero
      button's hover shadow (fixed here).
  - Corrected stale assertions: `e2e/chat-delete` (the greeting is "Good …" since 10-12; the empty chat hides its title) and
    `e2e/app-tabs` (the sidebar's New chat is `data-nav="new"` since the minimal pass).

**Final interface audit (`scripts/interface-audit.mjs`, 66 screens)**

- Every `/app` screen in both themes and both sizes: 0 axe violations, 0 targets under 24px, nothing cut off.
- The Settings category row on phones still counts as "partly off-screen": it is a scroller and now fades at its edge.
- Marketing pages: from 5–8 small targets each to 1 (an inline email link, allowed by 2.5.8).

## Next (not in this pass)

1. **One Dialog, Menu and Toast.** There are about 13 hand-rolled dialogs, 10 toast styles and four confirm patterns
   (`window.confirm` in 11 places). `studio-mode/ui/Dialog.tsx` and `Menu.tsx` are the best existing kit to promote to
   `components/ui`.
2. **One button component in the app.** The shared `Button` is used only on marketing pages. About 59 CSS modules define their
   own button classes. The product tokens make a single `ui/Button` variant set (primary, secondary, quiet, icon) a mechanical
   migration.
3. **The lifted-button rule on marketing pages.** It is now scoped out of the product, but it is still a class-name selector.
   Moving the lifted look into `ui/Button` would let it be deleted.
4. **Hard-coded colours** in `DebateView.module.css` (23) and other app modules.
5. **Card hover lift on marketing pages.** `polish.css` lifts linked cards 3px over 0.5s while some modules also deepen their
   shadow. Pick one hover cue for cards (the edge, as in the app) so `e2e/no-focus-box` passes everywhere.
6. **Stale e2e expectations to settle with the owners:** the starter-card overlay test (12 sizes) and the `#mobile-menu`
   scroll-lock test describe layouts that have since changed on purpose.
