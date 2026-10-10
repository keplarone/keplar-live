# Launch announcement and founder intro (drafts for review; nothing posted)

Facts allowed: Keplar One; Keplar was created by two co-founders, Hassen and Hussain Keder (two different people); founded 2026; plans and limits as on /pricing; tested results only from [DEMO-RUNS.md](DEMO-RUNS.md). No ages, no birth dates, no customer counts, no ratings, no "AGI". **Placeholders in [brackets] are for the founders to fill in with their own words.**

## A. Show HN (one post, from one founder's account; do not also post the SI variant)
**Title:** Show HN: Keplar - ask once, see where several AI models agree and split
**Text:**
Keplar sends one question to several AI models, shows how many took the same position and exactly where they split, checks a draft, and writes one answer. You can try it at keplar.one/app without an account (Free plan: free open models, up to 50 questions a day, and it can be slow when free models are busy).

I tested it on 13 developer-style questions today. Median time to an answer was about 19 s. Two showed a visible split. In one, I asked for the current Node.js LTS: two models said 22 and one said 20, Keplar flagged the split and went with 22, and all three were out of date (Node 24 is LTS today). It also got a letter-counting question wrong because easy questions go to a single model and aren't cross-checked. I also found it was writing a "where the models disagree" section even when they all agreed; I tightened the prompt today, and on a re-run it now says outright that the models do not disagree (the section can still appear).

What I'd like feedback on: whether the disagreement view is useful for technical decisions, and what questions you'd want to pressure-test. [Founder: one sentence on why you built it, in your own words.]
keplar.one/for-developers

*(First comment, from the same account: list the limits plainly: no live web lookups, simple questions use one model, the reviewer is sometimes one of the panel's models, results vary. Reply to every question; never ask for upvotes.)*

## B. Launch announcement (blog/changelog on keplar.one, then DEV/Hashnode with canonical)
**Title:** Keplar One: one question, multiple intelligences, one answer
Keplar sends your question to several AI models, compares what they say, shows who agreed and who didn't, checks a draft, and writes one answer. Today we are focusing on one job: pressure-testing a technical or product decision before you commit.
What it does: the Free plan runs on free open models with no card (up to 50 questions a day; free-model hosts may log prompts; it can be slower when free models are busy). Lite ($20 a month, billed through Whop) adds premium models and consensus with a monthly allowance; Plus and Pro add more usage and creation tools. Prices and limits are on /pricing.
What it doesn't do: it doesn't browse the web yet, it can be wrong even when models agree, and easy questions are answered by one model. See what we tested, including the failures: keplar.one/for-developers.
Built by Hassen and Hussain Keder, the two co-founders of Keplar, founded in 2026. Tell us what's wrong or missing: keplar.one/feedback.

## C. Founder intro (for Indie Hackers / own profiles; first person, plural)
Hi, we're Hassen and Hussain Keder, the two co-founders building Keplar One. We started in 2026. [Founders: add 1-2 sentences in your own words about why you're building it; do not add ages or private details.] Keplar asks several AI models the same question and shows you where they agree and where they split. This week we ran a small public test on developer decisions and shared everything, including where it was wrong. We're looking for 20-30 independent developers and technical founders willing to try it on a real decision and tell us honestly what's missing: keplar.one/feedback?kind=research. There's no payment and no obligation.

## D. Product Hunt (later, after the first 100 activated users; personal account; no upvote requests)
Tagline: One question. Multiple intelligences. One answer.
Description: Ask once. Keplar sends your question to several AI models, shows how many agreed and where they split, and writes one answer. Free to try without an account on free models.
Maker comment: [Founder]: what it is, the limits (no live web, can be wrong even when models agree), and one request for feedback.
