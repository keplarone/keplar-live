---
title: The pipeline, end to end
description: The eight steps between your question and one answer: understand, select, compare, disagree, verify, synthesize, and answer, with where each can stop early.
order: 1
updated: 2026-10-03
keywords: Keplar-One, orchestration, pipeline, how Keplar works
related: /docs/how-it-works/question-understanding, /docs/how-it-works/routing-and-panels, /docs/how-it-works/synthesis
---

Keplar-One is the engine that runs between your question and the answer you read. This page is the map; each step has its own page.

## The steps

| Step | What happens | Where it can stop early |
|---|---|---|
| 1. Understand | A classifier reads the question: what kind of task, how complex, which capabilities it needs, whether media is attached | Small talk skips the rest |
| 2. Select | The router builds the smallest plan that fits: one model, or a panel plus a verifier, plus a judge on the hardest questions | If the plan exceeds your remaining allowance, the run stops before any model is called |
| 3. Capabilities | The app shows which kinds of capability were chosen (for example Reasoning or Coding) | Display only |
| 4. Compare | Each panel model answers independently. Keplar then groups the answers into positions and scores agreement | A model that times out or declines becomes a missing vote |
| 5. Disagree | If the positions differ, the disagreement is recorded with who said what | Skipped when there is one position |
| 6. Verify | A reviewer reads a draft synthesis against the individual responses and reports problems | Skipped for single-model answers |
| 7. Synthesize | The final answer is written from the positions, the claims and the reviewer's findings | If it fails, the positions are listed rather than one model's answer pasted in |
| 8. Answer | You get the answer, the six sections, and the credits used | |

## Three paths

**Simple.** One fast model answers. No panel, no review. The answer says no cross-model verification was needed.

**Moderate.** A small panel from different model families, plus a verifier. On paid plans a short single-topic question may get two models instead of three.

**Complex.** A wider independent panel (up to five models), a verifier, and a stronger judge that reviews the draft if the panel disagreed.

The Free plan caps the panel at three models and has no judge tier.

## What runs where

Your question goes to the model providers Keplar picked for it, through OpenRouter and, for some models, directly through OpenAI and NVIDIA. Keplar itself runs the classification rules, the router, the comparison and the guards (like the quality check and the removal of an invented "disagreement" section). The privacy side is in [How your data is handled](/docs/privacy-security/data-handling).

## Time budget

One latency budget is shared by the whole run. The panel may use a little over half of it; once enough models have answered, stragglers get a short extra window. Whatever is left is shared by classification, drafting, review and synthesis. A stage that runs out of time says so. See [Missing models and timeouts](/docs/how-it-works/missing-models-and-timeouts).

## Honesty guards

- The "Where the models disagree" section is removed in code if the comparison found only one position.
- A quality gate rejects obviously broken single-model output (loops, repeated chunks, gibberish) before you see it or are charged for it.
- If the comparison cannot be read, agreement is shown as "not scored" rather than guessed.
- Counting and arithmetic are computed by code and labeled as an exact check.

## Read next

[How Keplar understands a question](/docs/how-it-works/question-understanding), then [Which questions use more models](/docs/how-it-works/which-questions-use-more-models).
