---
title: Missing models, timeouts and stand-ins
description: What happens when a model is slow, refuses or fails: why it is never counted as disagreement, how stand-ins work on Free, and how to retry with all models.
order: 10
updated: 2026-10-03
keywords: timeout, model failed, stand-in, retry, free models busy
related: /docs/how-it-works/agreement-and-consensus, /docs/billing-plans/free-plan-limits, /docs/reference/error-messages
---

A multi-model answer depends on several providers being up and quick. Sometimes one is not. Keplar's rule is simple: an absence is never evidence.

## The shared time budget

A run has one latency budget (60 seconds by default). The panel may use a bit over half of it. Once a quorum has answered (at least two models and at least half the panel), models still working get a short extra window: the longer of six seconds or three quarters of the time taken so far. A model that misses its window is a **timeout**. Classification, drafting, review and synthesis then share what remains, each with a small minimum. A stage that runs out of time says so.

## What a missing model looks like

Under the answer, a plain sentence such as: "2 of 3 models answered (A and B). C ran out of time. It is not counted as a vote for or against the answer." A **Retry with all models** button re-runs the question.

| Event | Shown as | Counted as dissent? |
|---|---|---|
| Timeout | Missing | No |
| Refusal or decline | Missing | No |
| Provider error | Missing | No |
| Off-topic response | Missing | No |
| A different stance | A position | Yes, as a disagreement |

## Stand-ins on the Free plan

Free-model hosts are rate limited and can stall. On Free, if one model has answered and another seat is still silent after about half the first answer time (and at least three seconds), Keplar starts a different free model in parallel. Whichever answers first fills the seat. The answer then lists it under its own name with a note such as "Stood in for X, which was slow to answer." Paid plans do not do this, because a second paid call costs real money; they use fallbacks instead.

If every free panel model is busy you see: "The free models are busy right now. Try again in a minute, or upgrade for the paid model panel."

## Retries and fallbacks

A rate limit (429) or server error (5xx) is retried with backoff, honoring the provider's Retry-After header. If retries fail, the request goes to another route when one exists. A refusal is not retried elsewhere.

## Failed calls and credits

Failed calls count nothing. A run that produces no reliable answer is not charged. Costs are recorded from what providers actually billed.

## Why it matters

If missing votes counted as dissent, a slow server could turn a consensus into a false split. If they were ignored silently, you could believe three models agreed when two answered. The answer states who answered.
