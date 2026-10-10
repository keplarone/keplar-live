---
title: Connect with OAuth (Beta)
description: How OAuth sign-in for remote MCP servers works in Keplar, what it stores, what it refuses, and why it is labeled Beta.
order: 3
updated: 2026-10-03
keywords: MCP OAuth, PKCE, dynamic client registration, Linear, Notion, Sentry
related: /docs/connectors-agents/add-a-connection, /docs/privacy-security/connected-app-security, /docs/connectors-agents/tool-permissions-and-approvals
---

Some remote servers only accept sign-in with an account on that service. Choose **OAuth (BETA)** in Add a connection, approve on the provider's own page, and Keplar keeps only encrypted tokens.

## What happens

1. Keplar probes the server and reads its sign-in challenge, then discovers the authorization server's metadata using the standard documents (RFC 9728 protected-resource metadata, RFC 8414 or OpenID Connect discovery).
2. It registers itself as a public client dynamically (RFC 7591) and starts a sign-in using PKCE with the S256 method and the resource parameter (RFC 8707).
3. You approve on the provider's page. Keplar's callback needs your signed-in session and reflects nothing from the query string.
4. Keplar stores the access and refresh tokens sealed with encryption bound to your workspace and the connection. They are never returned by any API.
5. Tokens refresh about a minute before they expire. A rejected token triggers one forced refresh; a definite invalid-grant marks the connection "sign in again".

## What it refuses

Servers whose metadata does not match, that do not offer PKCE S256 and dynamic registration, or whose endpoints are not public HTTPS. Services that require a pre-registered app are refused with a clear reason. Scopes are requested only if the server's challenge named them; there is no automatic escalation.

## Why Beta

OAuth was tested end to end against a fake authorization server, and the real discovery documents of Linear, Notion and Sentry were fetched and parsed on 2 October 2026. A sign-in with a real provider account has not been completed, so the feature is labeled Beta. Expect rough edges and report them.

## State protection

The sign-in state is random, bound to your workspace and connection, single-use, expires after 10 minutes, and is stored sealed with the PKCE verifier. A mismatched issuer or a denial is refused.

## Limits of the current version

No pre-registered client ids or secrets, no scope step-up, and the older SSE transport is unsupported.
