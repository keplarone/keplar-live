# Keyword map: superintelligence (SI) as the primary theme

Snapshot: **3 Oct 2026**, US-English web search. Full table with evidence per query: [`keywords.csv`](keywords.csv) (32 queries).

## What this is, and what it is not
- **Evidence we have:** which pages currently rank for each query (observed through web search on 3 Oct 2026), the primary sources behind each definition, and the wording of the new US executive order.
- **Evidence we do not have:** search volume, difficulty, click-through rates, or Keplar's own impressions. No keyword tool, Search Console or analytics data was available, and nothing here was bought. Every demand figure is therefore marked **unknown**. Do not read the order of the list as a ranking by traffic.
- Search growth is **to be measured** (see `MEASUREMENT.md`); no growth is claimed.

## Strategy in one paragraph
"Superintelligence" is a well-covered topic where dictionaries, cloud vendors and universities already rank. The way for a small site to be useful is to be the most carefully sourced and the clearest: one definitive pillar with primary-source definitions and access dates, a separate page for each distinct question people ask next, and an honest bridge to the product. Keplar is **not** superintelligence and says so on every page. It is a practical multi-model workspace, which is a small step in the direction of combining several intelligences.

## The cluster (one intent, one page)

| Page | Owns this intent | Primary queries | Why it is a separate page |
|---|---|---|---|
| **/superintelligence** (pillar) | What superintelligence (SI) is | superintelligence; what is superintelligence; superintelligent AI; artificial superintelligence; ASI; paths to superintelligence; risks; when | The definition, paths, risks and timelines are one reader journey. Sections, not separate pages, so they do not compete with each other. |
| **/ai-vs-agi-vs-superintelligence** | The comparison | AI vs AGI vs superintelligence; AGI vs ASI; difference between AGI and superintelligence; narrow AI | A comparison table is a different job from a definition. Links up to the pillar for each term. |
| **/si-vs-ai** | The abbreviation and the 2026 US executive order | SI AI; SI meaning AI; SI vs AI; super intelligence executive order | The abbreviation has several meanings (SI units, executive-branch naming). Keeping it apart protects the pillar from mixed intent. |
| **/multi-model-ai** | Combining models | multi-model AI; collective intelligence AI; mixture of agents; multi-model AI limits | Where the product connects to the theme, with research and limits stated. |
| **/models** | Which models Keplar uses | which AI models does Keplar use | Built from the product's own roster. |
| **/about** | Who made Keplar | Keplar One co-founders | Entity clarity: two co-founders, Hassen and Hussain Keder (two different people; JSON-LD has two separate Person nodes), founded 2026. |
| existing: /ai-answer-engine, /compare-ai-models, /chatgpt-alternative, /ai-fact-check, /ai-study-tool, /ai-slideshow-maker, /for-* | Product intents | see CSV | Unchanged intent mapping. |
| /compare | Competitor roundup | best multi-model AI tools | **Held back**: noindex and not in the sitemap until each competitor claim is approved. |

No two pages target the same query. `tests/seo-editorial.test.ts` checks that titles, descriptions, H1s and paths are unique.

## Handling the ambiguity of "SI"
- "SI" alone means the metric system (Système International d'Unités) in most searches. **We do not target the bare or generic query.**
- We target "SI" only in AI context: `superintelligence (SI)` in the pillar's title and first paragraph, and `SI AI`, `SI vs AI`, `SI meaning AI` on /si-vs-ai.
- /si-vs-ai says plainly that SI also means the units system and what the order does and does not change. Source: Executive Order 14434, "Inaugurating the Era of Super Intelligence" (signed 29 Sep 2026; Federal Register 91 FR 63129, 2 Oct 2026; whitehouse.gov), accessed 3 Oct 2026. It directs the executive branch to say "Super Intelligence" or "SI" in place of "Artificial Intelligence" or "AI", defines SI by reference to the existing statutory AI definition (15 U.S.C. 9401(3)), leaves historical documents unchanged, and asks for a proposed legislative definition within 60 days. **Review the page around late November 2026.**

## Sources behind the definitions (all opened 3 Oct 2026)
| Source | What we use it for |
|---|---|
| Nick Bostrom, *Superintelligence: Paths, Dangers, Strategies* (Oxford University Press, 2014), ch. 2 | Definition: "any intellect that greatly exceeds the cognitive performance of humans in virtually all domains of interest". The publisher's page blocks automated readers, so the wording was checked against an online excerpt; check it against a copy of the book before quoting elsewhere. |
| Bostrom, "Superintelligence" (2009 Edge essay, PDF) | "a general intelligence that vastly outperforms the best human brains in every significant cognitive domain"; collective intelligence; timelines "not something we are currently in a position to know". Read directly. |
| Google DeepMind, "Levels of AGI" (arXiv:2311.02462, Nov 2023) | ASI as the top level of general performance; the levels table. |
| IBM Think, "What is artificial superintelligence?" (14 Dec 2023) | ASI is hypothetical; AGI described as a big step toward it. |
| OpenAI, "Governance of superintelligence" (22 May 2023) | A lab's published position on governance. |
| Meta, "Personal Superintelligence" (30 Jul 2025); Microsoft AI, "Towards Humanist Superintelligence" (6 Nov 2025); Safe Superintelligence Inc. | Labs' own use of the term, quoted as positions, not as facts about capability. |
| Future of Life Institute, "Statement on Superintelligence" (22 Oct 2025) | The safety-side position. |
| AI Impacts, 2023 survey (arXiv:2401.02843; 2,778 researchers) | Timelines as contested opinion: aggregate forecasts of 10% by 2027 and 50% by 2047 for unaided machines outperforming humans at every task; answers varied widely. |
| Wang et al., "Mixture-of-Agents" (arXiv:2406.04692) | Reported result for combining models (65.1% vs 57.5% for GPT-4o on AlpacaEval 2.0), attributed to the authors; not a Keplar result. |

## Queries intentionally not targeted
- Bare "SI" / "what is SI" (units dominate).
- "AGI is here", "when will ASI arrive in year X" style claims: the site does not give a date.
- Competitor-name queries ("Talkory alternative", etc.): needs the approved /compare work.

## How the keyword map gets refreshed
Weekly (see `WEEKLY-REVIEW.md`): export Search Console queries for the five cluster pages, add real impressions/clicks/position to the CSV, split branded vs non-branded, and replace any "unknown" demand cells with measured numbers. Remove or merge any query that starts to pull two pages for the same intent (cannibalization check).

---

# Knowledge-base expansion: trending AI queries, docs, blog, glossary, prompts, comparisons

Snapshot: **3 Oct 2026**. 29 new rows were added to [`keywords.csv`](keywords.csv) (the file now holds 61 queries). Same rule as above: **no search-volume data of our own**. Every volume below is a third-party estimate that we could not verify, and none is used to make a claim on a page.

## Top trending AI searches (what we looked at, and where)
| Source (read 3 Oct 2026) | What it says | How we used it |
|---|---|---|
| Google Trends, "AI search trends" page (trends.withgoogle.com/trends/us/artificial-intelligence-search-trends) | Top rising "best AI for..." queries: coding, writing, math, image generation, writing essays. Comparison searches such as "AI for health and wellbeing" vs "AI for academic research". Image-generation searches reported at an all-time high. | One blog post per "best AI for..." query, written as a way to choose and test (no rankings), plus health and study cautions. |
| Resourcera, "100 most asked questions 2026" | "What is AI?" about 2.0 to 2.2M monthly, "What does AI stand for?" about 1.2M, "What is artificial intelligence?" about 290K. Estimates by a third party. | `/blog/what-is-ai` and `/glossary` answer these directly and say Keplar is narrow AI, not AGI. |
| cleanor.app AI-assistant demand tracker (data through May 2026) | ChatGPT 82.6%, Gemini 10.9%, Claude 1.7% (fastest riser), Perplexity 1.4% of tracked AI-assistant search demand. Third-party estimate. | `/blog/chatgpt-vs-claude-vs-gemini-vs-perplexity` and `/vs/*`. Quoted only as "a third-party tracker reported". |
| dailysearchvolume.com list of AI keywords | chatgpt, gemini, claude ai, character ai, ai agent(s), ai detector, perplexity ai. | "AI agent" is covered. "AI detector" and "Character AI" are **not targeted**: Keplar does not detect AI text and is not a companion product. |
| buzzabout / Nerq commentary on GEO | "AI search visibility" is a fast-growing topic among marketers. | `/blog/how-to-be-visible-in-ai-search`, written to separate what is established from what is guesswork. |

## How the new content maps to intent (one intent, one page)
| Intent | Page type | Pages |
|---|---|---|
| "How do I do X in Keplar" / "how does Keplar decide" | Docs (TechArticle, HowTo where there are steps, FAQPage where there is a visible FAQ) | `/docs` hub, 9 section hubs, 69 pages |
| "Best AI for X", "what is X", "can I trust X" | Blog (BlogPosting, FAQPage), each ending with how Keplar approaches it | 24 posts under `/blog` |
| "Define term" | Glossary (DefinedTermSet, one anchor per term) | `/glossary`, 66 terms |
| "Prompt for X" | Prompt library with copy buttons | `/prompts` and 7 category pages, 48 prompts |
| "Use Keplar for X" | Task pages | `/use-cases` and 10 pages |
| "Keplar vs X" | Fair, dated comparisons | `/vs` and 3 indexable pages; `/vs/perplexity` is noindex until the owner approves |
| "Which models does Keplar use" | Existing `/models`, plus `/docs/reference/model-roster` | Per-model pages were **deliberately not created**: they would be thin and would go stale whenever the roster changes. |

Cannibalization checks: `/blog/what-is-multi-model-ai` (explainer of the concept) differs from `/multi-model-ai` (research and limits pillar); `/blog/best-ai-for-essays-and-studying` differs from `/ai-study-tool` (product page). Tests compare every page pair for near-duplicate text (`tests/kb-content.test.ts`).

## Not targeted on purpose
AI detector, Character AI and companion chatbots, "free ChatGPT" style queries, unsupported "best AI" rankings, any query that would need us to claim accuracy or live web results.
