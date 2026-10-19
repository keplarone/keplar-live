---
title: What are AI hallucinations, and how do you spot them?
metaTitle: What are AI hallucinations, and how to spot them
description: Why language models invent plausible but false details, which situations make it more likely, how to recognize it, and practical ways to reduce the risk.
category: Trust and accuracy
published: 2026-10-03
updated: 2026-10-03
keywords: AI hallucination, ChatGPT makes things up, fake citations, LLM errors, confabulation
related: /ai-fact-check, /blogs/how-to-check-an-ai-answer, /docs/how-it-works/why-consensus-can-be-wrong
---

An AI "hallucination" is output that sounds right but is not: an invented citation, a made-up statistic, a function that does not exist, a quotation nobody said. The word is borrowed and slightly misleading, because the model is not perceiving anything. It is generating text that is statistically plausible given its training, whether or not it is true.

## Why it happens

A language model is trained to predict likely next pieces of text. It does not hold a database of verified facts to look up. When it has seen a pattern many times, its output tends to be right. When it is asked about something rare, recent, ambiguous or absent from its training, it can still produce fluent text that fits the pattern of an answer. There is no built-in alarm that rings when it is guessing. Techniques that make models more cautious reduce the problem, but they do not eliminate it.

## Situations that raise the risk

- **Obscure specifics:** a minor historical figure, a niche regulation, a small company's details.
- **Exact references:** citations, case names, page numbers, URLs, DOIs, ISBNs.
- **Numbers:** statistics, prices, dates, financial figures, anything quantitative from memory.
- **Recent events:** information after the model's training cutoff when it has no live lookup.
- **Leading questions:** a question that assumes something false ("Why did X ban Y?") invites an answer inside the false premise.
- **Long outputs:** more text means more opportunities for a slip, and early mistakes can be built upon.
- **Roleplay or "be confident" prompts:** instructions that push for certainty discourage hedging.

## How to recognize one

There is no reliable visual tell, but patterns help:

1. **Too perfect.** Beautiful references with plausible authors, titles and years that you cannot find.
2. **Unsourced precision.** "A 2019 study of 4,312 patients found…" with no way to trace it.
3. **Inconsistent details.** The answer contradicts itself or something you already know.
4. **Unfamiliar names for familiar things.** An invented term or API call.
5. **A different answer when re-asked.** If the key detail changes between attempts, it was probably guessed.

## What to do about it

- **Verify load-bearing claims** at a source you can open. This is the only dependable fix.
- **Ask for what the model is unsure about.** Phrases like "say so if you don't know" can help, but they do not guarantee honesty.
- **Provide the source.** If you paste a document and ask questions about it, errors drop, though not to zero; the model can still misread or add to it.
- **Use tools for exact work.** Compute arithmetic with a calculator or code and look up facts with search.
- **Compare independent models.** A detail that only one model gives is a candidate for an invented detail.
- **Keep prompts neutral.** Ask "what do we know about X?" rather than "why is X true?"

## What does not work

- Asking "are you sure?" The model may defend its answer or flip without new evidence.
- Trusting length or confidence as proof.
- Trusting an AI-generated reference list without opening it.

## A short field guide to examples

Consider the kinds of things that go wrong in practice. A user asks for papers on a narrow topic and receives a list of plausible titles by real authors that were never written. A user asks for the syntax of a library function and gets a parameter that the library never had. A user asks for a biography of a minor public figure and receives a career that blends two people with similar names. A user asks for the date of a regulation and gets a precise but wrong day. In each case the error is invisible without a check, because the text has the right shape. A good habit is to ask yourself, for any specific detail, whether you could tell it was wrong without looking it up. If not, look it up.

## FAQ

### Do newer models hallucinate less?

In many settings, yes, but no model is free of it, and the rate varies by task. Keplar does not publish a hallucination rate, because it would depend on what you ask.

### Is a hallucination the same as a lie?

No. A lie requires intent to deceive. A model has no such intent; it is producing plausible output.

## How Keplar approaches this

Keplar cannot prevent hallucinations, and it does not claim to. What it does is make them easier to catch. For a non-trivial question it asks several models from different families, so a detail only one invents tends to show as a lone position. A reviewer reads the draft against the individual responses and can remove claims that the responses do not support. Exact arithmetic and counting are computed by code instead of generated.

Keplar does not open links or confirm facts. Sources the models cite are labeled "Cited by <model>; Keplar didn't open or check", and there is no accuracy score. If a detail matters, check it yourself, and use the Disagreements and Verification sections to decide what to check first. The page [Sources and citations](/docs/how-it-works/sources-and-citations) explains this in more detail.
