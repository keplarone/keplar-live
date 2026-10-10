---
title: Agreement and the consensus level
description: How Keplar groups responses into positions, weights them by support, and turns that into a consensus level, and what the number does and does not mean.
order: 6
updated: 2026-10-03
keywords: consensus, agreement score, positions, evidence-weighted, consensus level
related: /docs/how-it-works/disagreement-detection, /docs/how-it-works/why-consensus-can-be-wrong, /docs/get-started/read-an-answer
---

"Consensus" in Keplar means one specific, limited thing: how much the models that responded agree with each other. It is not a probability that the answer is right.

## From responses to positions

After the panel answers, one classification call reads the responses and does three things:

1. Labels each response as answered, declined or off-topic. Declines become missing votes.
2. Groups the answered responses into **positions**: a short label and a one-sentence summary for each distinct stance.
3. Extracts up to eight load-bearing **claims** and records which responses make each one.

If that output cannot be read reliably, agreement is shown as **not scored**. Keplar does not fill the gap with a guess.

## Weighting by support

Each position is weighted by how well supported its claims are across the responses, not simply by how many models hold it. A position backed by claims several models make independently counts for more than one resting on a claim only one model made. This is why the final level can differ from a naive head count.

## The levels

| Level | Meaning |
|---|---|
| Consensus | The positions agree strongly once weakly supported claims are set aside |
| Partial | The models mostly agree but one or more meaningful differences remain |
| No majority | The models are split without a dominant position |
| Not applicable | A single model answered, so there was nothing to compare |
| Not scored | The comparison could not be read reliably |

Internally these map to a score with cut-offs (a score of about 80 and above is consensus, about 60 and above is partial). The thresholds can change, so the app shows the level and the counts rather than a number.

## Counts, not a percentage

Under the answer you see how many models agreed, how many disagreed and how many responded. Keplar chose counts over a percentage because a percentage looks like a measure of truth. Three of three is not three times as true as two of three, and neither is a statement about the world.

## Missing votes are not dissent

A model that times out, fails or declines is excluded from the comparison, and the answer says "n of m responded". It is never counted against the answer. See [Missing models and timeouts](/docs/how-it-works/missing-models-and-timeouts).

## How to use the number

- **Strong agreement from different families** is mild reassurance on a question where models are likely to know the answer.
- **Strong agreement on a recent or niche fact** deserves suspicion; models share training gaps.
- **A split** is the most useful result: it tells you exactly what to check. Read [Disagreement detection](/docs/how-it-works/disagreement-detection).
