---
title: Agents overview
description: What a Keplar agent is, which plans include agents, the built-in agents, how to run, pause and stop them, and what they cost.
order: 5
updated: 2026-10-03
keywords: AI agents, autonomous agents, agent plans, lead follow-up
related: /docs/connectors-agents/agent-guardrails, /docs/connectors-agents/agent-schedules, /agents
---

An agent is a task with a goal, a budget and a set of permitted tools that can run without you watching. In the composer, the Agent option hands a task to an agent. Agents are meant for business workflows; they are not a way to give a model open-ended control.

## Plans

| Plan | Agents |
|---|---|
| Free | 0 |
| Lite | 0 |
| Plus | 3 |
| Pro | 10 |
| Business | 50 |

## Built-in business agents

- **Lead follow-up.** When a contact form is submitted, drafts a reply and queues it for your approval.
- **Proposal reminder.** Weekday reminders about open proposals.
- **Weekly report.** A weekly summary delivered to a channel or sheet you connect.
- **Social post.** Scheduled draft posts for a social scheduler.

Each one needs the relevant connection. Where a connector (such as Gmail, Slack or a social scheduler) is not set up, the screen says "not set up yet" and nothing is recorded as sent.

## Controls you have

- Run now, pause and resume.
- A per-agent **kill switch** (permanent; cancels its pending approvals).
- **Stop all agents** for the whole workspace.
- Per-agent caps and an auto-send toggle.

## What agents cost

An agent run has a small base cost plus a cost per model call, metered at the provider's actual charge. A typical lead follow-up is a handful of credits, and sends themselves cost nothing. The dashboard shows credits used this month per agent. See [Credits explained](/docs/billing-plans/credits-explained).

## Honest limits

Agents draft and prepare; consequential actions (sending messages, publishing, payments) wait for your approval by default. Scheduled runs never send on their own. An agent is only as good as the instructions, data and models behind it, and can be wrong like any model output.

Read [Agent guardrails](/docs/connectors-agents/agent-guardrails) before turning on auto-send.
