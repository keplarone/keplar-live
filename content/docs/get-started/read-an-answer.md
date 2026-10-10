---
title: Read a Keplar answer
description: A tour of the six sections under every multi-model answer, what each one means, and what it does not mean.
order: 3
updated: 2026-10-03
keywords: consensus, models consulted, disagreements, verification, reasoning summary
related: /docs/reference/answer-sections, /docs/how-it-works/agreement-and-consensus, /docs/how-it-works/disagreement-detection
---

Every multi-model answer has the written answer on top and up to six expandable sections underneath. The sections are the audit trail. They exist so you can decide how much weight to give the answer.

## The written answer

The answer is the synthesis: Keplar's attempt to give you the best-supported position, with the reasoning, in plain language. When the models split, the synthesis weighs the evidence and reasoning behind each side instead of counting heads, and it may side with a minority if the reasoning is stronger. If there was a split, a section called "Where the models disagree" appears in the text.

## Consensus

Shows how many of the models that responded took the same position, once weakly supported claims were set aside. The level can be **consensus**, **partial**, **no majority**, **not applicable** (a single model answered) or **not scored** (the comparison could not be read reliably, so Keplar does not guess).

:::warning
Consensus is agreement between models. It is not a measure of how likely the answer is to be right. Models trained on similar data can share the same mistake.
:::

## Models consulted

Lists every model that ran, its role (panel, verifier or judge), and its status: responded, timed out, declined or failed. If a model was swapped in for a slow one, it appears under its own name with a note. A model that did not respond is shown as missing, never as dissent.

## Sources

Lists links that models cited in their responses, each labeled with the model that cited it. Keplar has not opened or checked these pages. Treat them as leads to follow, not as evidence Keplar verified. For counting and arithmetic, an "Exact check" line may appear when Keplar's own code computed the result.

## Disagreements

Appears only when the comparison found more than one position. Each disagreement lists the competing positions, which models took each, and a one-line resolution. See [Disagreement detection](/docs/how-it-works/disagreement-detection).

## Verification

Summarizes what the reviewer found when it read the draft against the individual responses: reasoning steps that did not hold, contradictions, and claims only some models supported, each with how the final answer handled it. For single-model answers it says no cross-model verification was needed. If the review failed, it says so rather than reporting all clear.

## Reasoning summary

A short account of how the answer was reached: what the question needed, what the models agreed on, and what the synthesis decided. It is a summary written for you, not a raw transcript of any model's private reasoning.

## A reading order that works

1. Read the answer.
2. Look at the agreement count and who is missing.
3. If there is a disagreement, read it before acting on the answer.
4. Open Sources only if you intend to follow a link, and open the link yourself.
