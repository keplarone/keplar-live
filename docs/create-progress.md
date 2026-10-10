# Create: progress notes

Small steps: one change, tests, commit, deploy. Status as of Oct 4, 2026 (ET). "Deployed" means a Vercel production deploy aliased to keplar.one finished after the commit.

| # | Piece | Commit | Tested | Deployed |
|---|-------|--------|--------|----------|
| 1 | "How I read your idea" step, 3 optional directions, skippable | understand branch | unit (`understand-choices`), e2e | yes |
| 2 | Self-review against the request, one automatic fix pass (or a one-click offer) | selfreview branch | unit (`site-coverage`), 2 e2e | yes |
| 3 | Look pass: original dark #0b0b0d (not pure black), Google Sans, no blue | darkorig branch (655e588) | e2e `create-theme` (canvas color, font, luminance) | yes |
| 3b | Look pass: spacing/hierarchy and empty/loading/error states | audit only, no code change | screenshots at 1440 px dark (empty, understand, Sections, History, Style) read by eye; empty states already exist ("Nothing yet", "No preview yet"); no deeper polish done | n/a |
| 4 | Regenerate one section (More > Sections) | 67678ec | unit (`site-sections`), e2e | yes |
| 5a | Version compare (History > Compare, file by file, changed lines) | 2b44aee | unit (`site-diff`), e2e (stubbed differing files; 390 px fit) | yes |
| 5b | Picture slots list + "Make a better visual" (inline SVG/geometric art) | 5b commit | unit (`site-sections`), e2e (empty state; the click path shares the section path) | yes |

## Limits, stated plainly
- Self-review and section/slot detection are text scans of the saved files, not a design review.
- "Regenerate this section" sends a scoped change request to the normal edit path; the model is told to leave the rest alone, but that is an instruction, not a guarantee. Compare shows exactly what changed.
- Real photos: not placed into sites yet. Image generation belongs to the Images tab; its files are served from an account-only URL, so they are not embedded in published sites.
- All e2e runs use a fake model API against a local production build; nothing here was verified signed in on keplar.one.

## Real site features (founder goal, Oct 4 2026)
Published sites stay script-free. The generator writes an empty placeholder (`<div data-k-feature="booking" data-k-id="call" ...>`); the server validates every attribute (`features/catalog.ts`), expands it into real markup at serve time (`features/expand.ts`) and handles the POSTs (`/s/<slug>/_f/<feature>`, `features/handlers.ts`). Records are tenant-scoped (`sb_records`) and deleted with the site. Nothing is deployed from this work; commits are local only.

| # | Feature | Status | Tested | Notes |
|---|---------|--------|--------|-------|
| 1 | Contact/lead form | LIVE | 4 route-level tests (token, honeypot, link spam, rate limit, isolation, CRM, opt-in email) + browser e2e | Saves to Leads and CRM. Proof-of-work captcha is COMING SOON (needs a script on the page, which the sandbox forbids). |
| 2 | Newsletter/waitlist | LIVE | route-level + e2e | One row per address, CRM contact tagged. Sending newsletters is not included. |
| 3 | Bookings | LIVE | route-level (incl. simultaneous-booking race, DST math) + e2e | Free slots by days/hours/slot/time zone, 14 days ahead, 2 h notice. Owner cancel frees the slot. |
| 8 | Data tables | LIVE | route-level (public JSON read, owner-only write, isolation) + e2e | Seed rows from the generator, owner edits in More > Features. |
| P | Add-feature panel | LIVE | e2e | More > Features: honest status chips, one-click add, signups, bookings, table editor, email opt-ins. |
| - | Generator teaching + Requested vs built | LIVE | unit | Only live/beta features are offered to the model. |
| 4 | Checkout (Stripe Connect) | BETA | 5 route-level tests with a simulated Stripe client (price taken from the page not the form, qty cap, direct charge on the owner's connected account, order pending until the signed webhook marks it paid, Free plan and kill switch refuse, tenant isolation, owner panel) | Buy buttons for up to 12 products, one product per purchase (no cart yet). Test mode unless KEPLAR_STRIPE_MODE=live with live keys; Plus plan or higher. Not yet exercised against real Stripe (no Stripe keys on the build box), hence BETA. |
| 5 | Site search | LIVE | 4 route-level tests (ranking, all-words match, escaping of hostile queries, members-only and 404 pages never searched, tenant isolation, per-visitor rate limit) | GET form to /_search; results are drawn inside the site's own page. Searches page text only (not data tables or blog yet). |
| 6 | Blog/CMS | LIVE | 4 route-level tests (drafts never served, publish/edit/delete live at once, hostile title/body escaped on list, post page and search, seed posts added once, slug de-dup, validation, tenant isolation incl. cross-site post ids, members-only blog not public) | Owner writes in More > Features. Plain text with ## headings and - lists; no images or rich text yet. Posts are searchable. |
| 7 | Member login | BETA | 5 route-level tests (scrypt hashes, signed site-bound sessions, members-only page never sends its content, owner removal signs out, per-site accounts, login rate limit, same error for wrong password and unknown email) | Email + password per site. No email verification or password reset yet (nothing is emailed to members). `data-k-gate="page"` makes a whole page members-only, server-side. |
| 9 | Owner analytics | LIVE | 4 route-level tests (bots/previews/prefetch/DNT/GPC not counted, referrer host only, nothing identifying stored, daily visitor code not linkable across days, one visitor can't inflate, on/off switch, tenant isolation, views deleted with the site) | Counted server-side when a page is served: no cookies, no scripts, no IPs stored. Capped at 5,000 views per site per day (shown, not hidden). 90-day retention. Shown in More > Features. Previews and the builder are not counted. |
| 10 | Embeds (link cards) | BETA | 3 unit + 1 route-level test (host allow-lists, look-alike hosts and javascript: refused, links rebuilt from ids, hostile text escaped, no iframe/script/CSP change) | Video (YouTube/Vimeo), map (address), calendar (Calendly/Cal.com/Google) and chat (WhatsApp) cards that open the provider in a new tab. Inline players, interactive maps and live-chat widgets are COMING SOON: the site sandbox allows no frames or third-party scripts. |

Email: owner notifications and visitor booking confirmations are OFF until the owner turns them on, and the panel says when email delivery (Resend) isn't configured on the server.

### Features tab on a phone (390px), measured
Playwright at 390x844 with long emails/names/notes in signups, members and bookings (`e2e/create-features-mobile.e2e.ts`). Before: no sideways overflow (document and pane scroll width = viewport), but 20 controls were under 40px tall (Add another/Remove/Cancel booking buttons 26px, table inputs 36px, checkboxes 13px). After (`features.module.css`): buttons, inputs and selects are 44px on phones, checkboxes are 24px inside a 44px row that is tapped as one, long values wrap anywhere; measured 0 undersized targets and 0 overflowing elements. Not measured: real devices, landscape, iOS Safari.

### Known limits (honest list)
- Checkout: BETA. Never run against real Stripe from this box (no keys); covered with a simulated Stripe client. One product per purchase, no cart. Free/Lite plans can't sell.
- Members: BETA. No email verification, no password reset.
- Embeds: BETA. Link cards only; inline players, interactive maps and live chat are COMING SOON.
- Analytics counts page views the server serves; a CDN cache hit would not be counted (published HTML is no-store, so this does not apply today).
- Captcha / proof-of-work for forms: COMING SOON (needs scripts).
