---
title: The verification review
description: What the verifier or judge actually does: it reads the draft against each model's response and flags reasoning gaps, contradictions and unsupported claims. It does not browse or open sources.
order: 8
updated: 2026-10-03
keywords: verification, verifier, judge, contradiction, unsupported claim
related: /docs/how-it-works/synthesis, /docs/how-it-works/sources-and-citations, /docs/get-started/read-an-answer
---

"Verification" is easy to misread. Here is exactly what it is, and what it is not.

## What it is

For multi-model questions, a reviewer model reads two things together: the **draft synthesis** and the **individual responses**. The reviewer is the plan's verifier, or the judge when the panel disagreed and a judge was planned. It returns a short list of checks. Each check has:

- a **kind**: `reasoning` (a step that does not hold), `contradiction` (two statements that cannot both be true, within a response or between the draft and the responses) or `unsupported` (a claim some models made that the others did not support);
- a **finding**, in a sentence;
- the **models concerned**;
- an **outcome**: held, revised, removed, or kept as dissent;
- how the synthesis **resolved** it.

## What it is not

The verifier **does not fetch external sources**, does not open the links models cite, and does not look anything up. It weighs the evidence and reasoning that already exist inside the responses. That makes it a consistency and reasoning check, not a fact check. Keplar's pages say "weighs the evidence and reasoning behind each response" for exactly this reason.

## What you see

The Verification section lists the checks with their outcomes. For single-model answers it says no cross-model verification was needed. If the review failed or its output could not be read, the section says that. It is never presented as "all clear" by default.

## How findings change the answer

If the reviewer marks a claim as removed, the claim is taken out of the evidence the synthesis uses and the claim's support is recomputed. A claim kept as dissent stays in the answer, labeled as a minority view. A revised claim is rewritten before the final answer.

## Disputed claims

The reviewer also returns a short list of **disputed claims**: claims from minority positions or claims left unsupported. In a design that includes optional web checking, these are the only claims that would be looked up. Web checking is **off** today, so nothing is looked up and the product does not claim to check claims against sources.

## Cost and speed

The review is one model call. It is metered like every other call, and it shares the run's time budget. When time is short, the stage says so instead of being silently skipped.

## What this is good for

- Catching a step in a chain of reasoning that does not follow.
- Catching a draft that quietly contradicts one of the models.
- Catching a number or name that only one model asserted.

## What it is not good for

Facts that every model gets wrong, recent events, and anything that needs a live source. For those, follow the checklist in [Sources and citations](/docs/how-it-works/sources-and-citations).
