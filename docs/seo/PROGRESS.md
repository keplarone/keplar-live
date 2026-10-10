# SEO / GEO program: progress log

Newest first. Facts only; unfinished items are marked.

## 2026-10-03 · knowledge base deployed
- Commits 1177ebd and 16758d9 deployed to production (`keplar-9xyxf8eku`, aliased to keplar.one). Live crawl of 128 knowledge-base URLs from the sitemap: all 200, one canonical matching the URL, one H1, valid JSON-LD, share image present and serving (120 distinct images). Sitemap has 162 URLs, all with `lastmod`. `/vs/perplexity` is noindex and not in the sitemap. IndexNow: 162 URLs accepted (HTTP 200).
- Not done: Search Console / Bing verification, comparison approval, Lighthouse on live pages.

## 2026-10-03 · knowledge base: docs, blog, glossary, prompt library, use cases, comparisons
- Built (content lives in `content/**/*.md`, loaded by `src/lib/kb/*`, rendered statically): **69 docs pages** in 9 sections (`/docs`, left nav tree, search, on-this-page TOC, prev/next, copy buttons), **24 blog posts** (`/blog`, each 800+ words and ending with how Keplar approaches the question), **66 glossary terms** (`/glossary`), **48 prompts in 6 categories** (`/prompts`), **10 use-case pages** (`/use-cases`), and `/vs/*` comparisons.
- Prices, credits and window limits in the content come from `plans.ts` / `tiers.ts` through `{{price:plan}}`-style tokens, so they cannot drift from the product.
- Comparisons: `/vs/chatgpt`, `/vs/claude`, `/vs/gemini` are feature-only, dated, and marked approved in `src/lib/kb/vs.ts` (**owner should review before indexing is relied on**). `/vs/perplexity` is `approved: false`: noindex, not in the sitemap, not in the hub. Existing `/compare` stays noindex.
- Share images: docs, blog, use cases and prompt categories use static route handlers under `src/app/og/*` (Next cannot do file-based OG images under a catch-all segment, and hashed file-based URLs cannot be referenced from JSON-LD).
- Sitemap and `llms.txt` now include every KB page with truthful `lastmod` (newest `updated` front-matter date), via `src/lib/kb/paths.ts`.
- Tests: `tests/kb-content.test.ts` (counts, unique titles/descriptions, word counts, banned phrases and unsupported claims, US spelling, duplicate-content check, internal link checker, sitemap, JSON-LD validation, one H1, JS budget, no blue). Full suite plus `tsc` and eslint clean; production build OK.
- Not done: Search Console / Bing verification (owner), approving comparisons, IndexNow submission after deploy.

## 2026-10-03 · deployed
- Commit 9afa084 deployed to production (`keplar-9y49564c3`, aliased to keplar.one). Live checks passed. IndexNow submission of 34 URLs returned HTTP 202.
- Not done: Search Console / Bing verification (owner), `/compare` approval, real-device home performance check.

## 2026-10-03 · priority change: "superintelligence (SI)" becomes the primary target
- Research: primary sources opened and dated (Bostrom 2014 and 2009, Google DeepMind Levels of AGI, IBM, OpenAI, Meta, Microsoft AI, SSI, FLI, AI Impacts survey, Mixture-of-Agents, Executive Order 14434 and its Federal Register notice). SERP leaders recorded per query (no volume data exists).
- Built: `/superintelligence` (pillar), `/ai-vs-agi-vs-superintelligence`, `/si-vs-ai`, `/multi-model-ai`, plus `/models` and `/about`, all from `src/lib/content/*` with a shared template, `src/lib/content/sources.ts` (every citation has a source, publication date and the 3 Oct 2026 access date), per-page share images, JSON-LD (WebPage, Article with citation, BreadcrumbList, FAQPage, DefinedTerm only on the two term pages).
- Positioning: Keplar is stated as **not** superintelligence/AGI on each page; tagline kept; step-toward framing only in the "combining intelligences" sense. Test enforces the statement and bans "confidence/accuracy" claims.
- Internal links: "Go deeper" cards on home, `/product`, `/how-it-works`; footer; cross-links between the cluster pages.
- Technical: truthful per-page sitemap `lastmod`; robots.txt no longer blocks noindex pages; `X-Robots-Tag: noindex` header for private routes; default share images restored on pages that lost them; FAQPage de-duplicated; descriptions fixed; "confidence" wording removed from marketing copy; `/for-developers` (added by the growth work) now in the sitemap and `llms.txt`.
- Measurement: consent-gated landing-page funnel (`src/lib/seo/events.ts`, `src/lib/seo-events.ts`, `/api/seo/event`, `/admin/seo`), privacy text and banner updated, 180-day retention.
- IndexNow key file and script (`scripts/indexnow.mjs`).
- Docs: `AUDIT.md`, `KEYWORDS.md`, `keywords.csv`, `CAMPAIGN.md` (drafts only), `MEASUREMENT.md`, `WEEKLY-REVIEW.md`.
- Tests: 611/611 pass (new: `seo-editorial`, `seo-events`, `seo-indexable`, `seo-meta`); `tsc` and eslint clean; production build OK; local crawl of 34 sitemap URLs: no JSON-LD errors, canonicals correct.
- Not done / limits: see `AUDIT.md` "Still open". `/for-developers` (growth executor's page) has a 72-character title and a 191-character description, both longer than search results usually show; left for its owner to shorten.

## Earlier today
- Baseline crawl and Lighthouse captured (`AUDIT.md` "Before").
