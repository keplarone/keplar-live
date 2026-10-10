# Keyword map from real trend data (4 Oct 2026)

This is the evidence-based companion to [`seo/KEYWORDS.md`](seo/KEYWORDS.md) (the page-to-intent map) and [`seo/keywords.csv`](seo/keywords.csv).
It records what Google Trends showed for AI and superintelligence topics, which Keplar page serves each term, and which terms we deliberately do not target.

## What the numbers are, and are not
- **Source for every row:** Google Trends "related queries", United States, timeframe past 3 months ("today 3-m"), fetched **4 Oct 2026** through the unofficial `pytrends` client (the same public endpoint the Trends website uses). Raw output: `/tmp/trends.json` at fetch time; the tracker re-fetches it on each run.
- **Top** values are a **relative index**: 100 is the most popular related query for that seed, the rest are scaled to it. It is not a search count.
- **Rising** values are **percentage growth** against the previous period. They can be huge when the starting level is tiny (a "Breakout" in Trends terms). A big rising number means "newly searched", not "high volume".
- **No search volumes are stated anywhere in this document.** Google does not publish them in Trends, and we have no keyword tool or Search Console data yet. Anything not listed is unknown, not zero.
- Rising lists contain unrelated noise (for example recipes, travel and shopping queries). That is exactly why the tracker applies a relevance filter before anything is used.
- Search Console, once the founders verify the domain, replaces all of this with Keplar's own impressions and queries.

## Seeds that returned data

| Seed (Trends) | Top related (relative index, 100 = max) | Rising (growth %) | Keplar page that serves it |
|---|---|---|---|
| superintelligence | superintelligence ai (100); artificial superintelligence (45); what is superintelligence (28) | ai vs si (7,600%) | `/superintelligence`, `/si-vs-ai` |
| artificial superintelligence | artificial superintelligence alliance (100); asi (39) | (policy-related query, see exclusions) | `/superintelligence` (term "ASI") |
| AGI | what is agi (100); agi meaning (27) | what is agi in terms of ai (200%) | `/ai-vs-agi-vs-superintelligence` |
| AI hallucinations | hallucinations in ai (100); what is ai hallucinations (53); what are ai hallucinations (29) | what are ai hallucinations (80%) | `/docs/get-started/what-keplar-cannot-do`, glossary "Hallucination" |
| AI agents | ai agent (65); what are ai agents (29); autonomous ai agents (23) | none relevant | `/blog/what-is-an-ai-agent`, `/docs/connectors-agents/agents-overview` |
| MCP server | what is mcp server (85); what is mcp (85) | whats an mcp server (130%); what is an mcp (60%) | `/docs/connectors-agents/connected-apps-overview`, glossary "MCP" |
| large language model | large language models (77); what is large language model (43); llm (36); what is a large language model (33); large language model definition (14) | build a large language model (40%) | glossary "Large language model (LLM)" (candidate for a tracker page once its text is long enough) |
| prompt engineering | what is prompt engineering (100); prompt engineering best practices (14); prompt engineering guide (13) | fine tuning vs prompt engineering (60%) | `/blog/how-to-write-better-ai-prompts` |
| vibe coding | what is vibe coding (35); vibe coding tools (38) | none relevant (noise) | none yet; not a Keplar product area, not targeted |
| AI study tool | ai study tools (100) | none | `/ai-study-tool` |
| AI search | ai search engine (28); ai search optimization (16) | none relevant | `/blog/how-to-be-visible-in-ai-search` |
| generative engine optimization | geo generative engine optimization (100); aeo (9) | none relevant (noise) | `/blog/how-to-be-visible-in-ai-search`, glossary "GEO" |
| AI safety | ai safety jobs (57); center for ai safety (34) | none relevant | glossary "Alignment" (not yet covered by a page) |

Seeds that returned **no data** (too little search interest for Trends to report): AI vs AGI, multi model AI, ChatGPT alternative (the seed contains a brand, so the result is also not used), AI fact check, deep research AI, compare AI models, AI glossary. "No data" means "below Trends' reporting threshold", not that people never search it; those pages stay because they serve product intent.

## Observations worth acting on
1. **"What is ..." definition queries dominate the relevant Top lists** (superintelligence, AGI, MCP, LLM, hallucination, prompt engineering, vibe coding). Keplar's glossary and the pillar pages are written in that shape. The tracker only builds pages from reviewed glossary definitions for this reason.
2. **AGI and superintelligence get most of their related interest from news and policy events**, not from definitions. We cover the definitions and the differences and avoid news-chasing.
3. **Brand-led queries** (a large share of "AI agents", "MCP server" and "AI safety" top lists) name other companies' products. We do not target them; see exclusions.
4. **Terms with explicit searches but no Keplar page yet:** "alignment", "AI safety" (as a concept), "vibe coding". Alignment is the only one in the glossary; it currently fails the tracker's substantive-definition gate (33 words, bar is 35), so a human-written page would be the right route.

## Deliberately not targeted
| Query type seen in the data | Why not |
|---|---|
| Politics and policy (queries naming a president, a White House accord, a ban act) | Fast-moving, partisan, easy to get wrong. Keplar is not a news site. |
| Named companies and products (OpenAI, Anthropic, Claude, Cursor, Meta, SSI and the like) | We have not cleared any brand for comparison. No logos, no comparative claims. |
| "AGI income" / "AGI tax" / "AGI stock" | These appear to be tax-form (adjusted gross income) and ticker searches rather than AI intent. |
| Anything asking whether an AI is conscious, alive or will take over | Cannot be answered with facts we can stand behind. |
| Rising queries unrelated to AI (recipes, travel, shopping, health products) | Noise in Trends rising lists; the tracker rejects anything without an AI term and a glossary match. |

## Trending now (daily feed)
`https://trends.google.com/trending/rss?geo=US`, fetched 4 Oct 2026, returned 10 items, **none AI-related**. The tracker polls this feed daily and only acts on a trending item if it passes the same relevance and safety filters, so most days it adds nothing from it. Rising and Top related queries (above) are the main source.

## How this feeds the tracker
Seeds in `src/lib/trends/sources.ts` (`SEEDS`) are the Trends searches the tracker runs, three per day in rotation. A candidate query becomes a page only if it passes: screen (AI term present; no brand, politics, adult, violence, claim-bait or comparison) → glossary match → not already covered by an existing page → quality gates. See [`seo-trends.md`](seo-trends.md).
