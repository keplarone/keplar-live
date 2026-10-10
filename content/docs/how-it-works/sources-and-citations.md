---
title: Sources, citations and web lookups
description: What the Sources section really contains, why Keplar does not open or check the links, the status of web lookups, and a checklist for verifying what matters.
order: 12
updated: 2026-10-03
keywords: citations, sources, web search, hallucinated references, verify AI answer
related: /docs/how-it-works/verification-review, /docs/get-started/what-keplar-cannot-do, /blogs/how-to-check-an-ai-answer
---

## What the Sources section lists

URLs that the models themselves cited in their responses, collected from structured citations, markdown links and bare URLs. Each entry is labeled "Cited by <model>. Keplar didn't open or check this page." For counting and arithmetic, an "Exact check" line may appear when Keplar's code computed the value.

## What it does not do

- It does not claim the source supports the statement.
- It does not claim the page exists. Models sometimes produce references that look real and are not.
- It does not rank sources by quality.

## Web lookups today

The Web option in the composer is labeled as not live. Models answer from training. Keplar has an optional retrieval step designed to check **only disputed claims**, but it is switched off, so no search runs and the product makes no claim of source-checking. If that changes, these pages will be updated and dated.

## Why the distinction matters

"The models cited this" and "this was checked" are different statements. Mixing them up is how an AI product ends up implying verification it does not do. Keplar keeps the wording literal.

## A checklist for anything important

1. **Pick the facts the answer depends on.** Names, dates, numbers, quotes and references.
2. **Open every link** you plan to rely on and read the sentence that is supposed to support the claim.
3. **Prefer the primary source:** the agency, statute, manufacturer, dataset or textbook.
4. **Check the date** of anything that changes: versions, prices, rules.
5. **Ask again a different way**, or use Most thorough, and look at whether the models still agree.
6. **Bring in a professional** for health, legal or money decisions.

```text
Prompt to get a better trail from any model:
List the three factual claims your answer depends on most, say how sure you are of each,
and name the kind of primary source I should check for each one.
```

## For researchers

Use Keplar to map the positions on a question and to find the claims that only one model made. Then do the verification yourself. The [Study mode](/docs/using-keplar/study-mode) answers from your own material and gives page references from the document you uploaded, which is a different, more checkable relationship than answers from model memory.
