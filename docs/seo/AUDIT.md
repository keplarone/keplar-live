# SEO / GEO audit: before and after

Date: 3 Oct 2026. "Observed" = measured in this audit (crawl of https://keplar.one, Lighthouse on a local production build). "Assumption" = reasoned, not measured. Search rankings, traffic and field performance were **not** available (no Search Console data) and are not claimed.

## Before (production, observed)

| Area | Finding | Severity |
|---|---|---|
| Sitemap | 27 URLs, **every `lastmod` identical** (build time). Search engines learn to ignore dates that are always "now". | High |
| robots.txt vs noindex | `/app`, `/signin`, `/account`, `/checkout` were disallowed in robots.txt **and** marked noindex. A blocked page cannot be crawled, so its noindex is never seen; the bare URL can still be listed. | High |
| Topic coverage | No page for the superintelligence topic, no about/entity page, no model-roster page, no `llms.txt`. | High (the new priority) |
| Share images | `/product`, `/how-it-works`, `/for-you`, `/download`, `/agents`, `/enterprise`, `/inquire`, `/privacy`, `/terms`, `/guides` had **no `og:image`/`twitter:image`** (page-level metadata replaced the site default). | Medium |
| Descriptions | Over-long: home 203, product 239, how-it-works 237 characters (cut off in results). Thin: privacy 29, terms 41. | Medium |
| Structured data | `FAQPage` emitted **twice** on `/how-it-works`. Organization had no founders. | Medium |
| Copy accuracy | Marketing copy said "confidence shown" in five content files. Keplar shows a **Consensus agreement level**, not a confidence or accuracy score. | High (trust / policy) |
| `/compare` | Correctly noindex and out of the sitemap (competitor claims unverified). Left as is. | OK |
| Rendering | Home HTML contains ~1,867 words server-rendered (not JS-dependent). `/app` is client-rendered (5 words) and noindex by design. | OK |
| Status codes | `/welcome`, `/account` → 307 `/signin`; `/checkout` → 307 `/pricing`; unknown URL → real 404. | OK |
| Performance (lab, local prod build, software WebGL, throttled mobile) | Home mobile **63** (LCP 3.4 s, TBT 2,170 ms, CLS 0); home desktop 98; `/pricing` mobile 97; `/how-it-works` 93; `/ai-answer-engine` 93; guide 95; accessibility 100 on all. | Medium |

## After (this change set; local production build unless noted)

| Area | Change | Result |
|---|---|---|
| Sitemap | 33 URLs, **real per-page `lastmod`** from `src/lib/content/lastmod.ts` (5 distinct dates today), no changefreq/priority (Google ignores them). Test fails on a missing or future date. | crawl: 33 URLs |
| robots / noindex | robots.txt now allows `/` and blocks only `/api/` and `/dev/`. Private pages keep `noindex` in HTML **and** an `X-Robots-Tag: noindex` header (sent on the keplar.one host for `/app`, `/signin`, `/signup`, `/welcome`, `/account`, `/checkout`, `/forgot-password`, `/reset-password`, `/verify-email`, `/admin`, `/compare`). | Verified with `Host: keplar.one` against the build |
| New pages (6) | `/superintelligence` (pillar, 2,651 words), `/ai-vs-agi-vs-superintelligence`, `/si-vs-ai`, `/multi-model-ai`, `/models`, `/about`. Each has one H1, unique title/description, canonical, its own share image, answer-first summary, dated sources with access date, FAQ, internal links, a try-Keplar CTA. | 200, canonical self-referencing |
| Internal links | "Go deeper" cards on home, `/product`, `/how-it-works`; footer Learn/Company links; editorial pages cross-link by intent. | Crawl: links per page 24–26 |
| Structured data | Organization (founders named, founded 2026) · WebSite · WebPage · BreadcrumbList · FAQPage (visible FAQ only) · **Article with `citation`** (explainer pages only, not `/about` or `/models`) · **DefinedTerm** (`/superintelligence`, `/si-vs-ai`). Duplicate FAQPage removed. 0 invalid JSON-LD blocks in the crawl. | See "Eligibility notes" below |
| Share images | Pages with their own image keep it; all other pages now get the site default. `tests/seo-meta.test.ts` keeps the list in step with the files. | `og:image` and `twitter:image` present on every crawled page |
| Descriptions | Home/product/how-it-works shortened (≤170); privacy/terms expanded. | Tests enforce lengths on editorial pages |
| Accuracy | "confidence" removed from marketing copy; the test blocks it on new pages; Consensus = agreement, not accuracy, stated in the copy. | |
| GEO | `/llms.txt` generated from the content files (optional convention; not a ranking factor). Answer-first summaries, tables, dated primary sources, a clear "Keplar is not superintelligence" statement. | `/llms.txt` 200 |
| Measurement | Consent-gated first-party funnel (landing page → CTA → sign-up → first question → answer), `/admin/seo`, 180-day retention, privacy text updated. See `MEASUREMENT.md`. | Browser-tested for the first three steps |
| IndexNow | Key file + `scripts/indexnow.mjs`. Not yet submitted (key must be live first). | Pending deploy |
| Performance | New pages: mobile 93–97, desktop 100, accessibility 100, CLS 0, best practices 100 (lab). Home: see below. | |

### Home page performance: honest reading
Lab home mobile scores in three further runs were **58, 71, 79** (baseline run: 63). TBT ranged 210 ms – 142 s. The software-WebGL renderer in the test browser stalls unpredictably, and the LCP element on a fresh profile is the cookie banner text, so these numbers cannot show a real-device change in either direction. In the baseline trace, script evaluation was only ~1.3 s of ~13 s main-thread time; most of the rest was "Other" (software rasterisation). **No change was made to the particle field**: the design rules say it must stay on for capable devices, another executor has uncommitted edits in `src/field/*`, and there is no real-GPU or field data to justify a change. Next step: look at Speed Insights/CrUX once there is traffic, and a hand test on a mid-range phone.

### Eligibility notes (what markup does and does not do)
- **FAQPage:** valid markup, matches visible content, but Google limits FAQ rich results to well-known government and health sites (change announced Sept 2023). Expect no rich result for Keplar; it still helps machines read the page.
- **DefinedTerm:** a valid schema.org type; Google shows no rich result for it. Used only on the two pages that define a term.
- **Article:** used for sourced explainers only. Not claimed for product pages.
- **`llms.txt`:** an optional proposal; no search engine has said it uses it.
- **Sitemap `lastmod`:** helps only if it is trustworthy, which is why it is the content date.

## Still open (not done, with reasons)
1. Search Console and Bing Webmaster Tools verification, sitemap submission (owner action; see `MEASUREMENT.md`).
2. `/compare` stays noindex until each competitor claim is approved from the competitor's own page.
3. Home mobile performance: needs real-device data (above).
4. A `/chatgpt-vs-claude-vs-gemini` page was not built: it needs competitor facts taken from each company's own pages with access dates; it would also add a competing intent to the cluster without evidence of demand.
5. The "interactive explainer" idea was not built; the three demo scripts in `CAMPAIGN.md` cover the demonstration need without adding unverified output to the site.
6. `/si-vs-ai` must be re-read around late November 2026 (executive order's 60-day legislative-definition step).
7. Real sign-up and answer events were not exercised end to end (need an account and live model keys).

---

## How the big AI sites do SEO, and what we copied or improved (read 3 Oct 2026 by fetching their public sitemaps and pages)
| Site | Observed | What we took | What we did differently |
|---|---|---|---|
| OpenAI | Sitemap index split by content type (about 45 sections: product, API, learn guides, "use cases" and prompt/template libraries, research, safety, startups, webinars). The pricing page links use-case pages. `help.openai.com` has no sitemap.xml. | Separate content types; a prompt library; use-case pages linked from pricing and product pages. | One sitemap with a **real** `lastmod` per URL (derived from each file's own date), JSON-LD on every page, and a glossary and docs in the same system. |
| Anthropic | Single sitemap with `lastmod` per URL. Pricing page emits FAQPage, Organization, WebSite and Brand JSON-LD. `support.claude.com` is a large help center (about 9 MB sitemap with hreflang) with Article and BreadcrumbList JSON-LD. | Visible FAQ matched by FAQPage; breadcrumbs everywhere; a help-center-style docs section. | Docs have search, a left tree, an on-this-page list and previous/next, all server-rendered. |
| Perplexity | Sitemap index (marketing, API platform, enterprise, hub); docs sitemap with `lastmod` and WebSite/WebPage/BreadcrumbList; `hub/blog` and `hub/use-cases`. | Blog plus use cases plus docs as three hubs. | Every blog post ends with how Keplar handles the question, including what it does not do. |
| Google Gemini | Sitemap index of four files. | n/a | n/a |

Common pattern: **docs/help center + blog + use cases + pricing/model pages + glossary/templates, linked to each other.** We built all of those, plus a link-checker test so no page is orphaned.

## Knowledge-base expansion (3 Oct 2026): what shipped and how it is guarded
- Content lives in `content/**/*.md` (front matter + a small Markdown subset) and in typed data files (`src/lib/kb/glossary.ts`, `prompts.ts`, `vs.ts`). Pages are statically generated; client JavaScript is limited to copy buttons, docs search and the on-this-page scroll-spy.
- Numbers that can change (prices, credits, rolling limits) are not typed into articles; content uses tokens such as `{{price:plus}}` that resolve from the product's own plan data at build time.
- `tests/kb-content.test.ts` checks: scale targets (60+ docs, 20+ posts, 50+ glossary terms, 40+ prompts), unique titles and descriptions, blog posts of 800+ words that end with a Keplar section, banned claims (no confidence or accuracy score, no source-checking claim, no testimonials, no unexplained percentages), US spelling, near-duplicate content, internal links resolve, no orphan pages, sitemap membership and `lastmod`, JSON-LD shape and match with visible text, comparison-page rules, one H1 per page, no blue, and a client-code budget.
- **Open risks:** (1) `/vs/*` pages quote competitor pages as read on 3 Oct 2026. Plans change; the owner must decide whether to keep them indexable. (2) `/vs/perplexity` stays noindex because Perplexity's "Model Council" overlaps directly with Keplar's main idea and its help center could not be fetched directly. (3) No search-volume data exists for any keyword. (4) The blog's third-party figures (Google Trends, Resourcera, cleanor.app) are cited as such and are not Keplar data.
