# Offer review: plans vs the chosen segment and real costs

**Status: proposals for the founders to review. Nothing here changes live billing, prices, plans, or any existing customer's terms. No Whop plan or setting was modified (Whop was read with a read-only key).** Numbers come from [keplar-model.xlsx](keplar-model.xlsx); dated 3 Oct 2026.

## 1. Today's plans (verified in the repo and Whop)
| Plan | Shown | Whop bills | Allowance (repo: `orchestration/plans.ts`) | Provider budget cap per month |
|---|---|---|---|---|
| Free | $0 | - | 50 questions/day, free open models only, "limited consensus"; hosts may log prompts | $0 (capacity-bound) |
| Lite | $20 | $19.99 | 2,400 credits; 400 per 5 hours, 1,280 per week; premium models + consensus | $4.80 |
| Plus | $45 | $44.99 | 6,000 credits; 1,000/5h, 3,200/week; Deep Research, images, slides, sites | $12.00 |
| Pro | $99 | $99.99 | 13,500 credits; 2,250/5h, 7,200/week; video, advanced agents | $27.00 |
| Business | custom | - | contact | - |

One consensus task costs about **4.65 credits ($0.0085)**; so Lite's whole allowance is roughly 516 consensus tasks, Plus about 1,289, Pro about 2,901 (worst-case: every credit used on consensus).

## 2. Fit with the chosen segment (independent developers; job = pressure-test a technical decision)
- The job needs consensus on text questions, saved history and copy-paste output. It does **not** need images, video, slides or sites. So **Lite is the natural plan** for this segment; Plus bundles features the segment's job does not use, at 2.25x the price.
- The honest price comparison: ChatGPT Plus $20, Claude Pro $20, Google AI Pro $19.99 (late Sep 2026, vendors' pages); Lite matches that but is an *addition* to a subscription a developer probably already has. Whether a developer will pay a second $20 for a second-opinion layer is **unknown**: it is hypothesis H-pay in [EXPERIMENTS.md](EXPERIMENTS.md), tested with the first 10 paying customers and the research form's willingness-to-pay question, not by lowering prices.
- Unit economics are healthy even for heavy users (worst case Lite margin $14.79 = 74%; Plus $32.57; Pro $72.44 before refunds and support), so there is no cost reason to restrict or raise prices; the constraint is demand, not margin.

## 3. Proposals (each reviewable on its own)
**P1. Say the right plan at the limit (small change, no billing change).** The Free daily-limit message says "Upgrade to Plus for more" (observed live). For developers the next plan is Lite ($20). Proposal: message "Upgrade for more (Lite is $20/month)". File: `src/app/api/keplar/route.ts`, currently being edited by another workstream, so left as a follow-up.

**P2. Bounded-cost "try the premium panel" demo (no card, no billing change).**
- What: after email-verified signup, 25 one-time promo credits (about 5 premium consensus tasks).
- Cost: 25 x $0.00182 = **$0.046 per user**; capped at 300 grants a month = **$13.65 maximum**; stop when the cap is reached and say so plainly ("limited trial credits this month are used").
- Abuse: one grant per verified email and per payment-free account; the existing per-IP and daily limits apply; no stacking with referral.
- Why: shows the premium panel (where disagreement is most informative) before asking for $20. Success measure: trial users who then pay vs Free users who pay (needs 30+ trial users before any comparison).
- Not a time-limited card-on-file trial: that would be a billing change and a recurring-charge risk.

**P3. Heavy-user policy.** The 5-hour and weekly windows already stop runaway use. When the allowance is gone: fall back to Free models rather than a dead end, and show remaining credits and the reset time (already shown). Optional later top-up: 1,000 credits for $10 (cost $1.82 + payment fee about $0.57 = margin about $7.6). Only after at least one real customer asks; never auto-charged.

**P4. Promo credits and discounts.** Rule: no fake scarcity, no countdowns, no "was/now" pricing. A single plain founder discount of up to 20% for the first 3 months to research participants who agree to a follow-up (costed in the model at 20% depth for 5-15% of customers). Must be a real Whop coupon created by an owner; this work did not create one.

**P5. Annual plan (proposal).** Two months free (about 17% off): Lite $199.90, Plus $449.90, Pro $999.90 (Whop's cents pattern). Effects: earlier cash, lower churn, but it is a commitment to serve 12 months (provider max exposure at full use: Lite $52, Plus $131, Pro $295 per year per customer). Recommended only after month-3 retention exists. Annual cash counts as cash collected, **MRR = price/12**, not full-year revenue.

**P6. Refunds.** Keep a plain refund promise the founders can honor: e.g., full refund within 7 days of a first payment if the product was unusable. Whop handles disputes ($15 each); the model assumes 2-5% refunds. Decided Oct 3, 2026 and published in the Terms (Refunds): a full refund of the first payment if asked within 7 days, no proration later; see [../legal-open-decisions.md](../legal-open-decisions.md). The founders can still change it, but then the Terms must change too.

**P7. Lifetime offer.** **Not recommended.** $149 x 100 units = $14,900 one-time cash; the obligation is 100 users x about $1.34 provider cost per month x 36 months = about $4,820 plus support, break-even about 108 months; it can never be counted as recurring revenue, and it promises service for a product whose costs and models change. If the founders still want one: cap units, publish the obligation ("lifetime means as long as Keplar operates the plan, with fair use"), exclude from MRR.

**P8. Fix the Free capacity limit before growing.** The whole product shares roughly 150 Free consensus questions a day (see [MODEL.md](MODEL.md)). Options (decision for the owner): (a) a global daily Free-question budget with a plain message when it is used; (b) route overflow to a cheap paid model at about $0.00068-0.003 per question (Base cost at 10,000 overflow questions a month about $7-30); (c) move top-of-funnel use to the P2 trial. Recommended: (a) now, (b) when Free demand passes 50% of capacity (an alert is on the Dashboard roadmap).

**P9. Plan page copy for the segment (safe, no price change).** Under Lite add one line for this job ("Consensus on technical decisions, saved history, copy as Markdown") and keep the existing limits visible. The pricing page file is owned by the site workstream; hand-off in [COORDINATION.md](COORDINATION.md).

## 4. Things not to do
Do not change Whop prices or plans from this work; do not claim a discount that is not a real coupon; do not say "unlimited"; do not count one-time sales as MRR; do not offer lifetime access to bring in cash; no countdown timers.

## 5. Decisions needed
(1) Accept or reject P2 (trial credits) and its 300-grant cap. (2) Choose the Free-capacity approach (P8). (3) Refund wording (P6). (4) Whether to upgrade Vercel to Pro (compliance: payments on Hobby; $20/month) which the model already counts. (5) Whether a founder-discount (P4) is acceptable.
