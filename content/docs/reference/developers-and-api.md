---
title: Developers and API status
description: What Keplar offers developers today (and what it does not): a beta API with keys on paid plans, outbound MCP connections, a shareable answer format, and what is still missing.
order: 4
updated: 2026-10-04
keywords: Keplar API, developer, MCP, API access, programmatic
related: /developers, /for-developers, /docs/connectors-agents/connected-apps-overview, /docs/connectors-agents/add-a-connection
---

This page is deliberately plain about what exists, because many "API" pages promise more than the product has.

## What exists today

- **A beta public API for paid plans (Lite and above).** Create a key in Account, then call `POST /api/v1/ask` (JSON or streaming) to get one final answer plus a summary of where the models disagreed. It is documented, with an OpenAPI description, on [/developers](/developers). Free is excluded on purpose, so scripts cannot use the shared Free pool. Answers spend the same credits as in the app, and each key also has per-minute and per-day limits.
- **Use Keplar in the app** in a browser or the desktop app.
- **Connect your own tools** to Keplar over remote MCP servers. See [Connected apps overview](/docs/connectors-agents/connected-apps-overview). This lets Keplar call your tools; it is not a way for you to call Keplar.
- **A beta browser extension** (Manifest V3) that asks about selected text or the current page using your API key. It is not listed in any browser store yet.
- **Build and publish sites** in Create.
- **Export your data** as JSON from Account.

## What does not exist

- **A stable promise for the app's own endpoints.** The app talks to its own server endpoints, including a streaming endpoint that sends answers as newline-delimited JSON events. That is an internal interface and may change without notice. Use `/api/v1` instead.
- **An SDK.**
- **Webhooks for your own systems.**
- **API access on the Free plan, tool use, file or image inputs, and team-level keys.**
- **An uptime or support commitment.** The API is a beta.

## If you want more

Describe your use case through the [Inquire form](/inquire). New API features will be announced in the docs and in the [release notes](/changelog).

## If you want the same idea in your own code

The pipeline is simple to describe: ask several different models, compare positions, check the draft against the responses, then write a synthesis. The docs under How it works explain each step in enough detail to build a version of your own with whichever provider APIs you use. Start with [Pipeline overview](/docs/how-it-works/pipeline-overview).

## Honest note on the endpoint

Do not build a product on the app's internal endpoints. Requests that look like automated scraping of them may be rate limited. The beta API is the supported way in.
