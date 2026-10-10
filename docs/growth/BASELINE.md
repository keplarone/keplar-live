# Baseline: product, site, journey, billing, and the largest obstacle

Date of all observations: **Saturday 3 Oct 2026**, between about 02:00 and 03:00 ET, unless a source date is given. Method: read the repo at the commit where this work started (`e21dfe9`), fetched the live site, called the live API anonymously on the **Free plan (free models only, $0)**, and read Whop's API with a read-only key. **Unknown and assumed items are labelled.** Nothing here is a customer result.

## 1. What the product does today (verified by use)
- One question goes to a panel of models chosen by a classifier (simple question: one model; moderate: usually 3; complex: up to 5 plus a judge on paid plans). A response extractor groups the answers by position, a verifier reviews a draft, and a synthesizer writes one answer. Where models took different positions, the answer says so and lists who said what (`disagreements`) with a resolution.
- The stream shows six stages (understand, select, compare, disagree when applicable, verify, synthesize), per-model status, and then the answer with sections (Consensus, Models, Disagreements, Verification, Reasoning).
- **Not in the product:** live web lookups (the answer's sources are what the models cite, unchecked); confidence scores (the in-app badge previously showed a percentage ring "Consensus 87%". Changed on 3 Oct 2026 to "N of M models" counts plus a plain sentence; the homepage demo still shows an illustrative figure labelled as such, owned by another workstream).

## 2. The live journey, tested for real (anonymous, Free, free models)
13 questions produced an answer; 3 more calls returned an error (1 burst rate limit, 2 hit the Free daily limit of 50 questions which the box's IP had used up by testing: the message was clear: "You've reached today's limit of 50 questions. It resets in 24 hours. Upgrade to Plus for more").

| Measure | Result (n = 13 answered; 12 multi-model, 1 single-model) |
|---|---|
| Time to a finished answer | median **18.8 s**, range 9.5-40.5 s (single-model: 0.6 s) |
| A model in the panel failed or timed out | **3 of 12** multi-model runs answered with 2 of 3 models (e.g. "Qwen timed out: latency budget", "Gemma failed") |
| Models split (a visible disagreement) | **2 of 12** (Node.js LTS version: 2 vs 1; mortgage prepay vs invest: 2 vs 1) |
| Models all agreed | 7 of 12 (the other 3 agreed among the 2 that answered) |
| Verifier raised an issue and revised the draft | 1 of 12 (Rust rewrite question: the verifier found the draft under-stated the counterargument; the final answer includes it) |
| Verifier independent of the panel | **Not always**: in 3 of the 5 saved demo runs (d1, d2, d5) the verifier was Nemotron 3 Super, which was also one of the three panel models, so it reviewed a draft built partly from its own answer. Weak independence; a limit on the word "verified". |
| Wrong answers | 2 observed (below) |

Observed failures worth marketing honestly:
1. **Node.js LTS (exact prompt "What is the current latest long-term-support (LTS) version of Node.js, and when did it enter LTS?"):** two models said Node 22, one said Node 20; Keplar flagged the split and picked the majority. **Both were out of date.** nodejs.org on 3 Oct 2026 lists Node 24 as LTS with 22 also in LTS, 26 as Current and 20 at end of life. The disagreement view worked; "agreement" did not mean "correct", and without web lookups Keplar cannot know. 
2. **Letter counting (exact prompt: `How many times does the letter "r" appear in the phrase "strawberry raspberry cranberry"? Show your count.`):** classified as simple, answered by one model ("nothing to compare"), answer 7. The correct count is 9. No cross-check happened.

3. **Invented disagreement text (R3, R4):** when all models agreed, the written answer still carried a "Where the models disagree" section that described an alternative as a model position. This undermines the central claim, so the synthesis prompt was tightened (commit 4bded51, deployed). One live re-run afterwards still printed the section but stated that the models do not disagree; a code-level omission is a follow-up.

Details, exact prompts, models and outputs for the 8 runs whose prompts were saved (R1-R8; campaign content may reuse only these): [campaign/DEMO-RUNS.md](campaign/DEMO-RUNS.md). Five earlier runs in the 13 (anonymous, same settings) did not have their prompt text retained; they are counted in the statistics above but are **not** quoted in any marketing asset.

## 3. Public site, pricing and billing (checked)
- `/`, `/pricing`, `/robots.txt`, `/sitemap.xml` return 200 (home about 0.7-0.8 s from this box); `/api/health` reports the durable database; `/welcome` redirects signed-out visitors; no horizontal overflow at 1440 or 390 px; axe (WCAG 2 A/AA) found no violations on the new pages.
- Plans: Free $0 (50 questions/day, free models, 150/day per IP, 6/minute burst); **Lite $20 shown** (Whop plan `plan_qpgb6JV0jhQGj` bills **$19.99**), **Plus $44.99** (`plan_wd9Xs4iDlwvDi`), **Pro: site shows $99, Whop bills $99.99** (`plan_M6ztgSJDucMJA`). All 30-day, read from Whop's API with a read-only key. The $0.01 gaps are small but real: disclose "billed through Whop; the exact amount is shown at checkout" (the product already does at checkout).
- Whop fees (docs.whop.com/fees, 3 Oct 2026): 2.7% + $0.30 per domestic card payment, +1.5% international, +1% currency conversion; optional add-ons not assumed; $15 per dispute.
- **Not tested:** an actual paid checkout and renewal (no money was spent; "Real Lite purchase untested").
- **Compliance flag (decision for the owner):** Vercel's fair-use guidelines say Hobby teams are restricted to non-commercial personal use and that any payment-processing site requires Pro ($20/month per seat). Keplar charges customers, so staying on Hobby risks suspension. The model includes it as a fixed cost; nothing was purchased. Source: https://vercel.com/docs/limits/fair-use-guidelines (3 Oct 2026).

## 4. Capacity: the free-model pool (verified from the OpenRouter key and docs)
OpenRouter free-model limits: 20 requests/minute; 50 requests/day if the account never bought credits, **1,000/day** if it has (this key: 1,000/day limit; 302 used at about 06:30 UTC on 3 Oct). One Free consensus question uses about 6-7 free-model calls (3 panel + extractor + verifier/draft + synthesis). So **the whole product can serve roughly 150 Free consensus questions per day, however many Free users exist** (extra keys do not raise the pool, per OpenRouter). Free users cost $0 in dollars but are bounded by this pool. In the base scenario the pool is exceeded when about 1,000 Free users are active (month ~27); in the ambitious scenario at ~month 13 (see [MODEL.md](MODEL.md)). Unknown: today's real daily Free volume.

## 5. Analytics and measurement (before this work)
- A first-party, consent-gated landing-page funnel (`seo_events`: landing_view, cta_click, signup_complete, first_prompt, synthesis_success) was being built by the SEO workstream. It stores a random browser id, never prompt text; honors the cookie banner and GPC/DNT.
- **No historic traffic, signup, activation, retention, conversion or revenue data was available to this work** (no analytics export, no Search Console, no payment history). Everything in the model's funnel is an assumption until [/admin/growth](IMPLEMENTED.md) fills.

## 6. Onboarding
New first-run `/welcome` flow (5 steps, guided first question, checklist) is live; signed-out visitors are redirected. Its "coding" starters were code-writing prompts that produce one answer with nothing to compare; changed to decision-style prompts (see [ACTIVATION.md](ACTIVATION.md)).

## 7. The largest current obstacle (with evidence)
**It is acquisition into a specific audience that is both reachable and measurable, not product capability, price, or cost.**

Evidence, in order of weight:
1. **There is no demonstrated demand or traffic.** No audience data exists; the positioning on the home page is generic ("Stop trusting one AI"). The model shows what that means: at plausible conversion rates, **holding $1,000 MRR needs about 4,400 qualified visits a month in the base case (24,000 conservative, 840 ambitious) and holding $10,000 MRR about 44,000 (245,000 conservative, 8,400 ambitious)** ([MODEL.md](MODEL.md)). Two founders with a $0 budget cannot buy that; it has to be earned, and the only free levers are demos, community posts and content for a precisely chosen audience.
2. **The core differentiator shows up rarely.** The visible disagreement appeared in 2 of 12 multi-model runs. A newcomer asking an easy factual question will usually see "all models agree", which is a weaker pitch. So the first-run prompts and the landing page must steer users to *trade-off decisions* where splits happen, and the product must make "agreement" itself useful (and honest: agreement is not proof).
3. **Reliability and capacity cap a Free-led funnel.** 1 in 4 panels lost a model; answers take about 19 s; the product-wide Free capacity is about 150 questions a day; the verifier is not independent of the panel. These do not stop a first 100 activated users, but they will if acquisition works.
4. **Price gap.** Plus ($44.99) is more than twice the $20 of ChatGPT Plus, Claude Pro and Google AI Pro; only Lite ($20) matches. Willingness to pay for a second-opinion layer is unknown; it is a hypothesis for the first 10 paying customers (see [OFFER.md](OFFER.md)).
5. **Cost is not the obstacle.** A paid consensus task costs about **$0.0085** in provider fees (about 5 credits); the worst case (a customer spending a whole Lite allowance) still leaves about 74% margin before refunds ([MODEL.md](MODEL.md)).

What would change this conclusion: Search Console or analytics showing existing traffic with poor conversion would move the obstacle to activation or pricing. Until then the sequence is: choose the audience (done), build a measurable path (done), then earn the first 100 activated users.

## 8. Unknowns and assumptions (explicit)
Unknown: current traffic and signups; real paid-task cost mix; churn; refunds; international share of payments; developer willingness to pay; how many Free questions per day are asked now; whether Google/Microsoft sign-in work end to end for real users; real email delivery for lifecycle messages (they remain inactive). Assumed: all funnel rates and usage in the model (labelled yellow in the spreadsheet).
