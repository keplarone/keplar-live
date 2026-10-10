# Channels: candidates, the two chosen, and why

Audience: independent developers and technical solo founders making technical/product decisions ([SEGMENT.md](SEGMENT.md)). Budget: $0. Two founders. Nothing is posted or sent by this work; every post is a draft for review. Evidence dated 3 Oct 2026 unless noted. "Opened" = the page was fetched in this work; "search-derived" = seen in search results only.

## 1. Candidates evaluated
| Candidate | For | Against | Verdict |
|---|---|---|---|
| **Demo clips + rule-abiding developer-community and launch posts** | Developers seek second opinions and write about doing it by hand ([S10], [S11] in SEGMENT.md); a clip shows the disagreement view in 20-40 s; real runs exist (DEMO-RUNS.md); free to produce | Needs a founder to post; HN/Reddit reject marketing copy; reach is uncertain | **Chosen (Channel A)** |
| **Search content: original dated decision write-ups and tutorials** | Developers search for "X vs Y" decisions; compounding; no per-click cost; SEO workstream already built the infrastructure | Generic "JSONB vs normalized" articles are crowded; takes weeks; only original dated multi-model runs are differentiated | **Chosen (Channel B)** |
| Creator / influencer outreach | Reach through trusted voices | Needs a verified, relevant creator and a gift/pay; unproven; risk of "partnership" implications; $0 budget | Not now; 5 drafts only for review (campaign/OUTREACH-DRAFTS.md) |
| Product-led referrals | Fits behavior (people share answers) | Needs existing users first; rewards cost money | Sharing built; rewards only costed proposal |
| Founder-led async outreach | Fast learning | Cannot invent a list; unsolicited mass outreach is spam | Used only for the research form to people the founders already know |
| Directories / launch platforms | Cheap; some free (DevHunt, Uneed, SaaSHub, Peerlist, AlternativeTo) | Low intent traffic; many paid fast-lanes (not used) | Folded into Channel A as one-time listings |
| Paid ads | Predictable | No budget/loss limit/authorization | Proposal only (E11) |

## 2. Channel A: Show-your-work demos + developer communities
- **Audience:** developers and solo founders on Hacker News, DEV, Hashnode, Indie Hackers, r/SideProject, DevHunt/Uneed/SaaSHub listings, X/LinkedIn for the founders' own followers.
- **Message:** "I asked three free AI models a technical decision. They split on one question (Node LTS) and were *all wrong* about the version. Here is how Keplar showed it." Concrete benefit: a second opinion on a decision plus an honest list of where models disagree. How multiple models contribute: different model families answer independently; Keplar shows who said what and writes one answer; agreement is a good sign, not proof.
- **Offer:** free, no card; the Free plan shows the whole flow on free models. No discount.
- **Destination:** `/for-developers?utm_source=<platform>&utm_medium=post&utm_campaign=<piece-id>` (utm handled by the existing consented funnel). For Show HN the product itself must be tryable without signup (it is: `/app` works anonymously).
- **Production workflow:** pick a real decision prompt -> run it on the live Free plan -> save the stream -> record a 20-40 s screen capture (Playwright screenshot or screen recording; the founder's own screen) -> write the post from DEMO-RUNS.md facts only -> founder reviews -> founder posts under their own account -> log utm in PROGRESS.md.
- **Founder workload:** about 3 hours a week total (about 1 h per founder for recording/posting, 1 h answering comments). Posting and replying must be human; no automation.
- **Tracking:** utm -> `/for-developers` visit -> `/app` first question -> synthesized answer -> copy/share/save action (the activation event) -> signup -> paid. Dashboard: `/admin/growth`. Manual log of upvotes/comments in PROGRESS.md (not a goal in itself).
- **Rules verified (opened pages):** Show HN requires something people can try, no marketing language, and no vote solicitation (news.ycombinator.com/showhn.html). DEV allows posts under its terms (dev.to/terms). DevHunt free listing is a queue, requires sign-in and a developer tool (devhunt.org/faq). Uneed free submissions queue up to 5 months (help.uneed.best). SaaSHub requires a product on its own domain (saashub.com/services/submit). Details and links in [campaign/DISTRIBUTION-SHORTLIST.md](campaign/DISTRIBUTION-SHORTLIST.md).
- **Why the audience cares:** 84% of developers use or plan to use AI tools, but 46% distrust the accuracy and 66% cite "almost right" answers as a frustration (Stack Overflow 2025 survey); developers already run second models by hand (S10, S11). A demonstration that reproduces and honestly shows a split is directly relevant.
- **Continue/stop (assumption-based thresholds from the model, not evidence):** judge a piece only after >=500 qualified visits (or 6 pieces). Continue if visit -> activated >= 0.5%; strong if >= 1.1%; stop or rework if < 0.25% after >=500 visits. If a piece gets < 100 visits, fix the format/distribution before changing the message. Never declare a winner from fewer than 30 activated users.

## 3. Channel B: Search content for developer decisions
- **Audience:** developers searching a specific decision ("JSONB vs normalized table for user preferences", "httpOnly cookie vs localStorage for JWT", "monorepo vs separate repos for a two-person team", "should we rewrite in Rust").
- **Message:** the dated, original multi-model result for that exact decision (what the models said, where they split, what would change the answer), plus a clear "run your own decision" button. Original, not boilerplate; includes the run date, models and a caveat that models were free and may be out of date.
- **Offer:** free first run; no signup needed.
- **Destination:** each guide on keplar.one (indexable) and a link that opens the app with the example prompt prefilled and unsent (`/app#q=<encoded question>`; the question stays in the URL fragment and is never sent to a server until the visitor presses Send; this exists in the repo's TryBox). Cross-posts to DEV/Hashnode must use the canonical URL (both support it).
- **Production workflow:** 1 guide every 1-2 weeks, each from a saved run (DEMO-RUNS.md R1-R5 are the first five). Eight drafted posts are in campaign/POSTS.md. Each: problem, the three positions, what the run showed, a decision checklist the reader can use *without* Keplar, then the CTA. Add Article + BreadcrumbList structured data via the SEO workstream's helpers; add to sitemap; internal links from `/for-developers`.
- **Founder workload:** about 2 hours a week (review + publish; the first drafts exist). Autonomous work: drafting, running prompts, checking metadata.
- **Tracking:** Search Console impressions/clicks per URL (needs the owner to verify the property: **access requirement**), consented `landing_view` by path, activation events; AI-referrer visits by the SEO workstream's measurement (docs/seo/MEASUREMENT.md).
- **Why the audience cares:** these are decisions they must make weekly; reading a short checklist plus how three models split saves time and surfaces a missed trade-off. The competitive reality: generic explainers exist in volume; the angle that is hard to copy is *dated real runs with the failures shown*.
- **Continue/stop:** search is slow; judge at 8 weeks: continue if at least 3 guides have indexed impressions and combined visits are growing; stop adding guides if after 8 guides there are < 200 qualified visits a month in total. Do not publish thin variants of the same page.

## 4. Fit with the SEO workstream (no duplication)
The SEO executor owns the "superintelligence" cluster, `/models`, `/about`, `llms.txt`, IndexNow and measurement. This work adds only developer-decision content and `/for-developers`. Channel B pages should reuse their `seo.ts` helpers and sitemap entries once their changes are committed. See [COORDINATION.md](COORDINATION.md) and [SEARCH.md](SEARCH.md).

## 5. Distribution and content calendar
See [CALENDAR.md](CALENDAR.md).
