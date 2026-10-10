# Connected apps (MCP)

Users connect remote **Model Context Protocol** servers (Streamable HTTP, JSON or SSE replies) under
Business > **Connected apps**. Code: `src/lib/mcp/`, API `src/app/api/mcp/`, UI `src/components/business/McpConnections.tsx`.

## Plan gating (decision)
| Plan | Connections | Calls/day | Calls/min | Concurrent |
|---|---|---|---|---|
| Free | not available (402 with upgrade hint) | 0 | 0 | 0 |
| Plus | 3 | 100 | 20 | 2 |
| Pro | 10 | 500 | 40 | 3 |
| Business | 25 | 2000 | 80 | 5 |

Why: calling arbitrary third-party servers is the most abusable thing the product does (outbound traffic, data egress, spend).
Limits live in `src/lib/mcp/limits.ts`. Each call costs `mcp.call` is metered in `compute.ts` (shown in the UI as about 1 credit).

## Enforcement chain (server-side, `gateway.ts`)
Every call, whether from the UI, an approval or an agent, goes through `runToolCall`:
owner auth > server belongs to workspace > tool enabled and schema unchanged > args validated against the stored schema >
agent grant (tools list, daily calls, monthly units) > plan, per-minute, per-day and per-user concurrency caps > credit charge >
timeout-bound call (reads: up to 3 bounded retries; writes: exactly one attempt) > output sanitised, fenced and capped > audit receipt.
Idempotency: a receipt is keyed by approval or request id; replays return the stored result and never call the server twice.

## Approval policy
- New tools start **disabled**, risk **unknown**, auto-run off.
- Firewall (`firewall.ts`): `mcp.call` is high risk unless the owner marked the tool **read**.
- Auto-run needs all of: tool kind = read, auto-run on, agent grant for that tool, and agent autoSend (for Ask in chat: the account policy `mcpChatAutoRun`). Otherwise an approval is queued.
- Writes, unknown tools and **scheduled runs always ask**. The owner approves in Approvals; execution happens on approval.
- A changed tool schema (hash) disables the tool until the owner re-enables it ("schemaChanged").
- At most 20 pending MCP approvals per workspace.

## SSRF (`ssrf.ts`)
https only in production; no credentials or query-string secrets in the URL; hostname resolved once, every address must be public
(loopback, private, link-local, CGNAT, multicast, reserved, cloud metadata, IPv4-mapped IPv6 are blocked) and the socket is pinned to the
validated IP (DNS-rebind safe). Redirects are followed manually (max 3), re-validated per hop; auth headers are dropped cross-origin.
Timeouts and response-size caps apply to every request.

## Secrets (`crypto.ts`)
Bearer tokens / API keys are encrypted with AES-256-GCM. The key is HKDF-derived per workspace from `BETTER_AUTH_SECRET`; AAD is
`workspaceId|rowId`, so a ciphertext cannot be moved between users or rows. Secrets are never returned to the client (only a
`hasSecret` boolean) and are scrubbed from errors and logs.
**In production the feature refuses to store a credential (503) if `BETTER_AUTH_SECRET` is missing or shorter than 16 characters.**
Rotating that secret makes stored credentials undecryptable; users must re-enter them.

## Untrusted output (`sanitize.ts`)
Tool output is data, never instructions. It is stripped of invisible characters, instruction-like lines, active content and secret-shaped
strings, then wrapped in a fence before display or storage. It cannot change policy, firewall decisions, grants or budgets, because
those are decided before the call from stored settings only. Tool schemas from servers are also validated and size/depth capped (`schema.ts`).

## Ask (chat) tools (`chat.ts`)
Signed-in Plus/Pro/Business users can switch **Tools** on per conversation (bar above the composer, lists the active apps). It is a
request only: the server re-checks plan, sign-in and grants. Free and anonymous users get no tools and no planner call.
- **Architecture.** The chat engine has no native tool-calling. Tool use is a bounded *pre-stage* in `/api/keplar`, run inside the stream
  before `orchestrate`: a small planner model sees only the question, recent turns and a compact list of allowed tools (`t1..tN`, never URLs or
  secrets) and may propose calls as JSON; the server executes them and hands the fenced results to the answering models as context.
- **Simple questions never trigger tools.** A deterministic gate (`toolsLookRelevant`) must pass before the planner is even called; the planner
  prompt defaults to "no tools". Tests cover greetings, maths and general knowledge.
- **Principal.** Calls run as the pseudo agent `chat` ("Ask (chat)"). The owner grants tools to it per connection (Agent permissions > Ask) with
  daily-call and monthly-credit budgets (defaults 30 calls/day, 200 credits/month). Without a grant a tool is not even offered.
- **Same path as everything else.** Every call goes through `runToolCall` (args schema check, firewall `inspectAction`, grants, plan/rate caps,
  credit charge, timeout, sanitised + fenced output, receipt). Approving a chat card runs the same function with the same checks.
- **Auto-run needs all four:** tool kind = read, tool auto-run on, tool granted to Ask, **and** the account policy "Let Ask run read-only tools
  without asking" (`biz_settings.mcpChatAutoRun`, default off). Writes, unknown tools and anything else produce an **inline approval card** in
  the chat (Approve / Decline call `/api/business/approvals/:id`); nothing runs until approved. Scheduled agent runs still always ask.
- **Bounds.** Max 5 tool steps per turn, 3 planner rounds, 3 calls per round, 45 s total, 15 s per planner call; identical calls are
  de-duplicated; the pending-approval cap (20) applies. Hitting a cap ends tool use and the answer continues without further tools.
- **Cost.** The planner call is metered (`assertCanSpend` first, `chargePlanner` at `METER_MARGIN`); each tool call is ~1 credit. Tool results
  reduce the remaining answer budget.
- **Visible, not hidden.** The answer shows "Using <app>: <tool>" states with receipts (status, time, call id), approval cards and refusals.
  The planner's reasoning is never shown or stored; only the proposal that was executed or put on hold.
- **Untrusted.** Results are sanitised, fenced and capped per call (3.5k chars) and in total (10k) and prefixed with a note that they are data,
  not instructions. They are sent to the models answering that question (disclosed in the UI).
- `GET/PUT /api/mcp/chat` returns status (apps, autoRun) and sets the account policy. Tests: `tests/mcp-chat.test.ts`, `tests/mcp-chat-route.test.ts`.

## OAuth sign-in (BETA) (`oauth.ts`)
For remote servers that only offer sign-in with an account (Linear, Notion, Sentry were checked). Choose **OAuth (BETA)** in Add a connection (or
a connector marked BETA), approve on the provider's own page, and Keplar keeps only encrypted tokens.
- **Discovery.** Unauthenticated probe > `WWW-Authenticate` challenge (`resource_metadata`, `scope`) > RFC 9728 protected-resource metadata (its
  `resource` must match the MCP address) > RFC 8414 / OIDC authorization-server metadata (issuer must match; `S256` PKCE and a
  `registration_endpoint` are required). All endpoints must be public https (same SSRF client; token/registration POSTs never follow redirects).
- **Registration and sign-in.** Dynamic client registration (RFC 7591) as a public client with our callback `/api/mcp/oauth/callback`, one client
  per connection; PKCE S256; the RFC 8707 `resource` parameter; `scope` only if the server's challenge named one (no `offline_access`, no escalation).
- **State.** Random, bound to the signed-in workspace and connection, single use, 10-minute expiry, stored sealed with the PKCE verifier
  (collection `mcp_oauth`); an `iss` mismatch (RFC 9207) or a denial is refused. The callback needs the owner's session (anonymous visitors go to
  sign-in), reflects nothing from the query string and redirects only to `/app?mcp_oauth=ok|denied|state|failed`.
- **Tokens.** Access/refresh tokens, client id and endpoints are sealed with AES-GCM (same `crypto.ts`, key from `BETTER_AUTH_SECRET`, bound to workspace + record)
  and never returned by any API. They refresh 60 s before expiry (one in-flight refresh per connection; rotated refresh tokens are stored), a 401 triggers
  one forced refresh and retry, and a definite `invalid_grant` marks the connection "sign in again" (`oauth_reauth`). Replacing a pasted credential is refused for OAuth connections.
- **Checked vs not.** Tested end to end against a fake authorization server (`tests/mcp-oauth.test.ts`: discovery, DCR, PKCE, state binding, refresh/rotation,
  revocation, unsafe servers). The real discovery documents of Linear, Notion and Sentry were fetched and parsed (2026-10-02); Asana is refused with a clear
  reason because it needs a pre-registered app. **No sign-in with a real provider account has been performed**, so it stays labelled BETA.

## Limitations (honest)
- OAuth is **BETA** (see above): dynamic registration only (no pre-registered client ids/secrets), no scope step-up, not verified with real provider logins.
- The legacy two-endpoint SSE transport is reported as unsupported.
- Ask tools: the planner is a small model and may skip or misjudge a tool; tool output is sent to the answering models; scheduled agent runs always queue approvals.

## Popular connectors (`popular.ts`)
Verified 2026-10-02 with a real `initialize` request: Context7, DeepWiki, Microsoft Learn, Cloudflare Docs, Hugging Face, Exa (no auth);
GitHub and Stripe (bearer token; not exercised with real tokens). Linear, Notion and Sentry are listed as BETA (OAuth; discovery verified, sign-in not).
Asana and PayPal are omitted (pre-registered app required). Re-verify before editing the list.

## Data
Collections `mcpServers`, `mcpTools`, `mcpGrants`, `mcpReceipts`, `mcp_oauth` (pending sign-ins) (`business/repo.ts`), all in `USER_COLLECTIONS` so account export and
deletion cover them. Deleting a connection removes its tools, grants and secret.

## Tests
`tests/mcp-ssrf.test.ts`, `tests/mcp-gateway.test.ts` (firewall/approval gating, isolation, timeouts, retries, idempotency, concurrency,
size caps, schema change, untrusted output), `tests/mcp-api.test.ts` (secret non-leak, cross-user isolation, anonymous 401, production
secret gating, Free gating), `tests/mcp-chat*.test.ts` (Ask tools), `tests/mcp-oauth.test.ts` (OAuth against a fake authorization server). A fake MCP server and OAuth server lives in `tests/helpers/fake-mcp.ts`; no test touches the network.
