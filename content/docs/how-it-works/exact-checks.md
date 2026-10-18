---
title: Exact checks for counting and arithmetic
description: Why counting letters and doing sums are risky for language models, and how Keplar computes them with code and passes the result to the models as a verified fact.
order: 11
updated: 2026-10-03
keywords: counting letters, arithmetic, strawberry, exact check, calculator
related: /docs/how-it-works/question-understanding, /docs/how-it-works/which-questions-use-more-models, /docs/how-it-works/sources-and-citations
---

Language models read text as tokens, not letters, and generate answers one piece at a time. That makes some simple-looking tasks unreliable: counting how many times a letter appears, spelling backwards, long arithmetic. Keplar handles these with code.

## What Keplar treats as exact

The classifier flags two kinds of question as error-prone:

- **Exact:** counting and arithmetic, such as letter counts, totals, vowel counts, expressions using `+ - * / ^ ( ) %`, and "N% of M".
- **Fact:** a precise number, year, date, size or distance ("what year", "how tall", "population of").

## What happens

1. The question is never left to a single model. It gets a small panel plus a check (on Free too, within the three-model cap).
2. For counting and arithmetic, Keplar's own code computes the result.
3. That result is placed in the models' prompt as a **verified fact**, so they explain it rather than guess it.
4. Under the answer, Sources lists an **Exact check** line saying the value was computed by Keplar's own code.

```text
Question:  How many times does the letter "r" appear in "strawberry"?
Computed:  3   (checked by code, not by a model)
```

That example shows the shape of the feature; the live answer text is written by the models around the computed value.

## What it does not cover

Only clearly countable or computable questions are handled this way. Anything else is untouched. The "fact" category (a year, a distance) gets the extra panel but not a code computation, because code has no way to know the true value. For those, a primary source is the check.

## Why not give every question a calculator?

Because nearly every question is not a calculation, and a false positive would change an answer that was right. The rule set is deliberately narrow.

## A caution from testing

On 3 October 2026 a letter-counting question on the Free plan was classed as simple and sent to a single model, which gave a wrong count, before this check was extended to cover it. The check exists because that failure is real. If you find a counting or arithmetic question that still gets a wrong answer, please send it to team@keplar.one.
