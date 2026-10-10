---
title: Answer sections reference
description: A compact reference for every field of a Keplar answer: consensus level, models consulted, sources, disagreements, verification outcomes and reasoning summary.
order: 2
updated: 2026-10-03
keywords: consensus level, models consulted, verification outcomes, answer fields
related: /docs/get-started/read-an-answer, /docs/how-it-works/agreement-and-consensus, /docs/how-it-works/verification-review
---

For a guided tour, read [Read a Keplar answer](/docs/get-started/read-an-answer). This page is the lookup table.

## Consensus levels

| Level | Meaning |
|---|---|
| Consensus | Most or all models answering held the same position |
| Partial | A majority position with at least one different view |
| None | Models split with no clear majority |
| Single | Only one model answered, so there is nothing to compare |
| Unscored | Agreement was not measured, for example for exact-check or small-talk answers |

Agreement is shown as counts ("4 of 5 models") rather than percentages. A missing model is not counted as disagreement. Internal thresholds of roughly 80 and 60 percent separate the levels. There is no confidence or accuracy score.

## Sections

| Section | Contents | Appears |
|---|---|---|
| Consensus | The level and who held which position | Multi-model answers |
| Models consulted | Models that answered, any that failed or timed out, stand-ins | Always |
| Sources | Links models cited, labeled "Cited by <model>; Keplar didn't open or check" | When models cited any |
| Disagreements | The positions that differed and the reasoning for each | Only when there is more than one position |
| Verification | What the reviewer or judge examined | When a review ran |
| Reasoning summary | Short explanation of how the answer was formed | When provided |

## Verification outcomes

| Outcome | Meaning |
|---|---|
| Held | The point stayed in the draft after review |
| Revised | The point was changed |
| Removed | The point was dropped as unsupported |
| Kept as dissent | The point was kept and attributed to a minority |

Issue kinds are reasoning problems, contradictions between responses, and unsupported claims. Verification reads the draft against the models' responses. It does not open sources.

## Other fields you may see

- **Thoroughness** in effect: Automatic, Fastest, Balanced or Most thorough.
- **Exact check** marker for computed answers.
- **Notes** when an attachment could not be read or a model failed.
