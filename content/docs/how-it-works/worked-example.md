---
title: A worked example, step by step
description: An illustrative walk through one decision question to show what each stage contributes. The numbers are examples, not a recorded run.
order: 15
updated: 2026-10-03
keywords: example, walkthrough, how Keplar answers a question
related: /docs/how-it-works/pipeline-overview, /docs/how-it-works/disagreement-detection, /docs/get-started/read-an-answer
---

:::note
This page is an illustration written to explain the stages. It is not a transcript of a real run, and the model behavior shown is simplified. To see a real run, ask your own question and open the sections under the answer.
:::

## The question

"Should a two-person startup rewrite a working Node.js backend in Rust before it has paying customers? Give the strongest counterargument too."

## 1. Understand

The classifier sees "should", "startup" and a decision about a technology stack. Kind: strategy. Capabilities: Reasoning, Risk, perhaps Coding. Complexity: moderate to complex, because strategy tasks add the most to the score. The plan: a panel of different families, a verifier, and a judge in case of a split.

## 2. Select

The router seats models from different families, one of them open-weight, estimates the cost, and confirms it fits your remaining allowance.

## 3. Compare

Each panel model answers independently. Suppose they produce these stances:

| Position | Summary | Held by |
|---|---|---|
| Do not rewrite | A rewrite before customers delays learning and adds risk; ship the product | Most models |
| Rewrite only a hot path | Keep Node, move only a measured bottleneck to Rust later | One model |

The comparison step would record two positions, mark the claim "rewrites delay customer learning" as widely supported, and the claim "a measured hot path is the exception" as supported by one.

## 4. Disagree

Two positions means a disagreement is recorded: topic "whether any Rust work is justified now", with the models listed under each position.

## 5. Verify

The judge reads the draft against the responses. It notes that the "Rust is always faster" claim in one response is unsupported by the others and has no numbers, so it is removed from the evidence; the hot-path point is kept as dissent with its condition ("only if a measurement shows a bottleneck").

## 6. Synthesize

The final answer recommends not rewriting, explains the reasoning, labels the strongest counterargument as such, and includes a "Where the models disagree" passage about the hot-path exception, with the condition that would change the recommendation.

## 7. What you would see

- A written answer with a clear recommendation and the counterargument.
- Consensus: partial or consensus, depending on how the positions weigh, with counts of agreeing and disagreeing models.
- Models consulted: each model, its role and status.
- Disagreements: the hot-path position and its resolution.
- Verification: the removed claim and the kept dissent.

## What this example cannot tell you

Whether the recommendation is right for your team. That depends on facts about your product and market that only you know. Keplar's job is to put the trade-offs and the points of disagreement in front of you.
