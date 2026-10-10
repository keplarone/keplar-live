---
title: How Keplar understands a question
description: The classifier that decides task type, complexity and needed capabilities, what signals it uses, and why it is a transparent rule set rather than another model.
order: 2
updated: 2026-10-03
keywords: classifier, task classification, complexity, capabilities
related: /docs/how-it-works/which-questions-use-more-models, /docs/how-it-works/routing-and-panels, /docs/using-keplar/write-better-questions
---

Before any model is called, Keplar reads your question and produces a small description of it: the **kind** of task, its **complexity**, the **capabilities** it needs, a rough size estimate, and whether it asks for web access.

## What the classifier decides

- **Kind:** general, factual, writing, code, analysis, research, finance, strategy, creation or agent.
- **Complexity:** simple, moderate or complex.
- **Capabilities:** up to five chips such as Reasoning, Coding, Research, Finance, Market Analysis, Data Analysis, Regulatory, Risk, Writing, Creation, Planning, Vision and Verification. These are the chips you see appear while Keplar "selects intelligence".
- **Size estimate:** input and output tokens, used for the pre-run allowance check and for choosing models whose context window is large enough.

## Rule-based on purpose

At the time of writing the classifier is a set of transparent rules, not another AI call. It looks at keywords and phrases (for example words about code, money, strategy, research or regulation), the length of the question, attachments, and which modes you switched on. The rules are fast, cost nothing, and behave the same way every time. The trade-off is that they can misjudge a question that is phrased unusually: a short question can hide a hard problem. If you think a question was under-served, rephrase it with the context it needs, or choose [Most thorough](/docs/using-keplar/thoroughness-modes).

## Signals that raise complexity

| Signal | Effect |
|---|---|
| Longer questions (roughly over 18 words, and again over 60) | Adds to the score |
| Several capabilities needed at once | Adds to the score |
| Strategy, research, finance or agent tasks | Adds the most |
| Analysis or code tasks | Adds some |
| Deep Research switched on | Adds the most |
| A forecast ("will…", "by 2030") framed as analysis | Adds more, because independent models disagree most on forecasts |
| An attachment | Adds a little |
| A short, plain factual lookup | Pins the score to simple |

A score of 1 or more makes a question moderate; 3 or more makes it complex. The exact numbers can change; the page [Which questions use more models](/docs/how-it-works/which-questions-use-more-models) explains the practical effect.

## Floors: questions that are never left to one model

Two kinds of question are lifted to at least moderate whatever their score:

- **Error-prone questions:** counting, spelling, arithmetic, and requests for an exact figure, year or distance. See [Exact checks](/docs/how-it-works/exact-checks).
- **Images or video:** at least a small panel of vision models, so one model's misreading does not become the answer.

## Small talk

Greetings, thanks and short acknowledgements are detected before all of this and answered by a single free model with no panel and no credits. See [Small talk and simple questions](/docs/how-it-works/small-talk-and-simple-questions).

## What the classifier does not do

It does not judge whether your question is a good idea, and it does not fetch anything. It never sends your question anywhere to be classified; the rules run inside Keplar.
