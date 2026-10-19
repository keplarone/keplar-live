# SEO / GEO program: progress log

Newest first. Facts only; unfinished items are marked.

## 2026-10-19 · search intent engine (branch `claude/seo-intent-engine`, not merged, not deployed)
- Audit: 13 dimensions, 153 findings (35 High, 69 Medium, 49 Low, no Critical), with a verifier pass on seven; written up in `AUDIT-2026-10-19.md` with the status of each.
- Clusters: `src/lib/seo/clusters.ts` names 11 search-intent clusters, each with a hub, its supporting pages, its tools, its product route and its queries; `ClusterLinks` renders "Part of" and "In this topic" links on landing, blog, docs and use-case pages; the footer carries a topic row. Five new hubs (`/ai-research-assistant`, `/ai-image-generator`, `/ai-video-generator`, `/ai-writing-assistant`, `/ai-productivity`); Study and Slides hubs expanded.
- Free tools: `/tools` and ten tools (`src/lib/free-tools/registry.ts`), seven on free models through the embed ask path with 4 runs a minute and 25 a day per visitor, three fully local (citations, model explorer, study plan). `tool_run` is a funnel event.
- Reports: `content/reports/*.md` loaded by `src/lib/kb/reports.ts`, served at `/reports` and `/reports/[slug]` with `Report` structured data; a test requires the Summary, Method, Results, Limitations, Reproduce and Data sections, real data files in the repository and no duplication of a blog post. First report: the October 2026 Core evals, from `docs/core-intelligence-evals.md`.
- Programmatic infrastructure: `/sitemap-index.xml` and a sitemap registry (robots lists all of them), `src/lib/seo/quality.ts` (title and description bounds, shingle near-duplicate and metadata-collision checks, `gatePage`), template detail pages render each page's headings and first paragraphs from the snapshot.
- Public answers: content moderation on publish (code `unsafe`) and the `KEPLAR_PUBLIC_ANSWERS=off` kill switch (publishing, listing, sitemap and pages all off; private links unchanged), tested.
- Facts: web search, Business pricing, API availability and agents are now stated one way each and derived from the registries where one exists; blog search titles; 16 descriptions shortened; pricing metadata from `tiers.ts`; the duplicate guide redirects to its blog post.
- Conversion: the primary action on content pages is the no-signup chat, the cluster product route is the secondary; `PageHero` CTAs are tracked.
- Measurement: telemetry on `/`; first-touch attribution (landing path, source class, campaign) carried into checkout metadata and stored by the verified webhook, reported on `/admin/seo`; Search Console module (`src/lib/seo/gsc.ts`, service-account JWT, read-only scope) and admin section, which says "not connected" until the owner adds credentials.
- SEO QA in CI: `scripts/seo-gate.mjs` crawls the production build after `next build` in `npm run verify` and in `.github/workflows/ci.yml`; it fails on a missing title or description, a wrong length, more than one h1, a wrong canonical, a stray noindex, invalid JSON-LD, missing alt text, a thin page, a broken internal link, a missing sitemap child or a missing `llms.txt`.
- Localization: "Free tools" footer label translated in the 24 stable locales (beta locales fall back to English).
- Not done: Search Console and Bing verification and credentials (owner); CI-gated deploys (Vercel setting); font subsets, CSS split and pixel consent (design and legal decisions); beta-locale indexing; agents wording confirmation; language check and global rate cap on public answers; per-tool reporting on `/admin/seo`. No deploy from this branch: it ships through a pull request to `main` after CI.

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
