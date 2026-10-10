---
title: Connected app security
description: How Keplar defends against server-side request forgery, prompt injection through tool output, secret leaks and silent tool changes when you connect MCP servers.
order: 5
updated: 2026-10-03
keywords: MCP security, SSRF, prompt injection, tool poisoning, encrypted tokens
related: /docs/connectors-agents/connected-apps-overview, /docs/connectors-agents/tool-permissions-and-approvals, /docs/connectors-agents/oauth-sign-in-beta
---

Letting an AI call outside tools is powerful and risky. These are the controls and what they are for.

| Risk | What Keplar does |
|---|---|
| Server-side request forgery: pointing Keplar at your private network or a cloud metadata address | HTTPS only; hostnames must resolve to public addresses; private, loopback, link-local, shared, multicast and reserved ranges refused; connection pinned to the checked address; manual redirects (max three) re-checked on every hop |
| Credentials leaking into logs | No secrets in the URL; credentials encrypted at rest, bound to workspace and record; never returned to the browser |
| A tool silently changing meaning | Schema hash; changed tools are disabled until re-enabled |
| Prompt injection through tool output | Output stripped of invisible characters, instruction-like lines, active content and secret-shaped strings, then fenced and capped. Permissions are decided before the call from stored settings, so output cannot change them |
| Runaway use | Per-plan, per-day, per-minute and concurrency limits; a credit charge per call; agent budgets |
| Unreviewed side effects | Writes, unknown tools and scheduled runs always wait for approval |
| Replays | Receipts make an approval run once |

## Honest limits

These controls reduce risk; they do not remove it. Content from a tool is still read by a model, and a model can be misled by cleverly written text. A server you connect is trusted with the arguments you let it receive. Connect servers you trust, enable few tools, keep write tools on approval, and read what you approve.

## Reporting

If you find a way around any of this, see [Report a vulnerability](/docs/privacy-security/report-a-vulnerability).
