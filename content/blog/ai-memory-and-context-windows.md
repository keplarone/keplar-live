---
title: AI Memory vs Context Windows: Why AI Forgets
description: Why AI assistants forget things, what a context window is and what 'memory' features really store. A plain explanation.
category: How AI works
published: 2026-10-03
updated: 2026-10-03
keywords: AI memory, context window, ChatGPT memory, why AI forgets, long context, AI projects
related: /docs/using-keplar/memory, /docs/using-keplar/follow-ups-and-chats, /blogs/ai-privacy-what-happens-to-your-prompts
---

Two things get called "memory" in AI products, and they are very different. One is the model's *working space* for the current conversation. The other is a *stored profile* that carries facts between conversations. Mixing them up leads to wrong expectations and privacy surprises.

## The context window: working memory

A language model processes text in a limited window, measured in tokens (roughly pieces of words). Everything it uses to answer must fit: your current question, the earlier messages in the chat, any pasted documents, system instructions and its own reply. Providers publish window sizes, and they have grown a great deal, with some listing hundreds of thousands to over a million tokens. Bigger windows help, but they do not make the model read every part equally well.

Consequences:

- **Chats are not stored in the model.** The product resends earlier messages with each new question. If the conversation gets too long, older messages may be dropped or summarized.
- **Long chats drift.** Early instructions get less weight, the model may contradict earlier statements, or a mistake made early stays in the history and gets built upon.
- **Pasting a huge document does not guarantee careful reading.** Details in the middle can be missed, and the model may fill gaps with guesses.
- **A new chat is a clean slate** (unless the product has saved memory).

## Saved memory: a stored profile

Many products offer a feature that saves facts between chats, such as your name, projects, preferences or goals, and supplies relevant ones with later questions. How it works differs: some save automatically, some only when asked; some let you view and edit the list, some less so. It is a notes file, not a mind.

Benefits: less repetition, more tailored answers, continuity across sessions.

Risks and costs:

- Stored personal details you may not want kept.
- Irrelevant or outdated memories steering answers.
- Memory sent to model providers along with your question.
- A wrong "fact" stored about you that keeps resurfacing.

## Projects and uploaded files

Some tools let you keep documents or instructions in a project so they apply to many chats. That is a third mechanism: reference material attached to a workspace and retrieved when relevant.

## Practical habits

1. **Start a new chat for a new topic.** It improves focus and reduces cost.
2. **Restate key constraints** in a long chat before a critical request.
3. **Summarize and restart** when a chat gets long: ask for a summary, check it, paste it into a new chat.
4. **Put the most important material first or last**, and say which parts matter.
5. **Review your saved memories** periodically. Delete what you don't want.
6. **Turn memory off for sensitive topics**, if the product allows.
7. **Don't assume it remembers.** If it matters, say it again.

## Misconceptions

- "The AI learns from me in real time." Chat history informs the current conversation; it does not retrain the model. Whether a provider uses conversations for later training is a separate policy question.
- "A bigger window always means better answers." Not necessarily.
- "Memory means it knows me." It means it has some notes.

## A troubleshooting guide

If an assistant ignores something you said earlier, check four things in order. First, is it the same chat, or did you start a new one? Second, is the chat very long? If so, summarize and restart. Third, did you state the instruction once, early, and never repeat it? Restate it next to the request. Fourth, is saved memory on, and is a stored note conflicting with what you want? Review and edit the list. If the assistant keeps surfacing a fact about you that is no longer true, delete that item instead of correcting it in every chat. These steps solve most "it forgot" and "it keeps remembering the wrong thing" problems without any special tools.

## FAQ

### Why did the AI forget what I said earlier?

The message may have fallen out of the window, been summarized away, or been underweighted.

### Is memory a privacy risk?

It can be. Review what is saved and who processes it.

## How Keplar approaches this

Keplar keeps these separate and visible. Within a chat, recent messages (older ones shortened) are always sent with your question so follow-ups work. Memory is a different feature: on by default for signed-in accounts, off if you turn it off. When it is on, a free model reads your own message after an answer and may save short, durable facts, skipping small talk, pasted documents and sensitive items such as passwords or card numbers. It never reads files you upload, and it does not use your credits.

You can see every item in Account, add your own, delete one, or erase all memory, optionally with chat history, or say "forget that" in a chat. Relevant saved items are sent along with a later question to the models answering, so they are covered by the same provider handling as the rest of your prompt. Keplar does not train models on your memory or chats. Details: [Memory](/docs/using-keplar/memory).
