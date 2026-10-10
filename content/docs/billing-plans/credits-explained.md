---
title: Credits explained
description: What a Keplar credit is, what costs more or less, how credits are counted from real provider charges, and what does not use credits.
order: 2
updated: 2026-10-03
keywords: Keplar credits, Keplar Usage, usage meter, credit cost
related: /docs/billing-plans/usage-windows, /docs/billing-plans/plans-compared, /docs/billing-plans/when-you-reach-a-limit
---

Keplar measures use in **credits** (also called Keplar Usage). You see a meter, a level (Low, Moderate, High or Very high) and a reset date. You never see tokens or dollars.

## What a credit is

One credit is a small slice of provider cost. Costs are recorded from what providers **actually billed** for the call, plus a small meter margin. Where a provider reports no cost, a catalog estimate is used. Failed calls count nothing, and the judge counts only if it ran.

## Relative cost

| Activity | Cost level |
|---|---|
| Small talk | None |
| Simple answer (one model) | Low |
| Consensus answer (panel, review, synthesis) | Moderate to high |
| Deep Research | High |
| Video generation | Very high |
| Agents | Metered per run and per model call |
| A connected-app tool call | About 1 credit |

A consensus answer makes several calls: the panel, a classification of the responses, a draft, a review and the final write-up. Wider panels and longer answers use more.

## Before a run starts

Keplar estimates the cost and checks it against your remaining allowance. If it will not fit, the run stops before any model is called. There is no silent fallback to cheaper or free models. In Create, the estimate is shown before you approve.

## Monthly credits and windows

Paid plans have a monthly allowance that resets with your billing period, plus a rolling 5-hour limit and a weekly limit that stop a burst of use from emptying the month in an afternoon. See [Rolling usage limits](/docs/billing-plans/usage-windows). The numbers per plan are in [Plans compared](/docs/billing-plans/plans-compared).

## Deep Research estimate

A typical Deep Research run is estimated at about 1,200 credits. The composer shows how many runs your remaining allowance covers.

## What does not use credits

- Small talk ("hi", "thanks").
- Signed-in memory extraction.
- Runs that fail or return no reliable answer.
- Creating the discovery questions in Create.
- Changing a site's style.

## Where to see your balance

In the app's usage meter and in Account. The reset date shown is your billing-period end.

## Free

Free does not use credits. It is limited by a daily question allowance and a three-model panel cap. See [Free plan limits](/docs/billing-plans/free-plan-limits).
