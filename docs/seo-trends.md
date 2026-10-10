# SEO trend tracker

A daily job that reads Google Trends, picks AI topics people are searching for, and (only when the founders switch it on) publishes a short, honest explainer page for each one at `/topics/<slug>`.
It cannot publish anything by default. Auto-publish is **off**; held pages wait for a human.

## What it does, in order
1. **Collect** (daily, inside `/api/cron/learning`, which already runs at 04:37 UTC; the Hobby plan allows only two crons, so it rides on that one):
   - Google Trends "Trending now" public RSS feed (`trends.google.com/trending/rss?geo=US`).
   - Related queries (top and rising, US, past 3 months) for three seeds per day, rotating through the list in `src/lib/trends/sources.ts`. The related-queries call uses Google's unofficial endpoint (the one the Trends website uses and `pytrends` wraps). It can change or rate-limit without notice; the job logs the error and carries on.
2. **Screen** (`screenQuery`): the query must contain an AI term. It is rejected if it names a brand (we have not cleared any brand for mention), politics or elections, adult or violent content, self-harm, weapons, drugs, hate, scams or exploits, medical or legal advice, finance or crypto, consciousness or "is it alive" questions, or claim-bait such as "best AI", "vs", "better than", "accuracy". Data for all of these is dropped, not stored.
3. **Match**: the query must map to a term in Keplar's reviewed glossary (`src/lib/kb/glossary.ts`). No glossary term, no page. This is what keeps the content grounded: the page text is the glossary definition plus fixed "how to check claims" guidance plus links to our own docs and blog. **A language model writes nothing.**
4. **Coverage**: if an existing page already owns that term (by title or keyword), nothing is built. Example: hallucination, superintelligence, AGI and context windows are already covered, so they are skipped.
5. **Quality gates** (`runGates`, all must pass; failures are logged with the reason):
   - at least 260 words, and at least 35 words of page-specific substance (definition plus the Keplar note); boilerplate and link lists do not count towards that second bar
   - at least 2 links into the Keplar library
   - title ≤ 70 characters, description 60 to 175 characters
   - slug not already used
   - no banned claims (superintelligence/AGI claims about Keplar, percentage accuracy or speed claims, "most accurate", "the best AI", "outperforms", "beats <brand>", "confidence score")
   - duplicate check: under 60% of its 5-word sequences may already appear in an existing page
6. **Publish or hold**: with auto-publish on, a passing page is published if fewer than the daily cap (default 3) have gone out today and fewer than the live cap (default 40) are live. Otherwise it is held. With auto-publish off (the default) every passing page is held.
7. **Announce** (published pages only): added to `topics-sitemap.xml` (listed in robots.txt), and the new URLs are submitted to IndexNow (which feeds Bing and others) from the same job. A failed ping is logged and does not undo the publish.
8. **Log**: every run, setting change, approval and rollback is written to the review log (collection `trend_log`) with who and when.

## What a page says
- The term, in plain English, from the glossary. How Keplar relates to it, where the glossary says so.
- A dated "Why this page exists" note naming the source, for example: *a search for "…" appeared in Google's Trending now list on 2026-10-04*. For related queries it says Google reports relative change, not a count. **No search volume of ours is ever shown.**
- Four ways to check claims about the term, and links to our docs and blog.
- A FAQ that states Keplar is not AGI or superintelligence. A line says the page was assembled from the glossary and library and not written by a model.
- JSON-LD: Article, FAQPage and BreadcrumbList. Self-canonical. OG image at `/topics/<slug>/og`. No accuracy claims, no comparisons, no brand names.

## Admin controls (`/admin/trends`, admin sign-in only; 404 for everyone else)
- **Kill switch (paused)**: nothing is collected or built, every `/topics/*` page returns 404 and leaves the sitemap immediately. Un-pausing brings published pages back.
- **Auto-publish**: off by default. Turn on only after you have read the first held pages.
- **Limits**: pages per day (default 3), live pages in total (default 40).
- **Held pages**: read the page, then Approve (goes live, sitemap, IndexNow) or leave it.
- **Rollback** a single page, or **roll back all**. Rollback is final: the tracker never republishes a rolled-back topic.
- **Run now** and the review log (last runs, what was rejected and why).

## Honest limits
- Yield is deliberately thin. Most glossary definitions are short, so the 35-word substance gate rejects them; only 8 of the roughly 35 uncovered glossary terms pass today (AI, Benchmark, Chain of thought, Dissent, Judge model, Latency, Open-weight model, Web grounding) (the rest would need a human-written page, which is the right outcome). If you want more pages, write longer glossary entries; do not lower the gate to make numbers.
- Trends rising lists are noisy; the screen discards most of them. Trending-now items are rarely AI-related (the 4 Oct 2026 feed had none).
- The related-queries endpoint is unofficial and may break. Fallback is the RSS feed only, which still works.
- `/topics` pages are new, thin by nature and unproven in search. Nothing here predicts rankings. Measure in Search Console after verification before turning auto-publish up.
- Nothing is posted anywhere. Only our own site and IndexNow are touched.

## Files
`src/lib/trends/{logic,sources,store,run}.ts`; pages `src/app/(marketing)/topics/**`; sitemap `src/app/topics-sitemap.xml/route.ts`; admin `src/app/admin/trends`, `src/app/api/admin/trends/route.ts`; tests `tests/trends.test.ts`. Data classes are listed in `src/lib/privacy/account-data.ts` (system data, no personal information).
