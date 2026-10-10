---
title: Routing and panels
description: How the router picks models: quality, reliability, speed and cost, family diversity, an open-weight seat, vision requirements and your plan.
order: 4
updated: 2026-10-03
keywords: router, panel, model selection, cost-aware routing, model families
related: /docs/how-it-works/model-diversity, /docs/reference/model-roster, /docs/how-it-works/missing-models-and-timeouts
---

The router turns the classifier's description into a plan: which models to call, in what role, and with what budget.

## What the router scores

Each model that is allowed for your request is scored on quality for the task, reliability, latency and cost, roughly quality times reliability times speed, divided by cost. "Allowed" means it passes a set of filters first:

- **Your plan.** Free requests are limited to free open models. Paid plans can use the full roster.
- **Context size.** The model's context window must fit your question, history and expected answer.
- **Vision.** If you attached images or video frames, only models that can read images may take a panel seat.
- **Privacy tier.** For requests that must avoid provider retention, models that require retention are excluded.
- **Exclusions.** A model family can be excluded by a routing preference.

## The smallest plan that fits

| Complexity | Plan |
|---|---|
| Simple | One fast, inexpensive model; no verifier |
| Moderate | A small panel from distinct families and a cheap verifier |
| Complex | A wider independent panel, a cheap verifier, and a stronger judge that runs only if the panel disagreed |

The thoroughness setting nudges these: **Fastest** shrinks panels, **Most thorough** adds one model and gives simple questions a panel. See [Which questions use more models](/docs/how-it-works/which-questions-use-more-models).

## Roles

- **Panel:** answers the question independently.
- **Verifier:** a cheaper model that reads the draft synthesis against the individual responses.
- **Judge:** a stronger model that does the review (and the drafting and final write-up) on complex questions, or when the panel split.
- **Fast or fallback:** a quick model for simple questions and for stepping in when another fails.

You can see each model's role under Models consulted.

## Independence comes from different families

Temperature and similar controls are not reliable ways to make a model "think differently", and some modern models ignore or reject them. Keplar gets independence by mixing model families and varying reasoning effort rather than asking one model three times. See [Model diversity](/docs/how-it-works/model-diversity).

## Budget check before anything runs

Before a run starts, the router's cost estimate is compared with your remaining allowance. If it will not fit, the run stops with a limit message before any model is called. Keplar does not quietly switch you to a cheaper model when an allowance runs out. See [When you reach a limit](/docs/billing-plans/when-you-reach-a-limit).

## Fallbacks

If a request to a provider fails with a rate limit or a server error, it is retried with backoff and then sent through another route when one exists. A refusal is not retried elsewhere; it becomes a missing vote. See [Missing models and timeouts](/docs/how-it-works/missing-models-and-timeouts).

## What you control

You cannot pick the models today. You can choose how thorough the answer should be and switch on Deep Research. The roster itself is on [Models](/models) and described in the [roster reference](/docs/reference/model-roster).
