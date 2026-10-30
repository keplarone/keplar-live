# Keplar Orbit — the Keplar One interface

Owner direction (2026-10-30): change all of the interface and the whole layout; every button gets a special, good effect; no bugs.
Orbit replaces the previous visual layers. It keeps every feature, route, API, price, claim and behaviour; it changes the interface only.

## 1. Principles
1. **Chat first, structured.** The product is the conversation. The layout gives it room and puts everything else one step away.
2. **One accent, many greys.** Graphite neutrals do the work. One signature accent ("Orbit", a clear cobalt) is used for the primary action, focus and live state. No gradients on text except the brand mark moments.
3. **Every control feels made.** Each button has a crafted response (section 5), and none of it is decoration on top of slowness: effects run on the compositor, are under 300 ms, and turn off for reduced motion.
4. **Calm by default.** No bouncing, no looping attention-seekers. Motion answers the user's action.
5. **No regressions.** Behaviour, copy, links, keyboard paths, test hooks (`data-testid`, roles, labels) stay. Accessibility stays at Lighthouse 100.

## 2. Type
- UI text: **Inter** (variable, `next/font/google`, `opsz` on), 14px base in the app, 16px on marketing.
- Display: Inter Display cut via `opsz` at 32px+ with -0.035em tracking, weight 600.
- Code: **JetBrains Mono** (OFL, `next/font/google`).
- Scale (px): 11 · 12 · 13 · 14 · 16 · 18 · 22 · 28 · 36 · 48 · 64. Line height 1.5 text, 1.15 display.

## 3. Colour tokens (CSS custom properties on `:root[data-theme]`)
Light: canvas `#fbfbfc`, surface-1 `#ffffff`, surface-2 `#f4f4f6`, surface-3 `#ececf0`, line `rgb(15 18 30 / 0.08)`, ink `#0e1014`, ink-2 `#4a4f5c`, ink-3 `#6b7180` (AA on canvas), accent `#2f5bff`, accent-ink `#ffffff`, accent-soft `rgb(47 91 255 / 0.10)`, good `#0f8a5f`, warn `#a86400`, bad `#c8323c`.
Dark: canvas `#0b0c0f`, surface-1 `#121318`, surface-2 `#181a20`, surface-3 `#20232b`, line `rgb(255 255 255 / 0.08)`, ink `#f2f3f5`, ink-2 `#b4b8c3`, ink-3 `#8a8f9c`, accent `#6f8cff`, accent-ink `#0b0c0f`, accent-soft `rgb(111 140 255 / 0.14)`, good `#3fcf95`, warn `#f2b14c`, bad `#ff6b75`.
Radii: 6 (chips inside dense UI) · 10 (controls) · 14 (cards) · 20 (panels/dialogs) · 999 (pills).
Elevation: 0 flat; 1 `0 1px 2px rgb(0 0 0 / .06), 0 0 0 1px var(--line)`; 2 `0 8px 24px -8px rgb(0 0 0 / .18), 0 0 0 1px var(--line)`; 3 (menus/dialogs) `0 24px 64px -16px rgb(0 0 0 / .35), 0 0 0 1px var(--line)`.
Hairlines are allowed again (1px `--line`), used sparingly to structure dense UI.

## 4. Layout
### App (keplar.one/ chat, /app/*)
```
┌──┬────────────┬───────────────────────────────────────┬──────────────┐
│R │ Drawer     │ Top strip: title · model agreement ·   │ Context      │
│a │ (history,  │ share · ⋯                              │ panel        │
│i │ projects,  ├───────────────────────────────────────┤ (sources,    │
│l │ search)    │                                       │ models that  │
│  │ 264px,     │  Conversation column, max 760px       │ answered,    │
│56│ collapsible│                                       │ memory,      │
│px│            │  ── composer docked at the bottom ──  │ files)       │
└──┴────────────┴───────────────────────────────────────┴──────────────┘
```
- **Rail (56px):** logo; New chat; Chat, Create, Research, Study, Projects, Library (whatever destinations exist today — map existing nav items, don't invent features); bottom: theme, help, account avatar. Icons with tooltips; active item has an accent pill indicator that slides between items.
- **Drawer (264px):** search, recents grouped by day, projects; toggled from the rail (⌘\ / Ctrl+\); remembers state; overlays on tablets; a sheet on phones.
- **Canvas:** centred conversation (max 760px), empty state = greeting + composer centred + starter chips; when a chat starts the composer docks to the bottom with a soft fade above it.
- **Context panel (320px, right):** opens from the top strip ("Sources", "Models", "Memory" tabs) for the current answer, closed by default, overlays on narrow screens. Use only data that already exists (sources, model agreement, memory); if a tab has no data source today, omit the tab.
- **Phones:** rail becomes a bottom bar (5 items max), drawer is a left sheet, context panel a bottom sheet.

### Marketing (keplar.one/overview, pricing, features…, docs, space)
- New header: logo left, centre nav, right "Sign in" + primary "Open Keplar". Header condenses on scroll into a floating pill.
- Sections on a 12-column grid, max 1200px, generous 120px section rhythm; product screenshots framed in device-less "panes"; the sky stays as the hero backdrop only (calm, top of the overview page).

### Business (business.keplar.one + workspace)
Same rail/drawer/canvas grammar as the app, with Business destinations; storefront uses the marketing layout.

## 5. Button effects (the signature)
One shared implementation (`src/components/orbit/Button.tsx` + `orbit-fx.ts`), used by every button, link-button, icon button, chip, segmented control and menu item:
1. **Sheen** — a soft radial highlight follows the pointer across the face (CSS vars `--mx/--my` set on pointermove, throttled with rAF; the gradient is a pseudo-element; no layout work).
2. **Magnet** — primary and icon buttons drift up to 3px toward the pointer while hovered; resets with a spring on leave.
3. **Press** — scale .97 + 1px sink on pointerdown, spring back on release (CSS transition with a spring-like cubic-bezier; no JS animation loop).
4. **Focus** — keyboard focus draws an accent ring that animates in (outline-offset 0→2px, opacity), never on mouse focus.
5. **Loading** — the border becomes a sweeping progress arc (conic-gradient mask) and the label cross-fades to a spinner; width stays stable.
6. **Success** — label morphs to a check that draws itself (stroke-dashoffset), then returns after 1.6s.
7. **Icon micro-motion** — per icon intent: send arrow lifts, plus rotates 90°, copy icon offsets, trash shakes once, chevrons nudge, refresh spins once.
8. **Primary only:** a slow accent glow that brightens under the pointer.
Rules: transform/opacity/background-position only; `prefers-reduced-motion: reduce` → no sheen/magnet/micro-motion, instant states; touch (`pointer: coarse`) → press + focus only; disabled → none; never on text inside paragraphs.

## 6. Motion tokens
Durations 120/180/240/320ms; easings `--ease-out: cubic-bezier(.2,.8,.2,1)`, `--ease-spring: cubic-bezier(.34,1.56,.64,1)`; view transitions use the View Transitions API where supported (fade+8px rise), otherwise none.

## 7. Done means
Every route renders in Orbit in light and dark, desktop and phone; old visual layers (graphite overrides, space/violet tokens, glass leftovers) are removed or mapped to Orbit tokens; all tests, typecheck, lint, build pass; e2e flows (send a chat, sign in, open settings, create) still work; Lighthouse a11y 100.

## 8. Implementation notes (phase 1: foundation + app shell)

### File map
| What | Where |
| --- | --- |
| Tokens (`--o-*`: colour, type, radius, elevation, motion, shell sizes) | `src/styles/orbit/tokens.css` |
| Legacy names pointed at Orbit (`--c-*`, `--surface-*`, `--hairline*`, `--hover-wash`, `--elev-*`, `--r-*`, `--shape-*`, `--ks-*`, `--space-*` faces, `--nav-*`, `--g-*`) | `src/styles/orbit/legacy.css` |
| Button effects CSS (press, magnet, sheen, focus ring, loading arc, icon micro-motion) | `src/styles/orbit/fx.css` |
| Button effects runtime (one delegated listener set; `claim()`, `flashSuccess()`, pure helpers) | `src/lib/orbit-fx.ts`, mounted by `src/components/orbit/OrbitFx.tsx` in `src/app/layout.tsx` |
| Orbit primitives: `Button`, `ButtonLink`, `IconButton`, `Chip` | `src/components/orbit/Button.tsx` (+ `Button.module.css`), barrel `src/components/orbit/index.ts` |
| App shell layer (grid, drawer, top strip, composer, thread, search dialog, tooltips) | `src/styles/orbit/app.css` (replaces `gemini.css`) |
| Rail / bottom bar | `src/components/app-ui/shell/Rail.tsx` |
| Context panel (Sources, Models, Memory) | `src/components/app-ui/shell/ContextPanel.tsx` |
| Shell CSS for those two | `src/components/app-ui/shell/shell.module.css` |
| Fonts: Inter (opsz) as `--font-sans`, JetBrains Mono as `--font-mono` | `src/app/layout.tsx` |
| Living reference | `/dev/orbit` (`src/components/orbit/Showcase.tsx`, needs `KEPLAR_DEV_TOOLS=1`) |
| Load order | `src/styles/globals.css`: … `graphite.css`, `select-menu.css`, then `orbit/tokens.css`, `orbit/legacy.css`, `orbit/fx.css`, `orbit/app.css` (last wins at equal specificity) |

### Token names (use these in new CSS)
- Colour: `--o-canvas`, `--o-surface-1/2/3`, `--o-line`, `--o-line-strong`, `--o-field-line` (text-field edge, 3:1), `--o-ink`, `--o-ink-2`, `--o-ink-3`, `--o-accent`, `--o-accent-hover`, `--o-accent-ink` (text on accent), `--o-accent-soft` (selected fill), `--o-accent-text` (accent used as text, AA), `--o-good`, `--o-warn`, `--o-bad`.
- Channels for tints: `rgb(var(--o-ink-rgb) / .05)`, `--o-canvas-rgb`, `--o-accent-rgb`. Washes: `--o-hover`, `--o-press`, `--o-selected`.
- Type: `--o-font-sans`, `--o-font-mono`, sizes `--o-t-11 … --o-t-64` (rem), `--o-lh-text` 1.5, `--o-lh-display` 1.15, `--o-tr-display` −0.035em, weights `--o-w-regular/medium/semibold`.
- Radius: `--o-r-chip` 6, `--o-r-control` 10, `--o-r-card` 14, `--o-r-panel` 20, `--o-r-pill`.
- Elevation: `--o-elev-0 … --o-elev-3`. Motion: `--o-dur-1…4` (120/180/240/320 ms; 0 under reduced motion), `--o-ease-out`, `--o-ease-spring`.
- Shell: `--o-rail-w` 56px, `--o-drawer-w` 264px, `--o-canvas-max` 760px, `--o-context-w` 320px, `--o-topbar-h` 52px.
- Spec deviation: light `--o-ink-3` is `#636978` (spec `#6b7180` is 4.45:1 on surface-2 and fails AA there).

### How the legacy map works
`legacy.css` re-points the old names on keplar.one (`html:not(:has([data-space-root],[data-kb]))`, the same scope graphite.css used), so a module that still says `var(--c-ink)` or `var(--surface-raised)` renders Orbit. Semantic shifts to know: `--c-accent` / `--ks-primary-bg` / `--space-p-face` / `--nav-cta-bg` are now the cobalt accent (they were ink/white); `--shape-control`, `--r-input`, `--r-sm` are 10px rounded rectangles (were pills); `--c-reasoning` is the accent text colour; `--c-destructive` is `--o-bad`; `--g-glow` is 0 (the Gemini wash is off). Space Studio (`[data-space-root]`) and Business (`[data-kb]`) keep their own token sets until their area pass moves them: those areas should write `--o-*` directly.

### Button effects: how every control gets them
- No page edits needed. The runtime claims any `button`, `[role=button|tab|menuitem*|option|switch]`, `summary` or control-looking link the first time a pointer or keyboard focus reaches it, and tags it: `data-orbit-fx="<kind>"` (inferred from `data-variant`, role or icon-only content), `data-orbit-icon` (from the accessible name: Send/Copy/Delete/Retry/New/Next…), `--ofx-ps` (press depth by width), `data-ofx-sheen` (only if the control's `::after` is free) and `data-ofx-magnet` (primary, danger, icon).
- Already tagged on the server: kit `Button`/`IconButton`/`MenuItem`/`SegmentedControl`/`Tabs`, ui `Button`/`ButtonLink`, the Space segmented control, the rail.
- Loading: put `aria-busy="true"` on a `[data-orbit-fx]` control (Orbit `Button loading`, kit `Button loading`). Success: Orbit `Button success`, or `flashSuccess(el)` on any Orbit button.
- Opt out: `data-orbit-fx="off"` (e.g. a canvas-like control). Space Studio and `[data-lit]` controls are skipped by the runtime.
- Rules honoured: transform/opacity/background-position only; touch = press + focus; reduced motion = no sheen/magnet/micro-motion; disabled = nothing; prose links never claimed.

### Dos and don'ts for area agents
- Do use `--o-*` tokens and the Orbit primitives for new controls. Do keep every `data-testid`, role, aria label, route and copy.
- Do let the global focus ring work: don't draw your own outline/box-shadow focus, and never `outline: none` on `:focus-visible`.
- Don't give a control its own `::after` unless you accept losing the sheen; don't animate `transform` on hover (the effects use `scale`/`translate`); don't add hover lifts, glows, gradients on text, or backdrop blur.
- Don't write `*/` inside a CSS comment (e.g. `--c-*/--surface-*`): it ends the comment and breaks the whole stylesheet.
- Prefer editing the module that owns a class over adding more `[class*="Module-module"]` global overrides; when you must override from global CSS, scope it with `html:not(:has([data-space-root], [data-kb]))[data-theme]`.
- Check light, dark, 1440×900 and 390×844, and keep Lighthouse a11y at 100.

### App shell (what phase 1 built)
- ≥1200px: rail 56 · drawer 264 (docked, remembered in `localStorage["keplar.sidebar"]`) · canvas (760px column). 900–1199px: rail + drawer as an overlay (focus-trapped, Escape closes, focus returns to the rail toggle). <900px: rail becomes the bottom bar (Chat, Create, Study, Projects, Library), the drawer a left sheet opened from the top bar, the context panel a bottom sheet.
- Rail: Keplar home, Hide/Show sidebar (Ctrl/⌘+\), New chat (Ctrl/⌘+⇧+O), Search chats (Ctrl/⌘+K), Chat, Create, Study, Projects, Library (= All chats), theme, Help & docs, Settings (signed in) or Sign in. On wide screens the drawer hides its own copies of New chat, Search, the brand, the settings gear and the signed-out row, so no two visible controls share a name.
- Top strip: title, the latest answer's agreement ("3 of 3 models agree"), which opens the context panel; delete, memory, auth as before. Context panel tabs appear only when the data exists (answer sources, answer models, memory setting).
- Canvas: empty state centres greeting + composer + starter chips; once a chat starts the composer docks at the bottom with a fade above it. The composer keeps every behaviour (Enter rules, modes, attachments, one-row layout only for one-line text, stacked for long text, model routing).

## 9. Area split for the remaining phases
Each area agent restyles its files with the tokens and primitives above and leaves the shell, tokens and effects alone (raise shell changes with the lead).

| Area | Scope | File globs |
| --- | --- | --- |
| (a) Marketing, docs, space, legal, shared pages | Marketing header/footer and every public page, docs, Space pages, legal, shared answers, templates, compare, guides, status, download | `src/app/(marketing)/**`, `src/app/(i18n)/**`, `src/app/(space)/**`, `src/app/s/**`, `src/app/i/**`, `src/app/changelog/**`, `src/app/templates*`, `src/components/{chrome,marketing,sections,landing,page,legal,editorial,kb,compare,developers,download,how,seo,share,templates,status,support,space,spatial,simulation,monolith,home,i18n,consent,feedback}/**`, `src/components/ui/**` (not `Button.tsx` APIs), `src/styles/{redesign,space,glass,lit,aura,light,polish,monolith-ui,ambient,field,docs-theme,mobile,motion,fit}.css` |
| (b) Inside the app beyond the shell | Create, Studio, Slides, Study, Research, Projects, All chats, Agents, Tasks/Run ledger, Approvals, Deployments, Connected apps, Growth/Command Center, settings dialogs, admin, answer cards and rich answers | `src/components/app-ui/**` except `shell/**`, `KeplarApp.tsx` layout and `App.module.css` shell rules; `src/components/{create,slides,study,growth,admin,answer,usage,loader}/**`, `src/app/app/**` views, `src/app/admin/**`, `src/components/account/AccountSettings.tsx` + `SettingsSections.tsx` (the dialog) |
| (c) Business | business.keplar.one storefront (marketing layout) and the Business workspace (rail/drawer/canvas grammar with Business destinations) | `src/app/(business)/**`, `src/app/(business-app)/**`, `src/components/{business,business-site,business-app}/**` (move `[data-kb]` tokens in `business-site/tokens.css` onto `--o-*`) |
| (d) Auth, onboarding, account, checkout, embed, errors | Sign in/up, magic link, passkeys, onboarding, account pages outside the settings dialog, billing/checkout, embeds, invite, welcome, error/404/global-error | `src/components/{auth,onboarding,account,billing,embed}/**`, `src/app/{embed,invite,welcome,bot}/**`, `src/app/{error,global-error,not-found}.tsx`, `src/components/page/NotFound*`, auth routes `src/app/(marketing)/{signin,signup,account,checkout,forgot-password,reset-password,verify-email,two-factor,secure-account}/**` (area (a) owns every other `(marketing)` route) |
