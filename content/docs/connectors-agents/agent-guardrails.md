---
title: Agent guardrails
description: Spend caps, approval gates, auto-send rules, kill switches and the audit log: how Keplar limits what an agent can do and spend.
order: 6
updated: 2026-10-03
keywords: agent guardrails, spend cap, approval gate, audit log, kill switch
related: /docs/connectors-agents/agents-overview, /docs/connectors-agents/tool-permissions-and-approvals, /enterprise
---

Autonomy is only useful if it has edges. These are Keplar's.

## Approval by default

Every outbound action an agent prepares (an email, a Slack message, a social post, a sheet write) waits in the approval queue. You can edit the draft, approve and send, or reject it. Approving executes the action through the connector, and fails with "not set up yet" if the connector is not connected.

## Auto-send is opt-in

On Plus and above you can turn on auto-send for an individual agent. It is still bounded by a daily outbound cap; over the cap, actions go back to approval.

## Scheduled runs never auto-send

A run that starts on a schedule, unattended, always queues its outbound actions for approval, even if auto-send is on. This is not configurable.

## Caps per agent

Defaults at the time of writing:

| Cap | Default |
|---|---|
| Credits per month | 1,500 |
| Runs per day | 24 |
| Sends per day | 20 |
| Spend per month | $3 |

The workspace allowance is also checked before each run.

## Stopping an agent

- **Pause** to stop future runs and resume later.
- **Kill** for one agent. This is irreversible and cancels its pending approvals.
- **Stop all agents** for the workspace.

## The audit log

Every step is recorded: each owner decision, agent run, connector change, order and form submission. The log is for you to review what happened and why.

## What agents are told

Agent prompts forbid invented facts and prices. Agents run on a model chosen for agent work, and their calls are metered at actual cost.

## What guardrails do not do

They cannot make an agent's draft correct. They limit damage and give you a chance to read before something leaves your account. Read what you approve.
