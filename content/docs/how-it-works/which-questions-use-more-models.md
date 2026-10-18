---
title: Which questions use more models
description: What makes Keplar consult one model, three or five: question type, stakes, attachments, Deep Research and thoroughness, with examples.
order: 3
updated: 2026-10-03
keywords: how many models, panel size, complex questions, forecasts, Deep Research, thoroughness
related: /docs/how-it-works/question-understanding, /docs/how-it-works/routing-and-panels, /docs/using-keplar/thoroughness-modes
---

Keplar does not ask every model every time. It spends models where a second opinion is most likely to change what you do. This page explains what pushes a question toward more models, with examples you can try.

## The three tiers

| Tier | Typical panel | Reviewer |
|---|---|---|
| Simple | 1 model | None |
| Moderate | 3 models from different families (2 for a short, single-topic question on paid plans) | A cheap verifier |
| Complex | Up to 5 models | A verifier, plus a stronger judge if the panel disagreed |

The Free plan never seats more than three models and has no judge tier. Your thoroughness setting moves each tier up or down; see [Thoroughness modes](/docs/using-keplar/thoroughness-modes).

## What makes a question simple

A short factual or well-defined request with no stakes in the wording: "What is the capital of Australia?", "Rewrite this sentence to sound friendlier", "Convert 5 miles to kilometers." One fast model is enough, and a second opinion would rarely change the result.

## What makes a question moderate

- It needs judgment or a trade-off: "Should I rent or buy?", "Is this email too blunt?"
- It is longer or has a few parts.
- It needs several capabilities at once, such as writing plus finance.
- It involves counting, arithmetic or an exact figure (always at least moderate).
- It includes an image or video.

## What makes a question complex

The strongest triggers are the kinds of question where independent models are most likely to disagree and where being wrong costs the most:

1. **Strategy and decisions.** "Should we enter the Japanese market?" "Should we hire before we raise?"
2. **Research and comparison.** Questions about evidence, the state of a field, or comparing alternatives.
3. **Finance.** Pricing, budgets, valuation, unit economics.
4. **Agent tasks.** Work that has several steps.
5. **Deep Research.** Turning it on adds a large amount to the score because the run is long and multi-step.
6. **Forecasts.** "What will AI regulation look like by 2030?" Models disagree most about the future, so forecasts framed as analysis are not answered by one model.

Length and the number of capabilities add to the score in every category.

## Examples

| Question | Likely tier | Why |
|---|---|---|
| What is the capital of Australia? | Simple | Short factual lookup |
| How many times does the letter r appear in "strawberry"? | Moderate, with a code check | Counting is error-prone |
| Write a polite note declining a meeting | Simple or moderate | Writing; length decides |
| Should I rent or buy a home this year? | Moderate | Trade-off, personal context |
| Compare three database options for a small SaaS and recommend one | Moderate to complex | Analysis plus trade-offs |
| Should we expand into Japan next year? Include regulatory risk. | Complex | Strategy, market, regulatory and risk capabilities together |

These are illustrations of the rules, not a promise: the classifier is rule-based and can misjudge an unusual phrasing.

## How to move a question up or down

- **Add the context** that makes it a decision: stakes, constraints, what you are choosing between.
- **Ask for the counterargument.** It does not change the tier, but it makes the models spend their answer on the weak points.
- **Choose Most thorough** when you want a wider panel on anything, including a simple question.
- **Choose Fastest** when speed matters more than a second opinion.
- **Turn on Deep Research** (Plus and above) for a long, multi-step investigation.

## Why not use five models for everything?

Cost and time. A multi-model answer makes several calls: the panel, a comparison step, a draft, a review and the synthesis. More models also means more chances that one is slow. Matching effort to the question is how Keplar keeps answers fast and credits useful.

## What more models does not buy you

More models improve your odds of seeing a disagreement. They do not guarantee a correct answer, and they cannot add facts that none of the models knows. See [Why consensus can be wrong](/docs/how-it-works/why-consensus-can-be-wrong).
