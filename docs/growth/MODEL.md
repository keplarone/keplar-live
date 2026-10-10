# Revenue and cost model

Files: **[keplar-model.xlsx](keplar-model.xlsx)** (editable, ~10,000 live formulas, recalculated and checked for errors with LibreOffice) and **[keplar-model.csv](keplar-model.csv)** (the Model sheet with the cost-per-task links turned into values so it also works in any spreadsheet; it evaluates to the same numbers). Built 3 Oct 2026.

**Read this first.** Every target here ($1k, $10k, $100k MRR; $1M and $5M ARR; $1M operating profit) is a **goal, not a forecast**. No revenue has been achieved. The funnel rates are **unsupported assumptions** (yellow cells) until the experiments in [EXPERIMENTS.md](EXPERIMENTS.md) report real numbers. ARR here means monthly recurring revenue x 12 (a run rate before any expense), never earnings.

## How the workbook is laid out
| Sheet | What it does |
|---|---|
| README | Colour code (blue = input you can change, yellow = unsupported assumption, green = verified against the repo/docs/Whop), glossary |
| Milestones | When each scenario reaches each milestone, and the steady-state customers / new payers / qualified visits per month needed to hold it |
| Model | All inputs, then three stacked 60-month engines (Conservative, Base, Ambitious): visits, accounts, activations, new payers, churn, expansion, refunds, discounts, usage, provider cost, payment fees, infra, support, referral, marketing, recurring vs one-time revenue, cash collected, gross profit, operating profit |
| CostPerTask | Cost of one successful task from the repo's actual routing and provider prices |
| Profit1M | What it takes to earn $1,000,000 a year in operating profit (before founder pay, and with a team) |
| Illustration | The 2,000 x $45 and 10,000 x $45 examples, with the caveat |
| Proposals | Referral reward and lifetime deal costed as proposals (switched off in the scenarios) |
| Assumptions | Every unsupported assumption and the experiment (E1-E11) that would test it |

Revenue lines are kept apart: **recurring revenue** (subscriptions), **one-time sales** (lifetime deals, never counted as recurring or in MRR/ARR), **cash collected** (what Whop actually settles, after refunds), **gross profit** (after model cost and payment fees), **operating profit** (after infra, support, marketing, referral).

## Actual prices and fees used
- Lite shown $20 (Whop bills **$19.99**), Plus **$44.99**, Pro shown $99 (Whop bills **$99.99**). The model bills what Whop bills. Free: 50 questions a day, free models only.
- Whop: 2.7% + $0.30 per domestic card payment; +1.5% international; +1% currency conversion; $15 per dispute (docs.whop.com/fees, 3 Oct 2026).
- OpenRouter: 5.5% fee on credit purchases; provider list prices from the repo's `docs/cost-model.md` and live roster.
- Vercel Pro $20/month and Neon are in fixed infra (see the compliance note in [BASELINE.md](BASELINE.md): payment-taking on Hobby is not permitted by Vercel's fair-use guidelines). **This is new spending; it was not purchased by this work.**

## Cost per successful task (routing in the repo)
Assumed tokens (unsupported, adjustable): prompt 640, panel output 900-1,600, x1.25 reasoning overhead. Extractor Luna, verifier gpt-oss-20b, synthesizer Gemini 3.8 Flash ($0.75/$3.75 per million), judge on 60% of complex questions.

| Question class | Provider cost per run |
|---|---|
| Simple (one model) | $0.00005 |
| Light-moderate | $0.00739 |
| Moderate | $0.00806 |
| Complex (5 models + judge) | $0.01852 |
| Mix 20/25/40/15% -> blended | $0.00786 |
| + 6% retries/failures | $0.00833 |
| **Per successful task (cost-per-task cell)** | **$0.00846, about 4.65 credits** |

Router-only estimates (panel + verifier + judge, without extractor and synthesis) are lower ($0.00121 moderate, $0.01427 complex); the model uses the fuller number. Images (High, wide) about $0.052 each; Deep Research about $2.40 a run, both metered separately for Plus/Pro in the scenarios.

**Free-user subsidy.** Free runs use free models, so provider cost is $0. The constraint is capacity, not dollars: about 6.5 free-model calls per question against 1,000 free-model calls a day gives **about 150 Free questions a day (~4,600 a month) for the whole product**. If Free demand exceeds that, the spreadsheet adds a cheap paid fallback at about $0.00068 per overflow question (Base: Free demand reaches 22% of capacity at month 12, 69% at month 24, passes 100% around month 27; Ambitious is at 155% already at month 12).

**Worst case per plan (a customer uses their whole allowance).** Lite 2,400 credits is at most $4.36 provider cost (about 516 tasks), leaving $14.79 (74%) of $19.99 before payment fees, refunds, support; Plus $10.91 max, about 1,289 tasks, margin $32.57 (72%); Pro $24.55 max, about 2,901 tasks, margin $72.44 (72%). Heavy users are not a loss at current prices; the unknown is how many customers pay and stay.

## Scenario inputs (all assumptions)
| | Conservative | Base | Ambitious |
|---|---|---|---|
| Qualified visits, month 1 | 500 | 1,500 | 4,000 |
| Monthly visit growth / cap | 6% / 40k | 10% / 120k | 14% / 400k |
| Visit -> account | 1.5% | 2.5% | 4% |
| Account -> activated | 35% | 45% | 55% |
| Activated -> paid | 2.5% | 4% | 7% |
| **Visit -> paid (product of the three)** | **0.013%** | **0.045%** | **0.154%** |
| Plan mix Lite / Plus / Pro | 65/28/7 | 55/35/10 | 45/40/15 |
| Monthly churn Lite / Plus / Pro | 12/8/6% | 9/6/4.5% | 7/5/3.5% |
| Refunds | 5% | 3% | 2% |
| Discounted share (20% depth) | 15% | 10% | 5% |
| Support minutes per customer (at $30/h) | 6 | 4 | 3 |
| Paid acquisition, referral, lifetime deals | off ($0) | off | off |

"Qualified visit" means a visit from the target audience that lands on a page where the product is demonstrated (for example /for-developers). Real values will come from /admin/growth.

## What each milestone requires (targets, not forecasts)
**When the scenarios reach it (month number, 60 months modelled):**
| Milestone | Conservative | Base | Ambitious |
|---|---|---|---|
| $1,000 MRR | not within 60 months | month 21 (~28 customers, ~10,100 visits/mo) | month 4 (~28 customers, ~5,900 visits/mo) |
| $10,000 MRR | not within 60 | month 44 (~258 customers, ~90,400 visits/mo) | month 16 (~243, ~28,500) |
| $100,000 MRR | not within 60 | not within 60 | month 33 (~2,369 customers, ~265,000 visits/mo) |
| $1M ARR run rate ($83,333 MRR) | not within 60 | not within 60 | month 31 (~1,821 customers, ~204,000 visits/mo) |
| $5M ARR run rate ($416,667 MRR) | not within 60 | not within 60 | month 57 (~8,831 customers, 400,000 visits/mo = the cap) |

**Steady state to hold that MRR (qualified visits per month needed just to replace churn):**
| Target | Customers (base) | New payers/mo (base) | Visits/mo Conservative | Base | Ambitious |
|---|---|---|---|---|---|
| $1k MRR | ~27 | 2 | 24,400 | 4,400 | 840 |
| $10k MRR | ~267 | 20 | 245,000 | 44,500 | 8,400 |
| $100k MRR | ~2,668 | 200 | 2.45M | 445,000 | 83,600 |
| $1M ARR | ~2,224 | 167 | 2.04M | 371,000 | 69,700 |
| $5M ARR | ~11,120 | 834 | 10.2M | 1.85M | 348,000 |

Growing +10% a month needs roughly 2.2x those base visit numbers. Annual results in the Base case: MRR at the end of year 1 $414, year 2 $1,492, year 3 $4,776, year 4 $14,824, year 5 $24,254; operating profit about $634 / $7,172 / $26,320 / $85,640 / $189,800 over the five years. In Ambitious, year 1 ends at MRR $6,149. **These are what the assumptions imply, not predictions.**

Reading: at the Base rate of 0.045% from qualified visit to paying customer, 100 paying customers needs about 222,000 qualified visits over time. That is why [the largest obstacle](BASELINE.md) is reachable audience, and why the first goal is to measure the real visit-to-paid rate with 500+ visits per channel before trusting any scenario.

## $1,000,000 a year in operating profit
Operating profit = recurring revenue - refunds - provider cost - payment fees - infrastructure - support - marketing - team cost. Using each scenario's unit economics (contribution per paying customer per month: $21.54 Conservative / $29.27 Base / $36.60 Ambitious, i.e. 66% / 78% / 83% of billed revenue):

| | Conservative | Base | Ambitious |
|---|---|---|---|
| **A. Founder pay excluded** (fixed costs ~$1,200/yr): paying customers | 3,873 | 2,851 | 2,280 |
| MRR / ARR run rate | $126k / $1.51M | $107k / $1.28M | $101k / $1.21M |
| New payers a month just to hold that base | 405 | 214 | 129 |
| Qualified visits a month to hold it | 3.09M | 475k | 84k |
| **B. With a small team** ($330k/yr team + $5k/mo marketing placeholder): customers | 5,381 | 3,961 | 3,168 |
| ARR run rate | $2.10M | $1.78M | $1.68M |

Case A is profit before any founder pay or tax. Case B uses a placeholder team cost that is an assumption, not a plan.

## The illustration
2,000 customers x $45 = $90,000 MRR = $1.08M ARR; 10,000 customers = $450,000 MRR = $5.4M ARR. These are **annualized run rates before expenses, not earnings**. At Base unit costs, operating profit would be roughly 78% of the run rate before acquisition cost, founder pay and tax (about $839k and $4.2M a year), and the traffic to get there is in the table above.

## Proposals costed (not enabled)
- **Referral reward:** 300 credits for each of the referrer and the new user, about $0.55 each at cost, max 5 rewarded referrals per referrer: about $5.45 per referrer, $6.82 with 25% allowance for abuse; a capped test of 50 referrers has maximum exposure of about **$341**. Needs eligibility rules (verified email, first answer completed, no self-referral) and the abuse controls in [SHARING.md](SHARING.md). Not enabled.
- **Lifetime deal:** $149 x 100 units = $14,900 one-time cash (never MRR). The obligation is about 100 x $1.34 x 36 months = $4,820 of provider cost plus support, break-even about 108 months of service. **Not recommended**; see [OFFER.md](OFFER.md).

## Unsupported assumptions and the experiment that tests each
Listed on the Assumptions sheet; the main ones: visits per month (E1 distribution test of demo clips, content), visit -> account and activation (E3, /admin/growth), activated -> paid and plan mix (E4/E5, first 10 paying customers), churn (E6, needs 3 months of payers), tokens per task and usage (E7), refunds/disputes/international share (E8), Free capacity (E9), support time (E10). Paid acquisition (E11) is a proposal only, until a budget, a loss limit and authorization exist.

## How to use or change it
Change blue cells on the Model sheet (scenario columns) and everything recalculates. Replace a yellow cell with a measured value and turn it green. The CSV is a snapshot of the Model sheet; edit the xlsx for live use. Rebuild scripts are not shipped; the formulas are readable in the sheet.
