# Search content: audit and extension (builds on docs/seo)

The SEO workstream (executor `sand-subagent-cee11955-1a8c-c215-ea9c-469442da232e`, docs in `docs/seo/`) targets the "superintelligence (SI)" theme with a pillar and supporting pages, truthful sitemap `lastmod`, `llms.txt`, IndexNow, and a consent-gated search-to-activation funnel. **This work does not touch those pages or files and does not target the same queries.** It adds content for the chosen customer's *decisions* and a landing page for them.

## 1. Audit of what is live (3 Oct 2026, fetched from https://keplar.one)
| Check | Result |
|---|---|
| Sitemap | 34 URLs, includes `/for-developers`, `/about`, `/models`, guides and landing pages |
| robots.txt | `Allow: /`, `Disallow: /api/`, `/dev/`; sitemap declared |
| `/for-developers` | HTTP 200; title and description set (one unique each); one canonical `https://keplar.one/for-developers`; ~1,000 words of server-rendered HTML; 4 JSON-LD blocks that parse (Organization + WebSite, FAQPage, WebPage, BreadcrumbList); no `noindex` |
| Lighthouse on live `/for-developers` (3 Oct 2026, lab, simulated throttling) | mobile: performance **98**, accessibility 100, best practices 100, SEO 100 (LCP 2.3 s, TBT 80 ms, CLS 0); desktop: 100 / 100 / 100 / 100 |
| `/feedback`, `/r/<token>`, `/admin/growth` | correctly out of the index: feedback `noindex, follow`; shared answers `x-robots-tag: noindex, nofollow, noarchive` (404 for unknown or revoked); admin 404 |
| Real search performance | **unknown**: no Search Console data is available to this work (the owner must verify the property; see docs/seo/MEASUREMENT.md) |

## 2. Is there search demand for what we chose? (evidence and its limits)
- Developers do write about and search for multi-model second opinions for architecture decisions: two independent posts found (S10, S11 in [SEGMENT.md](SEGMENT.md)), plus open-source "second opinion" tools on GitHub. That shows interest, not volume. **No keyword-volume tool was available; no volume is claimed.**
- The generic query space is crowded: "JSONB vs normalized table", "JWT localStorage vs cookie", "monorepo vs polyrepo" each have many existing articles, and several multi-model comparison sites (MultipleChat, Qorpus, Talkory, Aymo, SmophyAI, MultiAsk) rank for "ask multiple AI models". Competing head-on with explainers would be weak.
- Differentiated angle (what we can credibly offer): **original dated runs** with the models' actual positions, where they split, what the verifier changed, and where they were wrong (Node LTS), plus a decision checklist the reader can use without Keplar. This is hard to copy because it is a record of real runs.

## 3. Content plan (no mass-produced pages)
One guide per decision, written from a saved run (DEMO-RUNS.md R1-R5 first), each with a unique intent:
1. JSONB column or normalized table for user preferences (R1)
2. JWT in localStorage or httpOnly cookie (R2)
3. Should a two-person startup rewrite a working Node.js backend in Rust (R3)
4. Postgres vs DynamoDB vs MongoDB for a small multi-tenant app (R4)
5. Monorepo or separate repositories for a two-person Next.js SaaS (R5)
6. "Version questions: why three AI models agreed and were all out of date" (R6: the Node LTS story; the one piece that is an essay about the limit of consensus, which also suits Changelog/HN-style audiences)
Eight post drafts are in [campaign/POSTS.md](campaign/POSTS.md); the first five are the guide drafts, the rest social/community adaptations. Do not publish more than one guide per week, and no variant pages for the same decision.

**Implementation path (to avoid fighting over files):** guides live in `src/lib/content/guides.ts` / `landing.ts` (owned by the SEO workstream). Hand-off: when they are free, add the six guides there using their schema (Article + BreadcrumbList, `lastmodFor`, sitemap, internal links from `/for-developers` and `/guides`), or create a separate `src/lib/content/decisions.ts` imported by the sitemap. Until then drafts stay in `campaign/POSTS.md` and can be published on DEV/Hashnode with a canonical pointing at keplar.one once the guide exists.

## 4. Internal links and CTAs
`/for-developers` links to `/app` (prefilled examples), `/how-it-works`, `/pricing`, `/feedback`. Pending (files owned by others): link `/for-developers` from the footer and the `/guides` index; add "Try this decision" CTA at the end of each guide to `/app#q=…`.

## 5. Not recommended
Programmatic "X vs Y" pages in bulk; AI-generated variants of the same article; a "best multi-model AI tools" listicle (the existing `/compare` is held back until competitor claims are approved); keyword stuffing; buying backlinks or directory fast-lanes.

## 6. Verification checklist for each new page (run before every publish)
Unique title (<= 60 chars) and description (<= 160); one H1; canonical = its own URL; in sitemap with real `lastmod`; JSON-LD parses; Lighthouse mobile >= 90; axe 0 violations; no claims outside DEMO-RUNS.md; run date and models stated; link to `/app#q=` example works.
