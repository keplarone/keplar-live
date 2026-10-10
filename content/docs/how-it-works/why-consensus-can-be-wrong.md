---
title: Why consensus can be wrong
description: The limits of agreement between models: shared training data, shared blind spots, stale knowledge and leading questions, and what to do about each.
order: 14
updated: 2026-10-03
keywords: consensus wrong, hallucination, shared errors, stale knowledge, AI accuracy
related: /docs/how-it-works/model-diversity, /docs/how-it-works/sources-and-citations, /blogs/can-you-trust-ai-consensus
---

Keplar shows when models agree. That is useful and also easy to over-read. Here are the ways agreement can mislead, and what helps.

## 1. Shared training data

Most large language models learned from overlapping slices of the public internet. A mistake repeated widely online, a popular myth, or an outdated rule can appear in every model. Diversity of families reduces this; it cannot remove it.

## 2. Shared knowledge cut-off

Models have a date after which they know nothing. Several models can agree on a version number, a price or a law that has since changed. Keplar does not browse today, so it cannot correct this. In a test on 3 October 2026, models answered a question about a current software release with older versions.

## 3. Leading questions

If your question presupposes something false ("Why is X better than Y?"), models tend to go along with it. Ask neutral questions: "Compare X and Y on cost and reliability. Which would you choose and why?"

## 4. Majority is not evidence

Two models repeating the same weak reason are not stronger than one model with a good reason. Keplar weighs reasoning rather than headcount, but it can only weigh what the models say.

## 5. Plausible, confident wording

Language models write fluently when they are wrong. An answer that reads well is not thereby correct. This is why Keplar shows no confidence score: any number would look more authoritative than it is.

## What helps

- **Ask for the case against.** "What is the strongest argument against your recommendation?"
- **Ask for the hinge.** "What single fact would most change this answer?" Then check that fact.
- **Date-sensitive? Use a primary source.** See [Sources and citations](/docs/how-it-works/sources-and-citations).
- **Read who responded.** If only one family answered, discount the agreement.
- **Use disagreement.** When models split, you know where to look. When they do not, you know less than it seems.

## What Keplar does and does not claim

Keplar claims to compare several models, to show you where they differ, and to weigh the reasoning in their answers. It does not claim that agreement proves an answer is correct, that its reviewer checks facts, or that it checks sources.
