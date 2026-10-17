# SEO and growth plan (founder actions and drafts)

Written 4 Oct 2026. **Nothing in this file has been posted, submitted, emailed or paid for.** Every item that touches an outside site needs the founders to do it from their own accounts. All post texts are drafts.

Rules for everything below: no invented numbers, testimonials, ratings, customer counts or accuracy claims; no third-party logos; Keplar is not AGI or superintelligence; the Consensus figure is how strongly the consulted models agree, not how likely the answer is right; US English. Detailed background already in the repo: [`docs/seo/`](seo/) (audit, keyword map, measurement), [`docs/growth/CHANNELS.md`](growth/CHANNELS.md), [`docs/growth/SHARING.md`](growth/SHARING.md). This file is the single checklist; it does not repeat their analysis.

## 0. What the site already has (checked 4 Oct 2026)

| Area | State |
|---|---|
| Sitemap | `/sitemap.xml` (real per-page `lastmod` from content dates) plus `/answers-sitemap.xml` (public shared answers; empty until someone opts in). Both are listed in `robots.txt`. |
| robots.txt | Allows everything except `/api/` and `/dev/`. Named groups for Googlebot, Bingbot, DuckDuckBot, Applebot(-Extended), Google-Extended, OAI-SearchBot, GPTBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, Claude-User, PerplexityBot, Perplexity-User. Noindex pages stay crawlable so the noindex is seen. To opt out of AI training later, change the group for `GPTBot`/`Google-Extended`/`Applebot-Extended`/`ClaudeBot` in `src/app/robots.ts`. |
| Redirect and 404 hygiene (live) | `http` and `www` 308 to `https://keplar.one`; trailing slash 308 to the clean URL; unknown URLs return a real 404. |
| Structured data | Organization (`sameAs` = `https://github.com/keplarone`, the only profile we confirmed exists), WebSite, SoftwareApplication, BreadcrumbList, FAQPage (visible FAQ only), Article/BlogPosting/TechArticle, DefinedTermSet, HowTo, QAPage (public shared answers), CollectionPage. |
| Content library | 69 docs pages (help center), 24 blog posts, glossary (66 terms), prompt library, 10 use-case pages, `/for-students`, `/for-developers`, `/for-small-business`, `/for-founders`, `/for-researchers`, guides, dated `/vs` comparisons (feature facts only), and (new) `/changelog` release notes with an Atom feed. |
| Developer docs | `/docs/reference/developers-and-api` documents a **beta public API** (`POST /api/v1/ask`, keys, OpenAPI on `/developers`). There is still no SDK and no webhook API. This row used to say there was no public API; that sentence was stale after the API shipped. |
| Share cards | Per-page OG images for guides, docs, blog, prompts, use cases, landing pages, and (new) each public shared answer. |
| Language | English only. `hreflang` is not needed and would be wrong to add; add it only when a translated page exists. |
| llms.txt | `/llms.txt`, generated from the content files. A proposal; no search engine has said it uses it. |

New in this change set: opt-in public answer pages (`/answers`), `/changelog` and feed, `sameAs`, explicit crawler rules.

## 1. Founder-only actions, in order

1. **Google Search Console.** Add the **Domain** property `keplar.one` and verify with the DNS TXT record Google shows (add it where the domain's DNS is managed). Alternative for a URL-prefix property: put the token in Vercel > Project > Settings > Environment Variables as `GOOGLE_SITE_VERIFICATION` (Production), redeploy, then press Verify. Then Sitemaps > submit `sitemap.xml` and `answers-sitemap.xml`. Then URL Inspection > Request indexing for `/`, `/changelog`, `/docs`, `/blog`, `/glossary`, `/prompts`, `/use-cases`.
2. **Bing Webmaster Tools.** Sign in at bing.com/webmasters. Fastest: **Import from Google Search Console**. Otherwise add the site, choose the meta-tag method, set `BING_SITE_VERIFICATION=<token>` in Vercel, redeploy, verify. Submit both sitemaps. Bing's index feeds several other engines and AI assistants, so this matters more than its share suggests.
3. **IndexNow.** Key file already live at `/794a2fb6c986d2a4fdc970229ac50be4.txt`. After each deploy that adds pages: `node scripts/indexnow.mjs --all` (Bing and a few others; Google ignores it).
4. **GitHub.** `github.com/keplarone/keplar-desktop` is public but has no description, no topics and shows an `UNLICENSED` notice (observed 4 Oct 2026). Add a one-line description with a link to `https://keplar.one/download`, and topics such as `ai`, `llm`, `multi-model`, `desktop-app`, `ai-assistant`. Add a profile README to the `keplarone` organization pointing to keplar.one. Do not add a license unless that is a deliberate decision. Also pin the repo.
5. **Real profiles for `sameAs`.** Create (or tell us about) the official X, LinkedIn, YouTube or Product Hunt profiles, then add their URLs to `sameAs` in `src/lib/structuredData.ts`. Do not add a profile that is not owned by Keplar.
6. **Search Console follow-up after ~1 week:** Pages report. "Crawled, currently not indexed" on a page means it needs more unique value or more internal links, not more submissions.
7. **Decide what to post and when** (section 3). Each post must come from a founder's personal account and the founder should be present in the comments the same day.

## 2. Where to list Keplar

Status column: **Opened** = the rules page was read in this work or an earlier one (date); **Not verified** = could not be checked (blocked or not fetched), so read the current rules before submitting. Never use a paid fast lane without a founder decision.

| Place | What it is | Cost / rules | Status |
|---|---|---|---|
| Product Hunt | Launch platform | Free. Personal accounts only (no company account). Do not ask people to upvote; ask them to visit and comment. 12:01 am Pacific is the usual start. Launch again only for significant new versions. | Opened 4 Oct 2026 (producthunt.com/launch) |
| Hacker News: Show HN | Developer community | Must be something people can try, ideally without signup (the Keplar app works without an account); no marketing language; no asking for votes. | Opened 3 Oct 2026 (`CHANNELS.md`) |
| DevHunt | Developer-tool launch queue | Free listing queue; needs sign-in and a developer tool. | Opened 3 Oct 2026 |
| Uneed | Launch directory | Free submissions queue (long wait); paid fast lane not used. | Opened 3 Oct 2026 |
| SaaSHub | Software directory and alternatives | Free listing; has an "alternatives" page per product. | Opened 3 Oct 2026 |
| Peerlist (Launchpad) | Developer community | Free. | Search-derived |
| AlternativeTo | "Alternatives to X" site | Free to suggest an app; add Keplar as an alternative to the assistants it is honestly comparable to. Say exactly what it is (multi-model assistant). | Not verified (site blocked automated reading) |
| Futurepedia, Toolify, Future Tools and similar AI directories | AI tool lists | Mixed. Many have paid "featured" tiers; free submission forms exist. Read each before submitting; skip any that require a paid tier or a reciprocal link. | Not verified |
| There's An AI For That | AI directory | Standard listing is a **$49 paid review** (page read 3 Oct 2026). Not used. | Opened 3 Oct 2026 |
| BetaList | Startup list | All submissions paid per its FAQ (read 3 Oct 2026). Not used. | Opened 3 Oct 2026 |
| Indie Hackers (product page + milestone posts) | Community | Free. Share what you learned, not an ad. | Search-derived |
| DEV Community and Hashnode | Blogs | Free. Substantive articles, canonical URL pointing to keplar.one. | Opened 3 Oct 2026 (DEV terms) |
| Reddit (r/SideProject etc.) | Community | Each subreddit has its own self-promotion rule; read it first; one honest post, answer comments. | Not verified |
| GitHub topics | Discovery on GitHub | See section 1.4. | Observed 4 Oct 2026 |
| Microsoft Edge Add-ons / Chrome Web Store / app stores | Only if a real extension or app exists | No browser extension exists, and Keplar itself has no app in the Apple or Google stores (Create > Mobile builds other people's apps). Do not list what is not shipped. | n/a |

"Alternative to" framing, kept honest: say "a multi-model alternative to using one chatbot at a time". Do not claim to be better; the `/vs` pages state feature facts with an access date and label opinions.

## 3. Draft launch texts (drafts only)

All facts below were checked against the product docs on 4 Oct 2026. Replace anything that has changed. Each link carries UTM tags so the consent-gated funnel can attribute visits.

### 3.1 Show HN (draft)
**Title:** `Show HN: Keplar – ask once, see where several AI models agree and disagree`

**URL:** `https://keplar.one/app?utm_source=hn&utm_medium=post&utm_campaign=showhn` (works without an account)

**First comment (the author's own, plain, no marketing):**
> I got tired of pasting the same question into several chatbots and comparing the replies by hand. Keplar does that in one step: it picks the models a question needs, they answer independently, it compares their positions, and it writes one answer with a section on where they disagreed (only when they actually split).
>
> You can try it without signing up. The Free plan uses free open models only and is limited to 50 questions a day. Paid plans add more models and tools; the details are in the docs.
>
> What it does not do: it does not browse the web live, and it does not prove an answer is right. Agreement between models is a signal, not proof — they can share the same mistake. In my own tests a version-number question got three models giving two different, equally outdated answers; Keplar flagged the split but could not tell which was right.
>
> It is not AGI or anything like it; it is a workspace that combines several models' answers. I would like feedback on whether the disagreement view is useful, and on what questions it handles badly.

(Use the founder's real experience; delete any sentence you cannot stand behind. Do not ask for upvotes. Reply to every comment.)

### 3.2 Product Hunt (draft)
- **Name:** Keplar
- **Tagline (60 chars):** `One question, several AI models, one answer`
- **Description:** `Keplar sends your question to the AI models it needs, compares what they say, shows where they agree and where they don't, and writes one answer. Try it free with no signup.`
- **Maker comment (founder's personal account):** `Hi, I'm <name>. I made Keplar because I kept asking the same question in several chatbots and comparing the replies by hand. Keplar does the comparing: you see how many models agreed, which ones split, and one written answer. Free plan uses free open models (50 questions a day). It can be wrong even when the models agree, and it doesn't browse the web live yet. What would make the disagreement view more useful to you?`
- Gallery: use real screenshots of the product from the founders' own session. No third-party logos.
- Do not ask for upvotes. Ask people to try it and comment.

### 3.3 Short post for X / LinkedIn (draft)
`Keplar sends one question to several AI models, shows where they agree and where they split, and writes one answer. Free to try, no signup: keplar.one. It isn't magic — agreement isn't proof — but the split is often the most useful part.`

### 3.4 DEV / Hashnode article outline (draft)
**Title:** `How to check an AI answer without trusting any one model` — adapt from `/blog/how-to-check-an-ai-answer`. Sections: why one model's confident tone proves nothing; run the question through two or three different model families; read the disagreement, not the average; what to verify by hand; where multi-model comparison still fails (shared mistakes, stale facts). One link to Keplar at the end. Set the canonical URL to the keplar.one post.

### 3.5 Newsletter or educator pitch (template, no recipient chosen)
Send only after a founder picks a real recipient. To send it under Keplar's name the draft goes through the draft-and-approve step with recipient, channel and reason.
> Subject: A plain-English guide to checking AI answers (in case it's useful to your readers)
> Hi <name>, we published a short, sourced guide on checking an AI answer, with the limits of our own approach stated: keplar.one/blog/how-to-check-an-ai-answer. No ask beyond letting you know it exists. — <founder>

## 4. Backlink and mention ideas (earned only)

No purchased links, link swaps, comment spam, fake reviews or PBNs.

1. **Link-worthy pages we own:** `/models` (dated roster), `/glossary`, `/prompts`, `/docs/how-it-works/*` (the pipeline explained in detail), `/blog/how-to-check-an-ai-answer`, `/changelog` (feed). Share these where they answer a question someone asked, not as drive-by links.
2. **Public shared answers:** people who publish an answer and share it create natural, contextual links. Nothing to do except keep the feature honest and the pages good.
3. **Open-source footprint:** a real README and description on `keplarone/keplar-desktop`; link to docs for the build. Anyone who writes about the desktop app links to the release page.
4. **Original dated runs:** the developer-decision write-ups in `docs/growth/campaign/` are the most distinctive content (real runs with failures shown). Publish one every 1–2 weeks; developers link to examples, not to ads.
5. **Answer questions in public** (Stack Overflow meta, Reddit, HN) with genuinely helpful answers; link only where the page is the best resource and the site allows it.
6. **Reporters and bloggers covering AI tools:** a short note with a specific, verifiable angle (for example the version-number test above). Never claim superiority; offer a free account to try.
7. **Wikipedia and Wikidata:** do not create a page for Keplar yourselves (conflict of interest, notability rules). Revisit only if independent coverage exists.
8. **Customers and users:** if a real user writes about Keplar, link back and thank them; ask permission before quoting. Do not invent testimonials; none exist on the site.
9. **Partnership/integration pages:** only when a real integration ships (connectors are in beta).

## 5. What to measure (all lab or first-party until Search Console is verified)

- Search Console: impressions, clicks, average position per page; Pages report for indexing states; Core Web Vitals report once there is enough traffic.
- `/admin/seo` (first-party, consent-gated): landing views by source class, CTA clicks, sign-ups, first questions, answers.
- `/admin/growth`: links created, live and views for shared answers.
- Referrers from AI assistants appear as source class `ai`.
- No ranking, traffic or conversion improvement is claimed in this repo. Re-check after 4–8 weeks.

## 6. Do-not list

No paid directory fast lanes without a decision. No asking for upvotes. No claims of "most accurate", "best", numbers of users, or any percentage that is not measured and sourced. No AGI/superintelligence framing. No blue in graphics (the visual language is glowy white, black and grey). No posting from company accounts where a platform prohibits them.
