---
title: Delete and export your data
description: How to delete a chat, a memory, a study set or your whole account, what is kept after account deletion and why, and how to export your data as JSON.
order: 3
updated: 2026-10-03
keywords: delete account, export data, GDPR, data portability
howto: true
related: /docs/using-keplar/memory, /docs/billing-plans/upgrade-downgrade-cancel, /privacy
---

## Steps

1. Delete individual items first if that is all you want: a chat from the sidebar, a Study set from its page, a deck from your decks, a memory item or all memory from Account.
2. To export your data, open Account and choose the export option. You receive JSON.
3. If you pay for a plan, cancel it first through Manage billing. Keplar cannot cancel a Whop subscription for you, and account deletion is refused while a subscription is active.
4. In Account, choose Delete account and type your email exactly to confirm.
5. Deletion is permanent and signs you out everywhere.

## What the export contains

Every record your workspace owns, as JSON, with secrets redacted. Image bytes are not inlined; their metadata is.

## What deletion removes

Everything your workspace owns: chats, study sets, decks, memory, projects, sites, connections, agents and so on, plus your sign-in. Admin accounts are protected from self-deletion.

## What is kept, and why

Some records stay after deletion because the law or billing and abuse protection need them: payment records, billing events, the usage ledger and counters, cooldowns, model-call records, spend totals and abuse reports. They hold ids and amounts, not chat, memory or site content. Anonymous funnel counts (a random browser id, no account link, no prompt text) are pruned after 180 days.

## What deletion cannot reach

Data a model provider keeps under its own terms, a copy you shared that someone else saved, and sites already cached elsewhere. If you shared an answer, delete the share link first (see [Share an answer](/docs/using-keplar/share-an-answer)).

## Questions

Write to [team@keplar.one](mailto:team@keplar.one).
