# Shape system (2026-10-04)

Founder direction: pill only when needed, wanted or recommended.

Tokens (`src/styles/glass.css`): `--shape-pill` 9999px, `--shape-control` 12px, `--shape-card` 16px.
Default: every `button`, `[role=button|tab|switch]` and `input[type=button|submit|reset]` is a rounded rectangle (`--shape-control`) at ZERO specificity (`:where`), so a component's own class decides. The old sitewide `html :where(...):not(.keep-shape){border-radius:9999px}` override is gone. Opt in to a pill with `border-radius: var(--shape-pill)` in the component class, or `.pill` / `data-shape="pill"` on the element (`data-shape="card"` for `--shape-card`).

## Still pill (declared by the component)
- Standalone CTAs: `Button` primary/secondary/quiet (hero, nav "Try Keplar / Open Keplar", Ask Keplar), auth `.btn`, account `.btn` (Upgrade, Open Keplar), growth `.tryGo`, sidebar `Upgrade`, workspace `Start`, composer `Send`, cookie banner buttons, slides/share/sign-in-gate primary and ghost buttons.
- Chips, badges, tags: `Free` plan badge, `ins-badge`, memory chip, `ws.chipBtn`, `builder.chip`, project chips.
- Segmented toggles and switches: theme control, Create Site/Images/Video/Mobile and Chat/Preview, Phone/Desktop, onboarding `.seg3`, `.switch`, auth Sign up/Log in.
- Round icon buttons (circles): composer attach and routing, hamburger and sidebar icon buttons, home Ask arrow, avatars, lightbox and share close.
- Nav links (the nav is its own pill; owned by the nav work).

## Not pill any more (rounded rectangles)
- Sidebar items: `Search`, `New Thread`, `Recents` toggle, nav rows.
- Dropdown triggers and menu rows: account chip, account menu items and Remove buttons, workspace "project list" and "back to chat" buttons.
- Tabs (and their track): Business, Study, Create tabs (inner tab radius = control - 4px so it nests).
- Knowledge-base nav links, accordion summaries, mobile menu summary and search field.
- Thread action buttons (edit, rename).
- Already rectangles via their own radius or doubled class (unchanged): home tiles, example and use-for cards, Create template, direction and import cards, product demo section buttons, growth chips, pipeline tabs.
- Settings tabs: handled by another worker in `account.module.css` (not touched here).

Check: computed radii on /, /pricing, /about, /download, /help, /signin, /account, /app, /app/create at 1440 and 390, Light and Dark; unit test `tests/shape-system.test.ts`.
