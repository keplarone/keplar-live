---
title: Business Tools: Forms, CRM, Inbox
description: How a contact form on a Create site becomes a lead, a deal and a drafted reply, and what the dashboard, CRM, inbox, orders and audit log show.
order: 8
updated: 2026-10-03
keywords: small business CRM, contact form leads, business dashboard, Stripe Connect
related: /enterprise, /for-small-business, /docs/connectors-agents/agents-overview
---

Keplar Business adds tools around the sites you build. They are optional.

## From a form to a follow-up

1. A visitor submits the contact form on your published site (with a honeypot and a rate limit to block spam).
2. Keplar creates a contact, an activity entry, an inbox message and a "new" deal in the CRM, and the visitor sees "Thanks, your message was sent."
3. The Lead follow-up agent drafts a reply and queues it in Approvals.
4. You edit and approve it, and it is sent through your connected email, or you reject it.

## The pieces

- **CRM:** a pipeline from New through Qualified and Proposal to Won or Lost, with contacts and an activity timeline.
- **Inbox:** messages from your forms and connected email.
- **Orders and payments:** a shop's Buy button can go to a payment link you provide. Seller payments through Stripe Connect work only when the account is connected; otherwise the store says it is not accepting payments yet and no card is collected.
- **Dashboard:** revenue, orders, leads, site views (first-party, without cookies), agent activity, pending approvals and credit use.
- **Audit log:** every owner decision, agent run, connector change, order and form submission.

## What needs setting up

Payments, Gmail, Outlook, Calendar, Slack and the social scheduler each need a connection before they work, and the screens say "not set up yet" until they do. Nothing is simulated and no action is recorded as sent when it was not.

## Who can use it

A signed-in account. Payments and agents start at Plus. Business adds more agents, higher limits and contract terms; contact Keplar through the Inquire form.

## Your customers' data

Form submissions, contacts and orders are stored in your workspace and are included in account export and deletion. Card details for your customers' purchases are handled by Stripe under your connected account; Keplar never sees full card numbers.
