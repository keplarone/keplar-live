# Search Intent Domination Engine — Audit

**Date:** 2026-10-17
**Repository:** `keplarone/keplar-live` (this checkout; production site for keplar.one)
**HEAD at audit:** `c000070` (`Merge pull request #14`)
**Method:** Read-only pass over routes, metadata, sitemaps, robots, structured data, content libraries, programmatic publishers, measurement, and CI. A prior checkpoint (written against `keplar-main`, which is not this product) was re-checked here before any finding was kept. Nothing below is a traffic, ranking, index-coverage, or search-volume claim.

Severity: **Critical** blocks indexing, leaks private data, or misstates the product to machines. **High** misstates the product on pages machines read, or lets an unapproved page be indexed. **Medium** is a quality or scale risk. **Low** is polish or an intentional exception.

## Executive summary

Keplar already has a real SEO layer: `pageMeta`, four XML sitemaps, robots rules for search and AI crawlers, Organization / SoftwareApplication / Breadcrumb / FAQ / Article schema, 111 markdown files plus glossary, prompts, comparisons and landings, a consent-gated funnel, IndexNow, and SEO unit tests that run in CI. This program builds on that. It does not replace it.

The verified defects that machines would repeat are factual, not architectural. The glossary still said Keplar has no public API, while the developers doc, `/api/v1/ask`, product facts, and Organization schema describe a beta API. Product facts and the home FAQ described consensus as an agreement percentage, while the answer UI and the consensus doc show counts. Product facts said in-app web search was not switched on, while Live Research is a beta desktop feature. `/vs/perplexity` is a static, indexable page whose own hold note says the owner should review it before it is indexed. There is no sitemap index; the four existing sitemap URLs are stable and correct for today's footprint, and an index is what a larger footprint needs. Comparison and product-overview URLs overlap in topic but are not copies of one page, so they stay indexable. Topics, templates, and public answers already have quality, consent, and kill-switch rules. Search Console is not connected. Live crawl, Lighthouse, and axe scripts exist and are not CI steps; the SEO unit tests are.

## Critical

None. No indexable page was found serving private share content, and preview hosts already send `noindex`. The checkpoint's "wrong repository" note is closed by doing this work in `keplar-live`.

## High

| ID | Finding | Files | Recommendation |
|---|---|---|---|
| H1 | **Public-API facts disagreed.** Glossary `inKeplar` said Keplar "does not currently offer a public, documented API with keys." `content/docs/reference/developers-and-api.md` says "A beta public API" and documents `POST /api/v1/ask`. `src/app/api/v1/` serves `ask`, `usage`, and `openapi.json`. `WHAT_IS_KEPLAR`, Organization schema, and `/llms.txt` say a public API exists. `docs/seo-growth-plan.md` still quoted the old "no public API" sentence. | `src/lib/kb/glossary.ts`, `content/docs/reference/developers-and-api.md`, `src/lib/content/product-facts.ts`, `src/lib/structuredData.ts`, `docs/seo-growth-plan.md` | Make the glossary and the growth-plan note match the doc and the routes. Add a test that the four stay in agreement. |
| H2 | **Unapproved comparison is indexable.** `/vs/perplexity` has `approved: false` and `holdReason` "Owner should review before it is indexed." It is omitted from the sitemap and the `/vs` hub, but `generateStaticParams` still builds it and `pageMeta` did not set `noindex`. The file comment said these pages "are still indexable." | `src/lib/kb/vs.ts`, `src/app/(marketing)/vs/[slug]/page.tsx` | `noindex` until `approved` is true. Keep it out of the sitemap. |
| H3 | **Consensus was described as a percentage.** Answer UI: "Counts, never a percentage" (`KeplarTurn.tsx`). Docs: "Counts, not a percentage." Product facts, `src/lib/faq.ts`, and `/how-it-works` said "agreement percentage." | `src/lib/content/product-facts.ts`, `src/lib/faq.ts`, `src/app/(marketing)/how-it-works/page.tsx`, `src/components/app-ui/KeplarTurn.tsx` | Describe counts ("4 of 5"), and say it is not a percentage of correctness. |
| H4 | **Web search status disagreed.** Product facts: "Live web search inside answers. Shown in the app but not switched on yet" (`status: "soon"`). Feature registry `live-research` is `beta`: "In the desktop app, Keplar searches the web…" Plan copy says web search is the desktop Live Research beta. | `src/lib/content/product-facts.ts`, `src/lib/features.ts` | Point the fact at `live-research` and say browser answers do not search the web. |

## Medium

| ID | Finding | Files | Recommendation |
|---|---|---|---|
| M1 | **No sitemap index.** `src/app/sitemap.ts` emits one urlset. Three more urlsets live at `/answers-sitemap.xml`, `/templates-sitemap.xml`, `/topics-sitemap.xml`. `robots.ts` listed those four URLs. `src/lib/sitemap-xml.ts` only builds `<urlset>`. A sitemap protocol index (`<sitemapindex>`) is what keeps a larger collection inside the 50,000 URL / 50 MB file limits. Today's list is far under that cap, so this is a scale gap, not a current crawl failure. | `src/app/sitemap.ts`, `src/app/robots.ts`, `src/lib/sitemap-xml.ts` | Add `/sitemap-index.xml` that lists the existing files. Keep those URLs. Shard only when a collection crosses the cap. |
| M2 | **Comparison intents span three families.** Indexable: `/compare` and three competitor pages, `/vs` plus ChatGPT, Claude, and Gemini, `/compare-ai-models`, `/multi-model-ai`, and the blog post "ChatGPT vs Claude vs Gemini vs Perplexity…". They answer related queries with different titles and H1s. There is no single cluster record that says which URL owns which intent. | `src/lib/compare.ts`, `src/lib/kb/vs.ts`, `src/lib/content/landing.ts`, `content/blog/` | One cluster registry, one hub per intent, cross-links. Do not redirect pages that are not copies. |
| M3 | **Six product-overview URLs, distinct copy.** `/product`, `/what-is-keplar`, `/keplar-one`, `/features`, `/how-it-works`, `/for-you` are all indexable, self-canonical, and in the sitemap. Titles and H1s differ (measured in source). `/docs/get-started/what-is-keplar` is a seventh "what is Keplar?" URL with its own docs title. `paletteOnlyPages` says `/product` and `/for-you` are not duplicates. | Those pages, `src/lib/site.ts` | Keep them. Assign each an intent in the cluster registry and cross-link. Do not noindex a page that has its own H1. |
| M4 | **`/for-developers` title and description were long.** Rendered title was `metaTitle` plus ` · Keplar` = 72 characters. Description was 191 characters. The landing/guide test (`tests/seo.test.ts`) caps titles at 62 and descriptions at 175, and this page is not in `landingPages`, so the test did not see it. | `src/lib/growth/developers-page.ts` | Shorten the meta title and description. Leave the H1. |
| M5 | **Topics are assembled and can be indexed.** `/topics/[slug]` says it is assembled from the glossary and library, emits Article and FAQ schema, and is indexable when published. Gates in `src/lib/trends/logic.ts`: 260 words, 35 own words, 2 library links, description 60–175, 5-word shingle overlap under 0.6, banned-claim check. Defaults: `autoPublish: false`, `maxPerDay: 3`, `maxLive: 40`, kill switch `paused`. A passing page is held, not published, until auto-publish is on. Whether any row is live is store data, not in git. | `src/lib/trends/*`, `src/app/(marketing)/topics/[slug]/page.tsx` | Keep the gates and the kill switch. Share one quality module with later programmatic templates. Do not noindex a page that already passed the gate. |
| M6 | **Near-duplicate explainers, already cross-linked.** Blog "Why different AI models give different answers…" and guide "Why AI models disagree…". Blog "What is multi-model AI?" and editorial `/multi-model-ai` (`related` points at the editorial). Study and slides each have a landing, a guide, and a use case. | `content/blog/`, `src/lib/content/guides.ts`, `src/lib/content/editorial.ts` | Leave the pages. The cluster registry should name the intent of each so a new page cannot repeat it. |
| M7 | **SEO scripts are not CI steps.** CI (`.github/workflows/ci.yml`) runs unit tests, which include `tests/seo*.test.ts`, `sitemap-xml`, `robots`, `kb-content`, and related files. `scripts/seo-crawl.mjs`, `scripts/lh-mobile.mjs`, `scripts/axe-audit.mjs`, and `scripts/indexnow.mjs` are not invoked by `scripts/verify.mjs` or CI. A live crawl needs a running server. | `scripts/verify.mjs`, `.github/workflows/ci.yml` | Add unit checks that fail CI for index directives, sitemap consistency, duplicate metadata, schema-vs-visible-text, and tool safety. Leave the live crawl as a manual script. |
| M8 | **No Search Console client.** `/admin/seo` says impressions, clicks, queries, and rankings live in Search Console and Bing, and that Keplar cannot see them. Verification meta tags render only when `GOOGLE_SITE_VERIFICATION` or `BING_SITE_VERIFICATION` (or the `NEXT_PUBLIC_` names) are set. First-party events cover landing view through subscription. Vercel Analytics and Speed Insights load only after consent, on marketing pages. | `src/app/admin/seo`, `src/lib/seo/events.ts`, `src/app/layout.tsx` | A client that returns "not configured" when credentials are missing, and real rows only when a call succeeds. Never fill the admin page with sample numbers. |
| M9 | **No dedicated free-tool routes.** Anonymous Ask exists (`allowAnonymous` on `/api/keplar`) and the Free plan is hard-limited to $0 OpenRouter `:free` models (`src/lib/orchestration/free-guard.ts`). Study and slides require a signed-in workspace. Slides require Plus. There is no prompt optimizer, citation formatter, or tool landing under `/tools`. | `src/lib/orchestration/free-guard.ts`, `src/lib/tools/models.ts`, `src/app/api/keplar/route.ts` | New tools call only `:free` models, with their own rate limit, or they are deterministic. A missing API key returns an honest unavailable state. |

## Low

| ID | Finding | Files | Recommendation |
|---|---|---|---|
| L1 | **`lastmod` for static pages is a hand map.** `staticLastmod` is documented as the day a reader would notice a change. Tests require a date, not that it matches git. Replacing it with `git log` is wrong in a shallow checkout. | `src/lib/content/lastmod.ts` | Keep the map. Update a date when the page's copy changes, which the existing test already requires. |
| L2 | **Some indexable URLs are intentionally absent from the sitemap.** Tests keep `/signin`, `/signup`, `/account`, and `/checkout` out. `/status` is asserted indexable and not listed. `/feedback` has a canonical and no sitemap entry. `/app/*` tabs use `pageMeta` without `noindex`, and a test forbids adding noindex there. | `tests/seo.test.ts`, `tests/launch-readiness.test.ts`, `tests/seo-indexing.test.ts` | Leave this. It is policy, not an omission. |
| L3 | **Home-page lab performance was not remeasured.** The 3 Oct audit noted an unstable mobile score on the WebGL field. Other work is changing that scene. | `docs/seo/AUDIT.md`, `src/field/` | Do not touch the field in this program. |
| L4 | **Public-answer consent is a request flag.** `publishShare` requires `consent === true` and a verified email, scans for personal data, and caps pages per account. The stored mark is `publicAt`. Private links are noindex. Templates can go live without a person when the scanner does not say `review`. | `src/lib/growth/share-public.ts`, `src/lib/templates/` | Keep private by default. Record the consent timestamp next to `publicAt` if the row shape allows it. Do not auto-publish new kinds of user content. |

## Refuted or downgraded

| Checkpoint | Verdict |
|---|---|
| F1 wrong repository | Closed. This work is in `keplar-live`. |
| F2 "docs say there is no public API" | Refuted for `developers-and-api.md`, which describes the beta API. The stale sentences were the glossary and `docs/seo-growth-plan.md` (H1). |
| F3 no sitemap index | Confirmed, severity Medium (M1). `src/lib/i18n/sitemap.ts` says the localized set does not need its own index; that comment is about hreflang entries inside `/sitemap.xml`, not about the four files. |
| F5 overlapping product pages are duplicates to redirect | Downgraded. The six pages have different titles, descriptions, and H1s. Redirecting one would drop a distinct URL. |
| F11 field performance | Not remeasured. Out of scope while another change owns that scene. |
| F12 title 72 / description 191 | Confirmed (M4), from the source strings. |

## Cluster coverage

Existing hubs only. A blank cell is a gap, not a promise to invent a thin page. Product routes are the in-app destination.

| Cluster | Hub today | Supporting pages (observed) | Product route | Gap |
|---|---|---|---|---|
| AI model comparisons | `/compare` and `/vs` | `/compare/perplexity-model-council`, `/compare/poe`, `/compare/chathub`, `/vs/chatgpt`, `/vs/claude`, `/vs/gemini`, `/compare-ai-models`, `/chatgpt-alternative`, blog comparison post. `/vs/perplexity` held. | `/app/ask` | One registry that assigns an intent to each URL. |
| AI studying and education | `/ai-study-tool` | `/for-students`, `/guides/study-from-a-pdf`, study use case, study doc, learning prompts | `/app/study` | None that needs a new URL. |
| AI reasoning and research | `/how-it-works` (method) and `/for-researchers` (audience) | `/keplar-one`, Deep Research doc, research prompts | `/app/ask` | Deep Research is Plus and Pro, not a free anonymous tool. |
| AI presentations and slides | `/ai-slideshow-maker` | `/guides/slide-deck-from-notes`, slides use case, slides doc | `/app/slides` | Slides require Plus. A free outline tool must not pretend to export a deck. |
| AI image generation | Doc "Generate images" only | Blog on image generation | Create images (Plus and Pro; Free and Lite limits are null) | No marketing hub. A new page has to be a real product page, not a restatement of the doc. |
| AI video generation | Doc "Generate video (Beta)" only | — | Create video (Pro) | Same as images. |
| AI writing and summarization | `/for-writers` and `/prompts/writing` | writing use case, writing blog | `/app/ask` | No separate summarizer route. |
| AI productivity | No single hub | `/for-founders`, `/for-small-business`, `/prompts/work`, work use cases | `/app/ask` | Do not add a doorway page that repeats the audience landings. |
| AI prompt optimization | `/prompts` | seven prompt categories, prompts blog, "Write better questions" doc | `/prompts` (static) and `/app/ask` | The library is the tool until a generator exists. |
| AI model pricing and capabilities | `/pricing` and `/models` | plans doc, model roster doc | `/pricing` | Prices stay sourced from `tiers.ts`. |
| AI tutorials and workflows | `/guides`, `/docs`, `/use-cases` | 3 guides, 77 docs, 10 use cases, 24 posts | Mixed | Hubs exist. |

Content counts observed in this checkout: 24 blog posts, 77 docs, 10 use cases, 65 glossary terms, 48 prompts in 7 categories, 13 landing slugs, 4 editorial slugs, 3 guides, 4 vs pages (3 approved), 3 compare pages plus a hub.

## What already works (do not rebuild)

- `src/lib/seo.ts` `pageMeta` (title, description, canonical, hreflang, Open Graph, `noindex`).
- `src/app/sitemap.ts` plus the three dynamic urlset routes. Empty dynamic sitemaps are not used to drop URLs; a store error returns 503.
- `src/app/robots.ts` allow rules and the named crawler list.
- `src/lib/structuredData.ts`, `src/lib/seo-graph.ts`, `src/lib/kb/jsonld.ts`.
- Topics gates, template moderation, and public-answer consent, PII scan, and takedown.
- `src/lib/orchestration/free-guard.ts`: Free calls only $0 `:free` OpenRouter models.
- SEO unit tests inside `npm test`, which CI already runs.

## Implementation order

1. Fix H1–H4 and M1 and M4 (facts, unapproved comparison, sitemap index, `/for-developers` meta). Tests in `tests/seo-engine.test.ts`.
2. Cluster registry and a shared quality gate (unique title, description, H1, word count, internal links, shingle overlap, JSON-LD checked against visible text). `noindex` when a programmatic draft fails the bar. No new near-copy pages.
3. Free tools that are either deterministic or locked to `:free` models and a rate limit.
4. Facts test kept as the AI-search check. Measurement client that is empty until Search Console credentials exist. More SEO unit tests in the existing CI test run.
5. Report template that refuses to publish without methodology, data, limitations, and a reproduce section. Public sharing stays private until an explicit consent flag is stored.
