---
title: Disagreement detection
description: How Keplar finds where models split, how the Disagreements section is built, why it appears only when the split is real, and how to use it.
order: 7
updated: 2026-10-03
keywords: disagreement, minority opinion, positions, where the models disagree, counterargument
related: /docs/how-it-works/agreement-and-consensus, /docs/how-it-works/verification-review, /docs/how-it-works/synthesis
---

The disagreement section is often the most valuable part of an answer. It tells you where the answer is soft.

## What counts as a disagreement

A disagreement exists when the comparison found **more than one position**: two or more distinct stances on the question, each held by at least one responding model. Different wording or different level of detail is not a disagreement. Different conclusions, different recommendations, or different factual claims are.

## What the section contains

For each disagreement, Keplar records:

- the **topic** the models split on;
- the **positions**, each with a short label and a one-sentence summary;
- **which models** took each position;
- a one-line **resolution**: how the final answer handled it.

The synthesis also writes a "Where the models disagree" passage in the answer text, so you do not have to open the section to learn about it.

## It is not invented

Writing models like to produce a tidy "points of view" paragraph even when there is none. Keplar blocks this in code. After synthesis, the heading and text of a disagreement section are removed unless the comparison found at least two positions. Sections you asked for yourself (a counterargument, or "where economists disagree") are never touched.

## Minority positions

Keplar does not treat a majority as correct. The reviewer and the synthesizer weigh the evidence and reasoning behind each position, and a minority can win if its reasoning holds and the majority's does not. When a minority view is rejected, the answer says why. When it is kept, it is labeled as dissent.

## Why a missing model is not a disagreement

If a model times out or declines, nothing is learned about its position. It is a missing vote, shown separately. See [Missing models and timeouts](/docs/how-it-works/missing-models-and-timeouts).

## Using a disagreement

1. **Read the positions and their reasons.** The reasons are what you can check.
2. **Find the hinge.** Most splits turn on one assumption or fact ("depends on interest rates", "depends on how many users").
3. **Ask a narrower follow-up** about the hinge, for example "Assume the budget is fixed at $500. Which position holds?"
4. **Check the one fact** that decides it at a primary source.

## When you see none

No disagreement section means the models that responded took one position. It does not mean the answer is verified. If the stakes are high, ask for the strongest counterargument explicitly: "Give the best case against your recommendation."
