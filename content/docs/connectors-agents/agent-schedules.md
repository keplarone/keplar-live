---
title: Agent schedules
description: How agents run on a schedule, which triggers exist, the time zone to use when reading cron times, and why scheduled runs always wait for approval.
order: 7
updated: 2026-10-03
keywords: agent schedule, cron, recurring tasks, triggers
related: /docs/connectors-agents/agent-guardrails, /docs/connectors-agents/agents-overview, /docs/connectors-agents/business-tools
---

Agents can run on events and on schedules. Schedules are stored as cron strings and run on the server, so they work after you close the tab.

## Triggers

- **Event:** for example, a contact form was submitted on your site.
- **Schedule:** a recurring time, such as weekdays at 10:00 or Monday at 09:00.
- **Manual:** the Run now button.

The built-in agents use the schedules above: a proposal reminder on weekdays at 10:00 Eastern, a weekly report on Monday at 9:00 Eastern, and social posts on Tuesday and Thursday at 11:00 Eastern.

## Reading cron strings

A cron string has five fields: minute, hour, day of month, month, day of week.

```text
0 14 * * 1-5     at 14:00 UTC, Monday to Friday
0 13 * * 1       at 13:00 UTC every Monday
```

Keplar stores schedule times in **UTC**. If you see a cron string and want to know your local time, convert it; remember that UTC does not shift with daylight saving time, so a schedule that is 10:00 Eastern in winter is 11:00 Eastern in summer unless it is adjusted.

## What a scheduled run may do

It may read, think and prepare. Every outbound action it wants to take is placed in the approval queue. Nothing is sent without you.

## When a run does not happen

- The agent is paused or killed.
- The workspace was stopped with Stop all agents.
- The per-agent or workspace caps were reached.
- Your plan no longer includes agents.

## Checking history

The audit log and the agent's activity list show every run, including skipped ones and why.
