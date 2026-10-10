---
title: Model families and diversity
description: Why a panel of models from different families is more useful than the same model asked three times, and what an open-weight seat is for.
order: 5
updated: 2026-10-03
keywords: model diversity, model families, open-weight models, independent models
related: /docs/how-it-works/routing-and-panels, /docs/reference/model-roster, /models
---

A panel is only worth its cost if its members can disagree for real reasons. Three copies of the same model are one opinion with three voices.

## Why families matter

Models from the same family share training data, methods and habits, so they tend to make the same mistakes. Models from different families (for example Google's Gemini, OpenAI's GPT, Alibaba's Qwen, NVIDIA's Nemotron, Mistral) learned from overlapping but not identical data with different methods. Their errors overlap less. That is the entire reason to consult more than one.

## What the router enforces

- **Family diversity.** On a multi-model plan, the router avoids seating two models from the same family when alternatives exist.
- **An open-weight seat.** Wide panels reserve a seat for an open-weight model where possible. Open-weight models have publicly released weights and are trained and tuned under different incentives than hosted-only models.
- **Vision-capable seats on media questions.** Diversity still applies among the models that can read images.

## What it cannot guarantee

Diversity reduces shared mistakes; it does not remove them. Most large models learned from much of the same public internet, so a widely repeated error can appear in every family. If all models answer the same wrong thing, Keplar will show a confident consensus. That is the central limit of the approach; see [Why consensus can be wrong](/docs/how-it-works/why-consensus-can-be-wrong).

## Why Keplar does not rely on temperature

Some frontier models reject or ignore sampling controls such as temperature and top_p. A design that depends on turning those dials would fail on those models. Keplar avoids sending parameters a model rejects, and varies the reasoning effort and the family instead.

## The roster changes

The set of models Keplar can use changes as providers release or retire models and as free models appear or disappear. The [Models page](/models) is generated from the product's own configuration, so it matches what the product uses. Free and paid plans use different rosters; see the [model roster reference](/docs/reference/model-roster).

## Practical consequences for you

1. For a question that matters, read the Models consulted section and note the families that responded.
2. If only one family responded, discount the agreement.
3. If the models split along family lines, ask a more specific follow-up that forces the reasoning into the open.
