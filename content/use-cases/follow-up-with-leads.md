---
title: Follow Up With New Leads Using AI Agents
description: Let a scheduled Keplar agent draft lead follow-ups while every outgoing message waits for your approval. How it works in Keplar Business.
updated: 2026-10-03
keywords: AI lead follow-up, automate email replies, small business automation, AI agent for sales
related: /docs/connectors-agents/agents-overview, /docs/connectors-agents/agent-guardrails, /agents
---

Slow replies lose customers, and writing the same polite message ten times a week is a poor use of your attention. An agent can draft the replies. The important question is who decides what gets sent. In Keplar, that is you.

## The flow

1. A visitor submits the contact form on your published site.
2. Keplar creates a contact, an inbox message and a new deal in the CRM.
3. The Lead follow-up agent drafts a reply.
4. The draft appears in Approvals. You edit it, approve it or reject it.
5. On approval, it is sent through your connected email. If email is not connected, the screen says "not set up yet" and nothing is recorded as sent.

Agents are available on Plus (3), Pro (10) and Business (50).

## Writing good rules

Give the agent a short brief: tone, what to mention, what never to promise, and the single next step. An example is in the [Keplar prompt category](/prompts/keplar). Clear rules such as "never quote prices" and "offer two call windows" produce drafts you can approve quickly.

## Controls

- **Approval by default.** Nothing leaves without you.
- **Auto-send is opt-in** per agent, capped daily, and never applies to scheduled runs.
- **Caps.** Default per-agent caps are 1,500 credits a month, 24 runs a day, 20 sends a day and $3 a month.
- **Stop buttons.** Pause an agent, kill one permanently, or stop all agents.
- **Audit log.** Every run and decision is recorded.

## Reading drafts

The agent is a model with instructions. It can write a polite reply that misstates your policy. Read each draft for facts, prices, dates and commitments before approving, especially in the first weeks. Turn on auto-send only after you have seen many drafts you would not change, and keep the daily cap low.

## What it costs

Each run has a small base cost plus a cost per model call, metered at the provider's actual charge. A typical lead follow-up is a handful of credits; sending is free. See [Credits explained](/docs/billing-plans/credits-explained).

## Limits

The agent cannot know what is not in your instructions and the form data. It does not check your calendar unless a calendar connection is set up. And it is not a substitute for a call when a customer needs one.

## Related

[Agent guardrails](/docs/connectors-agents/agent-guardrails) and [Agent schedules](/docs/connectors-agents/agent-schedules) cover the controls in depth.
