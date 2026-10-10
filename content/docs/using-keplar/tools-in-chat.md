---
title: Use connected apps in chat
description: Switch on tools for a conversation so Keplar can call approved apps, how approvals appear in the chat, and the limits on steps and time.
order: 11
updated: 2026-10-03
keywords: tools in chat, MCP chat, connected apps, approval cards
related: /docs/connectors-agents/connected-apps-overview, /docs/connectors-agents/tool-permissions-and-approvals, /docs/connectors-agents/add-a-connection
---

If you have connected apps (see [Connected apps overview](/docs/connectors-agents/connected-apps-overview)), you can let Ask use them in a conversation. Signed-in Plus, Pro and Business users can switch **Tools** on per conversation using the bar above the composer, which lists the active apps. Free and anonymous users get no tools.

## How it works

Tool use is a short pre-stage before the normal engine runs. A small planner model sees only your question, the recent turns and a compact list of allowed tools (numbered, never URLs or secrets). It may propose calls as structured data. Keplar's server runs them, and the results are handed to the answering models as context. Simple questions never trigger tools: a deterministic gate must pass before the planner is even called.

## What you see

States like "Using <app>: <tool>" with receipts (status, time, call id), approval cards, and refusals. The planner's private reasoning is never shown or stored; only the proposal that was run or put on hold.

## Approvals

Reading tools can run automatically only if all four hold: the tool is marked read-only, it is set to auto-run, it has been granted to Ask, and your account setting "Let Ask run read-only tools without asking" is on (it is off by default). Everything else, including every write, every unknown tool and every scheduled run, produces an **approval card** in the chat. Nothing runs until you press Approve.

## Limits

At most 5 tool steps per turn, 3 planner rounds, 3 calls per round and 45 seconds in total. Identical calls are de-duplicated, and tool results are capped in size. Hitting a cap ends tool use and the answer continues without further tools.

## Cost

The planner call is metered, and each tool call costs about one credit. Tool results reduce the remaining answer budget.

## Treat results as data

Tool output is sanitized, fenced and labeled as data, not instructions, before the models see it. It is sent to the models answering that question, which the interface discloses. Do not connect an app whose data you would not want a model provider to receive.
