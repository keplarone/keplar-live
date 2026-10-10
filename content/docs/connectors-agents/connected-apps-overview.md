---
title: Connected apps (MCP) overview
description: Connect remote Model Context Protocol servers so Keplar and its agents can use outside tools, with per-tool permissions, approvals and plan limits.
order: 1
updated: 2026-10-03
keywords: MCP, Model Context Protocol, connected apps, connectors, tools
related: /docs/connectors-agents/add-a-connection, /docs/connectors-agents/tool-permissions-and-approvals, /docs/privacy-security/connected-app-security
---

The Model Context Protocol (MCP) is an open protocol that lets an AI application discover and call tools exposed by a server: search a documentation site, read a repository, create a ticket. Keplar can connect to **remote MCP servers** (Streamable HTTP, with JSON or server-sent-event replies) and use their tools from Ask and from agents.

## Where to find it

Under Business, **Connected apps**. Chat tools are switched on per conversation; see [Use connected apps in chat](/docs/using-keplar/tools-in-chat).

## Plan limits

| Plan | Connections | Calls per day | Calls per minute | At once |
|---|---|---|---|---|
| Free | Not available | 0 | 0 | 0 |
| Plus | 3 | 100 | 20 | 2 |
| Pro | 10 | 500 | 40 | 3 |
| Business | 25 | 2,000 | 80 | 5 |

Why limit it: calling arbitrary third-party servers is one of the most abusable things a product can do, because it generates outbound traffic and can move data. Each call also costs about one credit.

## What Keplar protects

Every call, whether from the app, an approval or an agent, goes through one gateway that checks, in order: you own the server, the tool is enabled and its schema has not changed, the arguments match the stored schema, the agent has a grant for that tool, the plan and rate limits allow it, and the credit charge succeeds. Then the call runs with a timeout, output is sanitized and fenced, and a receipt is written.

New tools start **disabled**, with unknown risk, and with auto-run off. Writes, unknown tools and scheduled runs always ask first. If a server changes a tool's schema, that tool is disabled until you re-enable it.

## Popular servers

Keplar lists connectors it has tried with a real handshake, such as documentation servers that need no sign-in, and some that use a bearer token. Others that use OAuth are labeled Beta. The list is re-verified before it is edited; if a connector is not set up on the Keplar side, the screen says "not set up yet" rather than pretending.

## What it is not

It is not a way to give Keplar your whole machine. Only the tools you enable on servers you add can be called, and only under the permissions you set. The next pages cover [adding a connection](/docs/connectors-agents/add-a-connection), [OAuth sign-in](/docs/connectors-agents/oauth-sign-in-beta) and [permissions and approvals](/docs/connectors-agents/tool-permissions-and-approvals).
