---
title: Small talk and simple questions
description: Why "hi" and "thanks" cost nothing, how Keplar detects casual chat, and what happens to short factual questions.
order: 13
updated: 2026-10-03
keywords: small talk, simple questions, no credits, single model
related: /docs/how-it-works/question-understanding, /docs/how-it-works/which-questions-use-more-models, /docs/billing-plans/credits-explained
---

## Small talk is detected first

Keplar checks whether a message is plain social chat before it classifies anything else. The check is conservative and works on whole phrases: greetings, thanks, "how are you", goodbyes, "who are you", and short acknowledgements, up to 60 characters and 8 words.

Anything with a question, a request, digits, code or links, attachments or media, or a mode switched on is not small talk and goes through the full engine.

## What small talk gets

- One free model, with a fallback to other free models and finally a static line.
- A short reply (capped at about 160 tokens).
- No panel, no verifier, no judge, no comparison section.
- **No credits on any plan.**

The reply is shown as plain text, without the consensus ring or the six sections.

## Short factual questions

A short, plain lookup such as "What is the capital of Australia?" is classed simple and goes to one fast model. There is no review step, and the answer says "No cross-model verification needed for this question."

If the question needs an exact figure, a count, or arithmetic, it is not left to one model; see [Exact checks](/docs/how-it-works/exact-checks).

## When you want a second opinion on something simple

Choose **Most thorough** in the options next to the composer. Simple questions then get a panel too. Or rephrase the question as a decision ("Which of these is more likely and why?"), which the classifier reads as analysis.

## Why this matters for credits

Casual messages cost nothing, and simple single-model answers are cheap, so the credits you pay for go to the questions where a panel helps. See [Credits explained](/docs/billing-plans/credits-explained).
