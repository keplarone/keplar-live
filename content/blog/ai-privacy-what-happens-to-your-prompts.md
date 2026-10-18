---
title: What Happens to Your AI Prompts? AI Privacy Guide
description: Where your prompts go, who can log them, how training opt-outs work and what to keep out of free AI tools. A plain guide to AI privacy.
category: Trust and accuracy
published: 2026-10-03
updated: 2026-10-03
keywords: AI privacy, does ChatGPT store my data, AI training on my prompts, is AI safe to use, AI data retention
related: /docs/privacy-security/data-handling, /docs/privacy-security/free-plan-privacy, /privacy
---

Typing a question into an AI assistant feels private, like thinking aloud. It is not the same as thinking. Your text is sent to a server, processed by a model, and handled according to a policy you probably have not read. This article explains the questions to ask, so you can decide what to share.

## The path your text takes

1. **Your device to the service.** Your prompt travels, encrypted in transit, to the company running the product.
2. **The service to a model provider.** Many products use models from other companies. Your prompt may be passed to one or more of them through an API.
3. **Storage.** The product may save your conversation to your account, and providers may log requests for some time, for example to detect abuse.
4. **Review.** Some providers allow staff to review samples for safety or quality, subject to their policies.
5. **Training.** Some providers use consumer conversations to improve models unless you opt out. API and business customers are often excluded from training by default, but this is provider-specific.

## Questions to ask about any AI product

- Are my conversations stored, and for how long?
- Are they used to train models? Can I opt out? Is that the default?
- Who else processes them: model providers, hosting companies, analytics tools?
- Can people at the company read them, and under what conditions?
- Do my uploaded files and images get stored?
- Does it have "memory", and can I see and delete it?
- Can I delete my data and my account? What is retained after deletion?
- Do free and paid tiers have different terms?

The answers are in the privacy policy and the data controls in settings. Policies change; note the date you read them.

## Free versus paid

It is common for free tiers to have looser terms, because someone has to pay for the service. If a tool relies on third-party hosts that run free models, those hosts' policies apply to the prompt, and some may log and use it. Paid tiers and business plans often come with stricter commitments. Do not assume. Check.

## What to keep out of a prompt

Unless you are sure of the terms, leave out:

- passwords, API keys, recovery codes;
- government IDs, financial account numbers, card numbers;
- health records that identify you or others;
- confidential work documents, client data, unreleased code or plans;
- other people's personal details;
- anything you would be harmed by seeing leaked.

When you need help with a sensitive document, redact names and identifiers, or rewrite it with placeholders.

## Practical habits

1. Use the privacy controls: disable training use if offered; turn off memory if you do not want it.
2. Use separate accounts or workspaces for work and personal.
3. Delete conversations you don't need.
4. For work, use the tools your employer has approved.
5. Remember that screenshots and shared links can expose a conversation. Know what a share link reveals and for how long it lives.
6. Treat browser extensions that read your chats with suspicion.

## Misconceptions

- **"Deleting a chat deletes it everywhere."** It removes it from your view and the service's account store, but a provider may retain copies under its own policy for a period.
- **"Incognito mode makes it private."** It affects your browser, not the service.
- **"The AI remembers me" means a secret profile.** Memory features are usually visible and editable if the product is well designed.

## A five-minute privacy review

Open the settings page of the assistant you use most and look for four things: whether your conversations are used for model improvement and whether you can switch that off; whether memory is on and what it holds; how to delete a single chat and all chats; and what a share link exposes. Then read the section of the privacy policy about third parties and retention. Write down the date you checked. Repeat the review when the product announces a policy change, or about once a year. It takes minutes and prevents most surprises.

## FAQ

### Is it safe to ask AI about personal problems?

It depends on what you share and the provider's terms. Share less identifying detail.

### Can employers see my AI chats?

On work accounts, possibly. Assume yes unless told otherwise.

## How Keplar approaches this

Keplar's [privacy policy](/privacy) says: your question goes to the model providers the router picks for that request, not necessarily every provider each time; your account email and name are not sent to them; Keplar does not train on your prompts, files, memory or chats and does not sell personal data. Chats are stored under your account when you are signed in, and in your browser only when signed out. Memory is on by default for signed-in accounts and you can view, edit, delete or turn it off.

Free is different and we say so: Free requests run on free open models whose hosts may log prompts and may use them to improve their models. On paid plans, requests through OpenRouter are limited to endpoints that state they do not collect or train on prompts, though providers may keep requests for a limited time. You can export your data and delete your account. Read the details in [How Keplar handles your data](/docs/privacy-security/data-handling) and [Delete and export](/docs/privacy-security/delete-and-export).
