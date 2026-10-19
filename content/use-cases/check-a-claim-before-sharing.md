---
title: Check a claim before you share it
description: Use a multi-model answer to find out whether a claim you saw online is plausible, where sources disagree, and which parts to verify before you repost it.
updated: 2026-10-19
keywords: fact check with AI, check if something is true, verify a claim, AI fact checker
related: /ai-fact-check, /blogs/how-to-check-an-ai-answer, /docs/how-it-works/verification-review
---

A surprising statistic, a quote attributed to a famous person, a health claim from a group chat: before you pass it on, it helps to check. AI can speed up the first pass, if you use it for what it is good at and keep the rest for yourself.

## What a first pass can tell you

- Whether the claim matches well-known facts or contradicts them.
- Whether it looks like a known myth, a misattributed quote or an outdated figure.
- What the original source might be and what kind of source would settle it.
- What questions the claim leaves open, such as the time period, the population or the definition of a term.

## What it cannot tell you

An assistant can be wrong about obscure or recent claims, and it can sound sure while it is. It may agree with the framing of your question. For that reason a check by AI is a start, not a verdict.

## A good way to ask

Paste the claim exactly as you saw it, say where you saw it, and ask for reasons it might be false:

```text
Claim: "[paste exactly]"
Seen on: [where]
Is this likely true, false, misleading or unknowable? List what supports it, what contradicts it, what context is missing, and what primary source would settle it. Do not invent sources.
```

## What Keplar adds

When several models from different families respond independently, a claim that is false or misleading often shows up as a split: one model recognizes the myth and another repeats it, or they disagree about the date. Keplar groups the responses into positions, shows how many models held each, and writes the answer so that dissent remains visible. A reviewer then compares the draft with the individual responses and may remove points the responses do not support.

Quotes and numbers are the common weak spot, and exact counting and arithmetic are computed by code. The Sources section lists links models cited, labeled "Cited by <model>; Keplar didn't open or check".

## What to do next

1. Read the Disagreements and Verification sections for what remained uncertain.
2. Open the primary source: the study, the transcript, the official statistic.
3. Check the date. Many viral claims are true of an earlier year.
4. If you cannot find a primary source, say "I couldn't verify this" when you share it, or don't share it.

## Where it falls short

In the browser, Keplar has no live web lookups for normal questions, so very recent events may be missing (the desktop app's Live Research, in beta, searches the web). It does not verify images, videos or screenshots for authenticity. And it shows no accuracy score: a consensus tells you the models agreed, not that the claim is true. The longer explanation is in [Why consensus can be wrong](/docs/how-it-works/why-consensus-can-be-wrong).

## Related

See the [AI fact check page](/ai-fact-check) and the [routine for checking AI answers](/blogs/how-to-check-an-ai-answer).
