---
title: Free plan limits and behavior
description: Up to 50 questions a day, free open models only, the three-model cap, stand-ins when models are busy, refunded daily counts and what Free cannot do.
order: 4
updated: 2026-10-03
keywords: Keplar free plan, free AI models, daily limit, fair use
related: /docs/how-it-works/missing-models-and-timeouts, /docs/privacy-security/free-plan-privacy, /docs/billing-plans/plans-compared
---

Free is real Keplar on free open models, funded by Keplar, with limits that keep it sustainable.

## The daily allowance

Up to **50 questions a day** under fair use. The count is exact and is refunded when a question produces no answer, so a failure does not eat your allowance. Small talk is free and does not count as a question in the way a full answer does. The count resets daily.

## Free open models only

Free requests go only to models that cost nothing to call, through one provider route. The router refuses any call to a model with a nonzero price, and a hard guard in the provider layer refuses it again. Free never falls back to a paid model.

## Panel cap

Free panels have at most **three** models, and there is no stronger judge tier. Counting, arithmetic and exact-fact questions still get a small panel within that cap.

## Busy models

Free models are rate limited upstream. A free call is not retried on the same model; it moves to another free model. When a seat is slow, Keplar may start a stand-in from another family, and says so in the answer. If every free model is busy, you see: "The free models are busy right now. Try again in a minute, or upgrade to Lite for the paid model panel."

## Image and video questions

Free supports image and video questions on free vision models. If none is available, you get a clear message and nothing is sent.

## What Free does not include

Deep Research, web lookups, premium models, the slideshow creator, video generation, custom domains, connected apps and agents. Study mode is included with smaller limits and free models.

## Privacy trade-off

Hosts of free models may log prompts, and some may use them to improve their models. Do not put sensitive information in a Free question. See [Free plan privacy](/docs/privacy-security/free-plan-privacy).

## When you reach the daily limit

You see a message that names the next steps: wait for the reset, or move up to Lite and then Plus. See [When you reach a limit](/docs/billing-plans/when-you-reach-a-limit).
