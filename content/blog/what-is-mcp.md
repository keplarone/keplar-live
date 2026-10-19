---
title: What is MCP (Model Context Protocol), and why does it matter for AI tools?
metaTitle: What is MCP (Model Context Protocol)?
description: MCP is an open protocol for connecting AI applications to tools and data. A plain explanation of how it works, what it enables, and the security questions to ask.
category: How AI works
published: 2026-10-03
updated: 2026-10-03
keywords: what is MCP, Model Context Protocol, MCP server, MCP security, connect AI to tools
related: /docs/connectors-agents/connected-apps-overview, /docs/privacy-security/connected-app-security, /blogs/what-is-an-ai-agent
---

If you follow AI tooling, you will have seen "MCP" everywhere. It stands for **Model Context Protocol**, an open protocol, introduced by Anthropic in late 2024, for connecting AI applications to external tools and data sources in a standard way. The idea is simple and the consequences are large enough that it is worth understanding, including the risks.

## The problem it solves

Before a common standard, every AI application that wanted to use a tool, such as a file system, a database, a ticketing system or a search service, needed custom integration code for each one. Ten applications and ten tools meant up to a hundred integrations. A shared protocol turns that into ten plus ten: each tool is written once as a server, each application is written once as a client.

## The pieces

- **Host or client:** the AI application. It connects to servers and decides when to call their tools.
- **Server:** a program that exposes capabilities. A server can offer several types of capability; the most used are **tools** (actions the model may ask to call), **resources** (data it can read) and **prompts** (templates).
- **Transport:** how they talk. Servers can run locally on your machine, or remotely over HTTP. Remote servers use a "Streamable HTTP" transport in the current specification; an older HTTP-plus-SSE approach is being phased out.
- **Messages:** a JSON-RPC-based exchange. A client sends an `initialize` request, receives the server's capabilities, lists the tools, and calls them with arguments matching each tool's schema.

## What this enables

- An assistant can search your documentation, read a repository, create a ticket or query a database through the same mechanism.
- Tool builders can publish one server and reach many AI applications.
- Users can choose which tools to connect.

## Why it raises security questions

Connecting a model to tools combines two hard problems: models can be tricked by text, and tools can have real effects.

### Prompt injection

Content returned by a tool (a web page, a document, a ticket) may contain text written to look like instructions. A model that treats it as a command can be steered into misusing other tools. Treat tool output as untrusted data.

### Over-broad permissions

A server may expose far more than you need. Enable only the tools that are necessary, and prefer read-only access.

### Tool changes after approval

A server can change what a tool does after you approved it. Clients should notice when a tool's description or schema changes.

### Credentials

Servers need credentials. They should be stored encrypted, scoped narrowly and never exposed to the model.

### Network risks

A client that fetches arbitrary URLs for remote servers can be used to reach private networks (server-side request forgery). Responsible clients restrict destinations to public addresses and check redirects.

### Untrusted servers

An MCP server is code someone else wrote, running with the access you gave it. Only connect servers you trust.

## A checklist before connecting a server

1. Who runs it, and do I trust them?
2. What can each tool do? Are any of them write or delete actions?
3. What credentials does it need, and what is the narrowest scope?
4. Does my client ask before consequential actions?
5. Does my client notice when tools change?
6. Is there a log I can review?
7. Can I disconnect it cleanly?

## An example of the flow

Imagine you connect a documentation server. When the connection starts, the client sends an initialize request and the server replies with its name, version and capabilities. The client then asks for the list of tools and gets, say, a search tool with a description and a schema saying it needs a query string. Later, in a chat, the model decides the search tool would help and asks the client to call it with a query. A well-behaved client checks the arguments against the schema, applies your permission settings, calls the server, and passes the result back to the model as data. The model uses it to write the answer. At no point should the model hold your credentials, and at no point should the tool's output be able to change your permission settings.

## FAQ

### Is MCP only for Claude?

No. It is an open protocol, and many applications and tools support it.

### Is MCP an API?

It is a protocol for AI applications to use tools. A tool may wrap an ordinary API underneath.

## How Keplar approaches this

Keplar can connect to remote MCP servers over Streamable HTTP, on Plus and above (Plus 3, Pro 10, Business 25 connections). It is outbound only: Keplar calls your servers' tools; it does not expose itself as an MCP server. Every connected tool starts disabled and unclassified. Writes, unknown tools and scheduled runs always wait for your approval, and a changed schema disables the tool until you re-enable it.

Credentials are encrypted at rest and never returned to the browser. Server addresses must be HTTPS and resolve to public addresses, and redirects are checked on each hop. Tool output is stripped of instruction-like lines and secret-shaped strings, fenced, and capped before models see it. Controls reduce risk but do not remove it; connect only servers you trust. See [Connected apps overview](/docs/connectors-agents/connected-apps-overview), [Add a connection](/docs/connectors-agents/add-a-connection) and [Connected app security](/docs/privacy-security/connected-app-security).
