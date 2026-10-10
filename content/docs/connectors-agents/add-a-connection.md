---
title: Add a connection
description: Connect an MCP server step by step, test it with a handshake, enable only the tools you want, and the address and credential rules that apply.
order: 2
updated: 2026-10-03
keywords: add MCP server, connect tool, bearer token, MCP URL
howto: true
related: /docs/connectors-agents/connected-apps-overview, /docs/connectors-agents/tool-permissions-and-approvals, /docs/privacy-security/connected-app-security
---

## Steps

1. Open Business, then Connected apps, then Add a connection.
2. Pick a listed connector, or enter your own server's address.
3. Choose how it authenticates: none, a bearer token or API key, or OAuth (Beta).
4. Save, then press **Test**. Keplar sends a real handshake and lists the tools the server offers.
5. Enable only the tools you want. Each starts disabled. Mark read-only tools as **read** so they can be considered for auto-run; leave everything else on approval.
6. Grant the tools to the places that may use them: Ask (chat) and specific agents, with daily call and monthly credit budgets.
7. Try a read-only tool in a chat with Tools switched on, and check the receipt.

## Address rules

- **HTTPS only** in production.
- No credentials or secrets in the URL's query string. Put keys in the credential field.
- The hostname must resolve to **public** addresses. Loopback, private, link-local, shared, multicast, reserved and cloud metadata addresses are blocked, and the connection is pinned to the checked address so DNS cannot be swapped between check and use.
- Redirects are followed manually (at most three) and every hop is checked again. Auth headers are dropped on cross-origin redirects.
- Timeouts and response-size limits apply.

## Testing your own server

If you build an MCP server, you can check it responds to an `initialize` request before you add it:

```bash
curl -sS -X POST "https://your-server.example/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl-check","version":"0.0.1"}}}'
```

A working server answers with its name, version and capabilities. The older two-endpoint SSE transport is reported as unsupported.

## Credentials

Tokens and API keys are encrypted at rest with a key derived per workspace, bound to the record so they cannot be moved between users, and never sent back to the browser (it only learns that a secret exists). In production, Keplar refuses to store a credential if the server's encryption secret is missing.

## Removing a connection

Deleting a connection removes its tools, grants and stored secret. Account export and deletion include connected-app data.
