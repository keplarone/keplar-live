---
title: How to Write Better AI Prompts: 8 Habits
description: Eight prompt habits that work on any AI assistant: state the task, give context, set constraints, ask for the counterargument and more.
category: How-to
published: 2026-10-03
updated: 2026-10-03
keywords: how to write AI prompts, prompt engineering tips, better ChatGPT prompts, prompt examples, ask AI better questions
related: /docs/using-keplar/write-better-questions, /prompts, /blogs/why-ai-agrees-with-you
---

Prompt advice online ranges from useful to superstitious. Most of what works reduces to one principle: give the model what a smart, new colleague would need to do the job well. Here are eight habits that hold across assistants and survive model updates.

## 1. Say what you are trying to achieve

"Write about solar panels" gets generic text. "I'm writing a one-page flyer to help homeowners in a cold climate decide whether to get a quote" gets text shaped by a purpose and an audience. The goal changes what is included, what is left out and how it sounds.

## 2. Supply the context the model cannot know

The model does not know your company, your reader, your budget or your earlier decisions unless you tell it. Include relevant facts: location, date, constraints, definitions, what you already tried. Paste source text when accuracy matters, and tell the model to rely on it.

## 3. Ask for one thing at a time, or number the parts

A prompt with five different tasks gets five half-done answers. Split it up, or number the questions so each gets addressed. For complex work, ask first for a plan, review it, then ask for the output.

## 4. Specify the format

Say what you want back: a table with these columns, three bullet points, a 150-word paragraph, valid JSON with these fields, a step-by-step checklist. Formats are easy to specify and save editing time.

## 5. Show an example

If you have a sample of the tone, structure or output you want, include it. One good example is worth many adjectives. Mark it clearly as an example, so the model does not copy its content.

## 6. State the constraints and what to avoid

Length, reading level, words to avoid, topics to exclude, sources to use, tone. Say "do not invent facts; if the text doesn't say, answer 'not stated'." Constraints you do not state will not be followed.

## 7. Ask for what you actually need, not what flatters you

Leading prompts get agreeable answers. "Why is my plan great?" invites praise. "What are the three biggest risks in this plan, and which assumption is weakest?" invites critique. Ask for counterarguments explicitly. For decisions, ask for the strongest case against your preferred option.

## 8. Iterate, then verify

First answers are drafts. Tell the model what to change: "shorter, drop the second paragraph, make the tone less formal." Compare versions. Then verify anything that matters: names, numbers, dates, citations and code. A good prompt reduces errors but does not eliminate them.

## Before and after

**Before:** "Tell me about index funds."

**After:** "I'm 34, in the US, with a 20-year horizon and no investing experience. Explain index funds in plain language in about 250 words, then list three questions I should ask before opening an account. Say which parts depend on my tax situation. Do not recommend specific funds."

The second prompt gives context, a format, a length, a constraint and a request that surfaces uncertainty.

**Before:** "Fix my code."

**After:** "This Python function should return the median of a list but returns the wrong value for even-length lists. Here is the code and a failing example. Explain the cause, then show a corrected version and two tests. Python 3.12, no external libraries."

## Habits that are overrated

- Magic phrases. "Take a deep breath" and similar tricks vary by model and are not reliable.
- Very long prompts without structure. More text is not better; clearer text is.
- Role-play for its own sake. Assigning a role can help set tone, but it does not give the model knowledge it lacks.

## A reusable template

```text
Goal: what I'm trying to achieve and who it's for
Context: facts, constraints, source text
Task: the specific request (numbered if several)
Format: what the output should look like
Avoid: things not to do or say
Check: how to flag uncertainty ("say 'not sure' where relevant")
```

## A note on long prompts

Long prompts are fine when they carry information the model needs. They hurt when they repeat themselves or bury the real request. Put the task near the start or end, put source text in clearly labeled blocks, and keep instructions in a short list. If a prompt grows beyond a page, consider whether it should be split into stages: one prompt to extract facts from your material, another to draft, a third to critique. Smaller steps are easier to check, and when something goes wrong you know which step to fix.

## FAQ

### Do I need "prompt engineering" skills?

Less than before. Modern models handle plain language well. Clarity, context and a clear goal go a long way.

### Do the same prompts work in every model?

Mostly, but small differences exist. Test your important prompts.

## How Keplar approaches this

Keplar tries to need less prompt craft from you. A classifier reads your question's wording, size, attachments and topic and decides whether it needs one model or a panel, and which thoroughness fits. If you are not sure how to phrase a question, the composer and the docs offer guidance, and the [prompt library](/prompts) has copyable starting points.

Keplar's multi-model answer also helps with the "ask for what you need, not what flatters you" habit: because several models respond, a leading question is less likely to be answered with pure agreement, and a Disagreements section shows where models split. It cannot rescue a vague question or know facts you did not give it. For tips, see [Write better questions](/docs/using-keplar/write-better-questions).
