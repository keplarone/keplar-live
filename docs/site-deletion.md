# Deleting a Create site

Owner-only, undoable for a few seconds, hidden from the public at once, purged after.

## Flow

| Step | Call | What happens |
|---|---|---|
| Ask | `GET /api/sites/:id/removal` | Real counts (versions, form messages, product images, custom domains, library images) and anything that blocks deletion. Copy comes from `src/lib/site-builder/deletion-copy.ts`, the same text the dialog shows. |
| Delete | `DELETE /api/sites/:id` | **Soft delete.** `deletedAt` / `purgeAfter` (now + 10 min) are set. The site disappears from the list and every owner API (404), `/s/<slug>` and its sub-paths (page, `sitemap.xml`, `robots.txt`, `_lead`, `_report`) answer **410** with `no-store`, the draft preview is 404, a custom domain stops serving (404 at the edge), product images turn private, and the public paths are passed to `revalidatePath`. Nothing is destroyed. |
| Undo | `POST /api/sites/:id/restore` | Clears the soft delete while `purgeAfter` has not passed (410 afterwards). Refused with 409 if the plan's site limit was refilled meanwhile. |
| Finalize | `DELETE /api/sites/:id?purge=1` | Called by the screen when the 6 s undo window ends (and on `pagehide` with `keepalive`). Removes the data for good. |
| Backstop | `purgeDueSites()` | Runs in the daily domains cron and, for the caller's own workspace, on every `GET /api/sites`. Finalizes anything whose `purgeAfter` passed (closed tab, failed finalize). |

The UI (`src/components/create/delete/`) reuses the chat-deletion undo window (`UNDO_MS`, `UndoToast`). Entry points: a trash button on each project in the Create rail, **Delete site…** in the Publish tab, and **Delete** on each card of the Projects page. Deleting the open site switches to the next site or to the empty "What are we building?" screen; Undo reopens it.

## Enforcement

- Signed in, workspace-scoped lookups (someone else's site is a plain 404), same-origin check (`assertSameOrigin`, on top of the proxy's), stale-tab guard (`x-keplar-account`), rate limits per workspace (30 deletes/min, 30 restores/min).
- Blocked with a clear message (409): a site taken down for abuse (kept for review), and a Business checkout in `pending` state for this site in the last 24 h. Paid orders never block and are never deleted.

## Deleted vs retained

**Deleted at purge:** site row, every version (draft and published files), form messages (`sb_leads`), Screen Library screenshots (`sb_shots`), uploaded/imported product images (`sb_assets` + stored image bytes, unless a duplicate still uses the same image), the custom-domain connection (detached from Vercel first; the domain row is removed after it).

**Retained:** images made in the Images tab (they stay in the library; only their "used in this site" link is dropped, and an image no site uses any more stops being public), abuse-report records, all Business OS data (orders, customers, CRM), billing and usage records.

**Address:** `/s/<slug>` is held for the previous workspace for 30 days (`sb_slug_holds`); nobody else can create or rename onto it, the owner can reuse it, and it answers 410 meanwhile. Reserved system words stay reserved.

**Custom domains:** the connection is kept during the undo window so Undo restores it; purge calls Vercel's remove-domain API. If Vercel refuses, the purge fails (502), the site stays hidden, and the sweep or the next finalize retries. A domain is never left attached at the host without an owner row.

**Commerce:** Create (site builder) sites have no checkout, Stripe Connect or orders; Buy buttons link out. Business OS commerce belongs to the older project system, not these sites. The `open_orders` blocker only guards a pending checkout that points at a site id.

## Caching

Live HTML and CSS were served with `s-maxage=60, stale-while-revalidate=300`; the origin answers 410 the instant the site is soft-deleted, and `revalidatePath` is requested for the home page, each page, `sitemap.xml`, `robots.txt` and `_thanks`. Whether the CDN copy is dropped at once depends on the platform honoring `revalidatePath` for route handlers; the worst case is the stale window above. There is no platform-wide sitemap that lists Create sites.
