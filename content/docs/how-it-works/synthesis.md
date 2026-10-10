---
title: How the final answer is written
description: The draft, review and final synthesis steps: weighing evidence over headcount, keeping minority views honest, and what happens if synthesis fails.
order: 9
updated: 2026-10-03
keywords: synthesis, final answer, judge, draft, weigh evidence
related: /docs/how-it-works/verification-review, /docs/how-it-works/disagreement-detection, /docs/how-it-works/pipeline-overview
---

Synthesis is the step where several responses become one answer. Done badly it averages everyone into mush or quietly copies the loudest model. Keplar's design tries to avoid both.

## The sequence

1. **Draft.** A stronger "judge-tier" model writes a draft from the **positions and claims** (with how many responses support each), not from raw transcripts. When little time is left, a structured draft is produced instead of prose.
2. **Review.** The verifier, or the judge when the panel split, reads the draft against the individual responses. See [The verification review](/docs/how-it-works/verification-review).
3. **Final answer.** The judge-tier model writes the answer from the positions, the claims and their support, the reviewer's findings and the draft.

## The rules the synthesizer follows

- **Weigh evidence and reasoning, not headcount.** A position held by one model with good reasons can outweigh two with weak ones.
- **Show disagreement only when it exists.** A "Where the models disagree" section is written only if there was a split, and removed in code otherwise.
- **Label counterarguments.** If you asked for the best case against something, that section is labeled as a counterargument, not presented as Keplar's own view.
- **Return a one-line resolution** for each disagreement, used in the disagreement readout.
- **Do not invent sources.** Only links the models cited are listed, labeled as cited by them.
- **Do not claim certainty it lacks.** No confidence score or accuracy figure is produced.

## If synthesis fails

If the final write-up cannot be produced, Keplar lists the positions the models took. It does not paste one model's response verbatim as if it were the combined answer.

## Streaming

The answer is generated as a whole and then streamed to the page in chunks, so it appears progressively. True token-by-token streaming from the model is not in place today.

## Quality gate

Before a single-model answer is shown or charged, a quality check rejects obvious failures such as repeated chunks, loops, a high ratio of non-words, or incoherent windows of text (code, JSON and non-English text are skipped). A rejected answer falls back to the next model. If every answer fails, you see "Keplar couldn't produce a reliable answer this time, and nothing was charged. Please retry."

## What synthesis cannot do

It cannot add knowledge the models lack, and it cannot make a wrong consensus right. It can only organize, weigh and present what they said, plus the review.
