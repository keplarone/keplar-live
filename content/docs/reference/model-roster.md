---
title: The model roster and roles
description: How Keplar organizes the models it can call into families and roles (panelist, verifier, judge, vision seat), why the list changes, and where to see the current one.
order: 1
updated: 2026-10-03
keywords: AI model list, model families, panel, judge, verifier, open-weight models
related: /models, /docs/how-it-works/model-diversity, /docs/how-it-works/routing-and-panels
---

Keplar does not publish a fixed list of models on this page, because the list changes as providers release, retire and reprice models. The [models page](/models) is generated from the live catalog and is the place to look. This page explains what the catalog contains and how entries are used.

## What the catalog records for each model

- **Family and provider**, so the router can avoid seating several models from the same family.
- **Whether the weights are open**, so a panel can include an open-weight voice.
- **Capabilities**, such as coding, reasoning, long context, vision and speed.
- **Quality, reliability and latency estimates** used by the router's score.
- **Cost**, which is the denominator in that score and decides what Free can call (free models only).

## Roles

| Role | Job |
|---|---|
| Panelist | Answers the question independently |
| Verifier | Reviews the draft against the responses; chosen from a different family where possible |
| Judge | Breaks ties, writes the final synthesis; judge-tier model |
| Vision seat | A panelist that can read images or video frames |
| Stand-in | A backup started when a seat is slow, from another family, disclosed in the answer |

## Why the list changes

Models are added when they pass Keplar's checks and removed when providers retire them or their reliability drops. The router reads the catalog at runtime, so a change takes effect without a release.

## How to use the page

- To learn which models answered a question, open **Models consulted** under the answer.
- To learn which models exist in general, use [the models page](/models).
- To understand why they were chosen, see [Routing and panels](/docs/how-it-works/routing-and-panels).

## What the roster is not

It is not a ranking of models for your use, and it is not a leaderboard. Benchmarks vary by task and date. Treat any one model's reputation as one input, which is why Keplar asks several.
