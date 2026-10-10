# How major AI products do SEO, and what Keplar does with it

Observed **4 Oct 2026** from their public `robots.txt`, sitemaps and `llms.txt` files. This describes structure, not performance: we have no ranking or traffic data for any of them.

## What we saw
| Brand | Site structure | Machine-readable aids | Notes |
|---|---|---|---|
| OpenAI | Sitemap index of about 40 content-type sitemaps (learn guides, webinars, release notes, research, safety, startup stories, per-function plugin and use-case pages) | Permissive robots.txt; no `llms.txt` (404) | ChatGPT release notes live on its help center |
| ChatGPT (chatgpt.com) | Use-case landing pages (translate pairs, paraphrase, students, images, shopping) plus many public GPT pages | robots.txt blocks several crawlers (CCBot, Google-Extended, PerplexityBot) | Large library of public, user-created pages |
| Anthropic | One sitemap: about 263 news, 169 research, 26 engineering, legal, events, product and feature pages | `llms.txt` on the developer docs only; claude.ai blocks several AI crawlers | Release notes in docs and support center; large support-center sitemap |
| Perplexity | Main sitemap plus a help-center sitemap | `docs.perplexity.ai/llms.txt` with per-page `.md` links; search result pages blocked from Googlebot | MCP server and CLI documented |
| Gemini | Small sitemap index, permissive robots.txt | none seen | Product site separate from Google's help pages |
| Mistral / DeepSeek | Sitemap index and `llms.txt` (Mistral); permissive robots.txt with sitemap (DeepSeek) | Mistral has `llms.txt` | |

## Patterns that are common
1. Many pages of **real use-case content**, not just a home page.
2. **Dated release notes** and docs.
3. **Public, indexable user-generated pages**, with private ones blocked.
4. **`llms.txt`** on docs sites (not on the big consumer sites), sometimes with per-page markdown.
5. Sitemaps split by content type.
6. Explicit rules for AI crawlers in robots.txt (most block some; Keplar's choice is to allow reputable ones, see below).

## Where Keplar is, and what was added
| Pattern | Keplar |
|---|---|
| Use-case and landing pages | Existing: the `/for-*` audience pages and `/use-cases/*`. Added `/for-writers`. |
| Docs, glossary, prompts, blog | Existing. |
| Dated release notes | **Added** `/changelog` with Atom feed. |
| Public user pages with privacy | **Added** opt-in `/answers/<slug>` (consent, verified email, PII scan, 10 per account, admin takedown, QAPage JSON-LD); private `/r/<token>` stays noindex. |
| `llms.txt` | Existing; extended with the changelog. **Added** `/llms-full.txt` (all docs and glossary in one file, as Anthropic's and Mistral's docs do). |
| Per-page markdown | Not built. Possible later; low value until docs are larger. |
| Crawler policy | **Added** named robots.txt groups for Google, Bing, DuckDuckGo, Apple, OpenAI, Anthropic and Perplexity search/user agents; the disallow list is repeated in each. |
| Sitemaps by type | `sitemap.xml`, **added** `answers-sitemap.xml` and `topics-sitemap.xml`. |
| Structured data | Organization (with `sameAs` to the verified GitHub org), WebSite, Article/FAQ/HowTo/Breadcrumb as appropriate, QAPage on public answers. |
| Trend-led pages | **Added** the trend tracker ([`seo-trends.md`](seo-trends.md)). |
| Developer API / CLI / MCP page | Not built: Keplar has no public developer API, so documenting one would be inventing it. |
| hreflang | Not used: English-only site. |

## What we are not copying
Anything that depends on scale we do not have (thousands of user-built public pages), claims we cannot support (benchmark leadership), or trademarks (logos, brand comparisons that have not been cleared).
