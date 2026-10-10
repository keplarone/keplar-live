# Site templates and one-click Remix (BETA)

Gallery: `/templates` (index) and `/templates/<slug>` (detail), listed in `/templates-sitemap.xml` and robots.txt. Preview at
`/sites/template/<slug>` (sandboxed iframe, never indexed; under `/sites/` because that is the prefix `next.config.ts` leaves out of the app CSP and `X-Frame-Options: DENY`). Share card at `/templates/<slug>/og`.

## What is real
- **Keplar starters** (`starter-business|portfolio|landing|restaurant`): built by `src/lib/site-builder/templates.ts`, i.e. by code,
  **not** by the AI generator. The gallery says so. `tests/templates.test.ts` verifies each one: it normalizes on the Free plan, has
  zero lint errors, passes `scanFiles`, and holds no personal data (this test found and fixed missing `<h1>` on inner pages).
- **Community templates** (labelled BETA): an owner's explicit opt-in, per site. Requires: signed in, **verified email**, a title,
  a description (20+ chars), a category, a consent checkbox, a built site, no detected personal data (email/phone/card/key/IP/street
  address, `mailto:`/`tel:` links), no members-only page, `moderateText` on the title/description, and `scanFiles` not "block".
  A "review" scan verdict puts the template in `pending` (not listed) until an admin approves it at `/admin/templates`.
- The template is a **separate snapshot row** (`sb_templates`) of the latest version at the moment of sharing, already scrubbed.
  Later edits to the site are not published; sharing again needs a withdraw first. Deleting/purging the site removes the snapshot;
  a soft-deleted or taken-down site hides it immediately; account deletion/export covers `sb_templates` (`USER_COLLECTIONS`).
- **Remix** (`POST /api/templates/<slug>/remix`): signed in; creates a new draft site in the caller's workspace (the plan's site limit
  applies), copies scrubbed files + design + effects + a reduced brief, records `remixedFrom {slug,title,credited}`, bumps the
  template's remix counter, and the page then opens Create on the copy (sessionStorage `keplar:create-site`) with a status note and a
  prompt box ("Change this template: ...").
- **Attribution is optional** and the remixer's choice (checkbox, default off): adds one "Based on the "X" template by Y on Keplar"
  line (link to the template page) to the remix's home page. The owner may show a name next to the template (blank = none).
- **Never copied**: leads (`sb_leads`), feature records (signups, bookings, members, rows, orders), analytics, chat messages, domains,
  QA results, product import and its photos (`/i/<id>` images and CSS references are removed), mood board / references / idea /
  brand notes / content notes from the brief, embed targets (`data-k-src|phone|address`), `mailto:`/`tel:` links. Feature placeholders
  are kept as empty `<div data-k-feature>`; they are wired to the remixer's own site at render time. Tests assert all of this
  (including that the owner's lead is untouched and the new site has none).
- **Moderation**: every template page has "Report this template" (`/api/report`, `answerId = template:<slug>`, shown in
  `/admin/inbox` with a link); admins hide/restore/approve at `/admin/templates` (`PATCH /api/templates`). Hidden/pending/withdrawn
  templates 404 on the page, preview, OG and sitemap at once.
- **Per-plan limits** (`TEMPLATE_LIMITS`): templates listed at once free 1 / lite 2 / plus 5 / pro 10 / business 25; remixes per
  rolling day 3 / 8 / 20 / 40 / 100; plus the plan's site limit (`entitlements.projects`) and page/byte limits on the copy; API rate limits.
- **SEO**: server-rendered pages, `pageMeta`, canonical, JSON-LD (CollectionPage + ItemList; WebPage + breadcrumbs), OG image, sitemap
  with real `lastmod` for community templates. The index stays indexable (it always has the four starters).

## BETA / pending
- Community templates are BETA: moderation is manual and there are no community templates until owners share some.
- **Not done: AI-generator-built showcase templates.** The brief asks for first-party templates built with the generator and
  verified. That needs live model calls (a build costs credits and needs provider keys) and a human visual review, which were not run
  here; the gallery lists only what is real (code-built starters) and does not claim otherwise. Pending: generate 6-10 showcase
  sites with the real generator, review them, then add them as first-party rows.
- Thumbnails/previews are live sandboxed renders, not stored screenshots (an image per template would be better for search).
- No ratings, tags search or categories filter yet; no notification to the owner when a template is hidden (they see "hidden" in Projects).
