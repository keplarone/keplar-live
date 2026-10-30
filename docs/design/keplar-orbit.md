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
