# Minimal pass (Oct 7, 2026)

Owner brief: "Keep Keplar minimal and significantly easier to navigate and use." The bar is the Ask home from commit 9e32727
(greeting, four chips, one Modes menu, a floating composer). Nothing that works is removed: it is merged, tucked away or moved.

Before screenshots: `screenshots/minimal/before/` (1280x800 and 390x844; metrics in `metrics-marketing.json`, `metrics-app.json`).
After screenshots: `screenshots/minimal/after/`.

## Audit (before)

| Surface | What is there | Problem |
| --- | --- | --- |
| Marketing nav | Product menu (6), Resources menu (6), Pricing, Download, search, Sign In, Try Keplar | Docs is two clicks deep; two menus hold 12 links with hints |
| Footer | 5 columns, 39 links (Learn alone has 14) | Reads like a sitemap; SEO landing pages crowd the core pages |
| Home | Hero, then 7 chapters (Ask demo, Understand, Create, Build together, Ship, Platform, Trust) with ~30 feature rows, pricing, close. 11,800 px tall on desktop, 15,800 px on a phone | The value and the live try are buried in a feature catalog that /features already is |
| /app sidebar | New Thread, Search, Ask, Create, Projects, Agents, Business ("Optional" tag), More (8 items), Recents (collapsed by default), account chip, "Keplar Usage" card with bar and notes, Upgrade, Account & billing, theme toggle | 7 primary rows + a big usage card + 3 footer controls; past chats hidden behind a disclosure |
| /app top bar | Title, "Memory on", "50 of 50 left", Upgrade | Usage and Upgrade repeat what the sidebar shows |
| Create (empty) | Kind tabs (App, Images, Video (Beta), Mobile (Beta)), "New app" intro, prompt, Surprise me, 6 starters, a Voice panel, References, Look tiles, Build row, your apps, Showcase strip | Seven blocks before the first build; the Build button sits below the fold on phones |
| Create (studio) | 9 view tabs: Preview, Code, Changes, Live, Critic, Deploy, Look, Data, Settings | Too many equal-weight tabs |
| Settings | 17 tabs (four labeled "(beta)") | No grouping; the everyday options sit among developer tools |
| Agents / Business / Projects | One clear page each | Fine; reachable from the sidebar or More |

### Clicks for the core jobs (before)

| Job | Path | Clicks |
| --- | --- | --- |
| Ask a question | Site: Try Keplar, type. App: the composer is focused | 1 (site) / 0 (app) |
| Create an app | App: Create, type, scroll on phones, Build the app | 2 (+ a scroll on phones) |
| Find a past chat | App: Recents (closed by default), then the chat | 2 |
| Change the plan | App, free: Upgrade, pick a plan. Paid: Account & billing, Manage billing | 2 |
| Change the theme | App: sidebar theme toggle | 1 |
| Change the language | App: Account & billing, Language tab, pick | 3 |
| Get to the docs | Site: Resources, Docs. App: no link (logo, Resources, Docs) | 2 (site) / 3 (app) |

## Plan

**Marketing nav.** Four top-level items: Product (one short menu: Everything in Keplar, Live demo, Create, Teams), Docs (direct),
Pricing, Download. Then search, Sign in and one primary CTA. Resources is flattened: Docs moves up; the API, gallery, changelog,
roadmap and security pages stay in the footer and in Cmd-K. Labels reuse keys that already exist in every locale's catalog
(`nav.product`, `nav.items[href]`), so stable locales and beta fallbacks keep working without new strings.

**Footer.** Four columns (Product, Learn, Company, Legal) with the core pages only. The SEO landing pages (AI answer engine,
Compare AI models, study tool, slideshow maker, superintelligence, multi-model, glossary, prompt library, for-you) keep their URLs,
metadata, sitemap entries and internal links; they leave the footer and stay reachable from Cmd-K, /guides and the sitemap. No
redirects: none of them is a true duplicate.

**Home.** Hero (value), live demo (try), How it works (the ask, compare, answer flow and Create in one section), pricing, CTA.
Understand, Build together, Ship, Platform and Trust fold into one "Everything in Keplar" link (/features already lists every
feature with its honest status). The 3D scene, the space look and the no-scale-on-hover planet rule stay.

**/app sidebar.** Five primary rows: New chat, Search, Create, Agents, Projects (Business replaces Projects for people who said they
use Keplar for business). One "More" holds Business or Projects, Slides, Study, Deployments, Approvals and All chats. Recents shows
directly. The usage card becomes a compact account row (avatar, name, plan, a Settings gear); usage appears above it only when it
is getting low, with Upgrade. Theme and Language move into the account menu (and Settings). The account menu gets Change plan,
Settings and Help & docs.

**Top bar.** Title and Memory status only; the daily count and Upgrade show only when free usage is low.

**Create.** The empty state is one prompt with a Build button inside it and a few starter chips (like Ask). Surprise me, Voice,
References and Look move behind one "Options" control. Your apps stay below; the showcase becomes one link. In the studio,
Preview, Code and Changes stay visible; Look, Data, Live, Critic, Deploy and Settings move into a "More" menu, shown only after a
build exists. The kind switch (App, Images, Video, Mobile) stays but is quieter.

**Settings.** Five groups with plain labels: Plan & usage, General (theme, language, getting started), Personalization (how Keplar
answers, memory, specialists, family mode), Privacy & security (sign-in protection, devices, cookies, shared links, your data),
Advanced (team workspace, developer API, embed, typing, invite friends). Old deep links (#memory, #usage, #data, #team...) still
open the right group and scroll to the section.

**Everywhere.** Fewer badges ("Optional", "(beta)" in tab names), US English, one primary action per screen, back buttons where
depth exists, clear empty states. Cmd-K in the app reaches every destination: views, Settings sections, theme, language, plan,
docs and every marketing page.

## Tests

- `tests/minimal-nav.test.ts`: the marketing nav has at most four top-level items; the app sidebar has at most five primary items.
- Updated: `tests/nav.test.ts`, `tests/nav-simplified.test.ts`, `tests/create-advanced-ui.test.ts`, settings tests, affected e2e specs.

## Result (after)

Shipped in local commits 2cfa5f0, 6f61d33, efa92b5, 18f9fd3, f533625, ab399a9, 0d9a665 (plus screenshot commits), deployed to production
after each area (dpl_DAnbQDZdKmF2bsReXrsqK87wd5jF, dpl_Gtd3wyohNbQSMPBWbMWeo7W4yMGE, dpl_GhQi9KiGE6VWngyksw4fUtxocF7y, dpl_8ynE7LCooGJczjdZ3p6dgyeh6hib).
Screenshots: `screenshots/minimal/after/` (metrics-marketing.json, metrics-app.json).

### Clicks for the core jobs (before → after)

| Job | Before | After |
| --- | --- | --- |
| Ask a question | 1 on the site, 0 in the app | unchanged (1 / 0) |
| Create an app | 2, plus a scroll on phones (Build sat below the Look step) | 2: Create, then type and press Build next to the prompt; no scroll |
| Find a past chat | 2 (Recents collapsed) | 1 (Recents shown) |
| Change plan | 2 | 2 (account menu → Upgrade plan); 1 when usage is low (Upgrade shows in the sidebar) |
| Change theme | 1 (sidebar toggle) | 2 (account menu → theme), or Cmd-K "Theme", or Settings > General |
| Change language | 3 | 3 (account menu → Language → pick), or Cmd-K "Language" |
| Get to the docs | 2 on the site, 3 in the app | 1 on the site, 2 in the app (account menu → Help & docs, or Cmd-K) |

### Counts (before → after)

- Marketing nav: Product + Resources dropdowns, Pricing, Download → Product (one dropdown), Docs, Pricing, Download.
- Footer: 39 links → 21 links in four columns.
- Home: 7 chapters, 11.8k px tall (desktop) → live demo, one "Everything in Keplar" list, pricing, CTA; 7.8k px.
- App sidebar: New chat, Search, 4+ primary rows, collapsed Recents, always-on usage card, theme toggle → New chat, Search, Create, Agents,
  Projects; More; Recents open; usage only when low; account row with a Settings gear.
- Settings: 9+ tabs → five groups (Plan & usage, General, Personalization, Privacy & security, Advanced).
- Create: start screen of three numbered steps with 10 starters → one prompt with Build, 4 chips + Surprise me, Options for the rest;
  studio tabs 9 → Preview, Code, Changes + More.
- Business: 9 tabs → Overview, Orders, CRM, Inbox + More.
