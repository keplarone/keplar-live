---
title: Write better questions
description: Eight habits for better multi-model answers: state the decision, add constraints, ask for the counterargument and separate facts from judgment.
order: 2
updated: 2026-10-03
keywords: prompt tips, better questions, prompt writing, how to ask AI
howto: true
related: /prompts, /docs/using-keplar/follow-ups-and-chats, /docs/how-it-works/which-questions-use-more-models
---

Keplar reads your question to decide how many models to use and how to compare them. The same habits that make a question clear to a person make the answer more useful.

## Steps

1. State the decision, not just the topic. "Should I rent or buy?" invites a comparison; "Tell me about renting" invites an essay.
2. Add the constraints that change the answer: budget, timeline, location, skill level, risk tolerance.
3. Say what a good answer looks like: a recommendation, a ranked list, a table, a checklist, or a draft.
4. Ask for the strongest counterargument. This makes the models spend their answer on the weak points.
5. Ask what would change the answer. The hinge fact is the thing to check.
6. Separate facts from judgment. Ask for facts you can verify and opinions labeled as opinions.
7. Give the audience and tone for writing tasks.
8. Ask one question at a time, then follow up in the same chat.

## Before and after

| Weak | Better |
|---|---|
| Tell me about index funds | I'm 30, can invest $400 a month for 20 years, and dislike volatility. Should I use a broad index fund, a target-date fund, or something else? Give the strongest counterargument and say what would change your recommendation. |
| Is this contract okay? | Here is clause 7 [paste]. In plain English, what does it commit me to, which parts are unusual, and what questions should I ask a lawyer? |
| Write an email | Write a 90-word email to a customer whose order is late. Tone: calm and direct, no excuses. End with a specific next step. |

## Prompts you can copy

```text
I need to decide between [A] and [B]. My constraints: [budget, timeline, skills].
Recommend one, give the strongest argument against your recommendation,
and tell me the single fact that would change your mind.
```

```text
List the claims your answer depends on most. For each, say whether it is a fact
I can verify, a judgment call, or a prediction, and what source I should check.
```

## What to avoid

- **Leading questions.** "Why is X the best?" assumes the answer. Ask "How does X compare with Y?"
- **Pasting secrets.** Do not include passwords, card numbers or confidential data. On Free, model hosts may log prompts.
- **Asking for live facts.** Current prices, versions and news can be out of date; Keplar does not browse today.

More ready-made examples are in the [prompt library](/prompts).
