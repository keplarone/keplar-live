---
title: Tool permissions and approvals
description: Read versus write tools, grants, auto-run rules, approval cards, schema-change locks and how scheduled runs always ask first.
order: 4
updated: 2026-10-03
keywords: tool permissions, approvals, auto-run, human in the loop
related: /docs/using-keplar/tools-in-chat, /docs/connectors-agents/agent-guardrails, /docs/privacy-security/connected-app-security
---

Connected tools can read data and change things. Keplar's defaults assume you want to approve anything that can change something.

## The permission model

| Control | Default | What it does |
|---|---|---|
| Tool enabled | Off | A tool cannot be called until you enable it |
| Tool kind | Unknown | Mark it read-only if it only reads |
| Auto-run on the tool | Off | Lets a read-only tool run without asking |
| Grant | None | Allows a specific place (Ask, or an agent) to use the tool, with call and credit budgets |
| Account policy for Ask | Off | "Let Ask run read-only tools without asking" |

## Auto-run needs all of these

For a tool to run without you pressing Approve, **all** must be true: the tool is a read tool, auto-run is on for it, the tool is granted to the caller, and for an agent its auto-send is on (for Ask, the account policy above). Otherwise an approval is queued.

## Always asks

- Writes.
- Unknown tools.
- Scheduled, unattended runs. There is no override.
- Any tool whose schema has changed since you enabled it.

## Approval cards

In chat, a pending call appears as an inline card with the tool, the arguments and Approve and Decline buttons. Elsewhere, pending calls are in Approvals. Nothing runs until you approve; execution happens on approval. At most 20 approvals can be pending per workspace.

## Idempotency

Each approval or request has a receipt key. Replaying it returns the stored result and never calls the server twice.

## Schema changes

Each tool's schema is hashed. If a server changes it, the tool is disabled until you re-enable it, so a server cannot silently turn a harmless tool into a different one.

## Reading tool output

Tool output is data. It is stripped of invisible characters, instruction-like lines, active content and secret-shaped strings, then fenced and capped before models see it or it is stored. It cannot change permissions, grants or budgets, because those are decided before the call from your stored settings.

## A sensible setup

1. Enable only the tools you need.
2. Mark true read-only tools as read.
3. Turn auto-run on only for read tools you trust, and leave the Ask policy off until you have watched receipts for a while.
4. Review the audit log.
