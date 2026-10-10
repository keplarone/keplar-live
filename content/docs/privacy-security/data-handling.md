---
title: How Keplar handles your data
description: Where a question goes, what is stored under your account, which companies process it, what is never sent to model providers, and what Keplar does not do.
order: 1
updated: 2026-10-03
keywords: AI privacy, data handling, prompts, model providers, training on data
related: /privacy, /docs/privacy-security/free-plan-privacy, /docs/privacy-security/delete-and-export
---

This page summarizes the [Privacy Policy](/privacy), which is the authoritative text. If anything here differs from the policy, the policy wins.

## Where your question goes

A question goes through Keplar to the model providers the router picks for that request, and not necessarily to all of them every time. They receive what they need to answer: your prompt, recent messages of the conversation, any attached content, and, if memory is on, a few short notes relevant to the question. **Your account email and name are not sent to model providers.**

Requests reach models through OpenRouter, and directly through OpenAI and NVIDIA for some models. The Models consulted section of each answer shows which models were used.

## What is stored

| Data | Signed in | Signed out |
|---|---|---|
| Chats and answers | In Keplar's database under your account | Only in your browser's local storage |
| Attached images and video | Used for that request only, not saved with the chat | Same |
| Study sets and slide decks | Stored until you delete them (the original file is not kept) | Not available |
| Memory notes | Stored if memory is on; you can view, edit, delete, or turn it off | Not available |
| Usage records | Type of action, credits, cost and time | Short-lived counters for rate limits |

## Who processes data for Keplar

Vercel hosts the site; Neon hosts the database; Resend sends sign-in and account emails; Whop processes subscription payments; Google and Microsoft provide optional sign-in; OpenRouter, OpenAI and NVIDIA provide models.

## Training

Keplar does not use your prompts, files, memory or chats to train AI models, and does not sell personal data. Paid-plan requests through OpenRouter are restricted to endpoints that state they do not collect or train on prompts. Each provider handles data under its own terms, and providers may keep requests for a limited time, for example to detect abuse. Free works differently: see [Free plan privacy](/docs/privacy-security/free-plan-privacy).

## Analytics and cookies

No advertising cookies, cross-site tracking or session replay. Optional analytics on the public marketing pages are off until you accept them, and never include your questions.

## What you can do

Delete chats, sets and memory items; turn memory off; export your data; delete your account. See [Delete and export your data](/docs/privacy-security/delete-and-export).

## What this page does not claim

It does not claim certifications, a data-retention period that is not enforced, or that a third-party provider's behavior is guaranteed. Do not put anything in a question that you are not comfortable sharing with the providers who may answer it.
