# Weekly SEO review (30 minutes)

Run every week for the first 3 months, then monthly. Record the numbers in a copy of this table; write "unknown" instead of guessing.

## 1. Pull the numbers
- Search Console → Performance, last 28 days vs previous 28: impressions, clicks, average position per page for the cluster (`/superintelligence`, `/ai-vs-agi-vs-superintelligence`, `/si-vs-ai`, `/multi-model-ai`, `/models`, `/about`). Split branded vs non-branded (`MEASUREMENT.md` §3).
- Search Console → Pages: any page not indexed? Reason?
- Bing Webmaster Tools → Search performance and Site scan.
- `/admin/seo`: landing → CTA → sign-up → first question → answer, by page and source class.

## 2. Decide (one change at a time, so cause is clear)
| Observation | Action |
|---|---|
| Impressions but few clicks on a page | Rewrite the title or description once; wait 2–4 weeks |
| Two pages show for the same query | Merge or differentiate (cannibalization); keep one intent per page |
| Page not indexed after 2–3 weeks | Add internal links from stronger pages; improve unique value; do not resubmit repeatedly |
| Clicks but no CTA clicks | Move or reword the CTA on that page |
| Query with real impressions and no page | Add one page or one section (keyword map first) |

## 3. Freshness checklist (dated facts)
- [ ] `/si-vs-ai`: has the White House / Federal Register / Congress changed anything about Executive Order 14434? The order asked for a proposed legislative definition within 60 days of 29 Sep 2026 (about late Nov 2026). Re-read the order and update the page; do not speculate.
- [ ] `/superintelligence`: re-open each cited source (access date), check for newer lab statements, the FLI statement's signatory count, and newer surveys. Update `ACCESSED` in `src/lib/content/sources.ts` only after re-opening them.
- [ ] `/ai-vs-agi-vs-superintelligence`: has Google DeepMind published a newer levels framework?
- [ ] `/models`: matches the live roster in `src/lib/orchestration/live-catalog.ts` and `src/lib/orchestration/*` (it is generated; check the wording around Free vs paid).
- [ ] Update `lastmod` in `src/lib/content/lastmod.ts` only for real content changes; the sitemap test fails if a date is in the future or missing.

## 4. Safety checks
- [ ] No page says or implies Keplar is superintelligence or AGI (test: `tests/seo-editorial.test.ts`).
- [ ] No accuracy, confidence, customer-count, rating or testimonial claims (same test).
- [ ] `/compare` is still noindex until each competitor fact is approved.

## 5. Log
Date · what changed · why · what to look at next week.
