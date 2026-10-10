---
title: Memory: what Keplar remembers about you
description: What Keplar remembers when memory is on, how to see, edit and erase it, and what it never does with your uploaded files.
order: 5
updated: 2026-10-03
keywords: AI memory, memory settings, erase memory, forget
related: /docs/privacy-security/data-handling, /docs/privacy-security/delete-and-export, /docs/get-started/accounts-and-sign-in
---

Memory lets Keplar start a new chat already knowing a few durable things about you. It is on by default for signed-in accounts and is not available when you are signed out.

## What gets saved

After an answer, a free model reads your own message and may save short, durable facts such as your name, goals, preferences or ongoing projects. It skips small talk and messages that look like pasted documents. It never reads files you upload, never uses your credits, and will not save instructions, links or sensitive items like passwords or card numbers.

With memory on, Keplar also writes a one or two sentence summary of each signed-in chat and keeps the last few question and answer pairs as a short digest. That lets it answer "what did we talk about last time?" and bring in relevant earlier passages. For a message with an attached file or image, only your question is kept, never the answer.

## What gets used

New chats start with your saved notes and short summaries of your last few chats. When a saved item is relevant to a later question, it is sent along with that question to the models answering, so it is covered by the same provider handling as the rest of your prompt. Nothing is sent when memory is off or after you delete it.

## Take control

| To do this | Do this |
|---|---|
| See everything saved | Open Account and look at the memory list |
| Add something | Add it in Account, or say "remember that…" in a chat |
| Delete one item | Delete it in Account |
| Turn memory off | Account, or say "turn memory off" in a chat |
| Erase everything | Erase all memory in Account, optionally with your chat history, or say "erase my memory" |

Deleting removes the data from Keplar's database. Summaries are deleted with their chat and erased with your memory.

## Caveats

- The free models that extract memories may be hosted by companies that log prompts, so your message is shared with such a host when extraction runs.
- Data a model provider kept under its own terms may persist after you delete it from Keplar.
- Keplar does not train models on your memory or chats.

## When to turn it off

Turn memory off if you are working on something sensitive, if you share a device, or if you want each chat to start with no history.
