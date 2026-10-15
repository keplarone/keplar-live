# Keplar Business for ChatGPT

This integration uses the existing Keplar Business account, projects, tasks, reports and agents. It introduces no second product or mascot. The supplied black geometric icon is the plugin icon.

## Endpoints after deployment

- MCP: `https://business.keplar.one/api/chatgpt/mcp`
- Protected resource metadata: `https://business.keplar.one/.well-known/oauth-protected-resource`
- Authorization metadata: `https://keplar.one/.well-known/oauth-authorization-server`
- Authorization: `https://keplar.one/api/chatgpt/oauth/authorize`
- Token: `https://keplar.one/api/chatgpt/oauth/token`
- Revocation: `https://keplar.one/api/chatgpt/oauth/revoke`
- Connection management (signed in): `https://keplar.one/api/chatgpt/connections`

The normal Keplar sign-in and MFA run on keplar.one. The Business host is the MCP resource. Authorization responses include the issuer, including cancellation.

## Authentication

ChatGPT uses `https://chatgpt.com/oauth/client.json` as its Client ID Metadata Document (CIMD), public-client authentication `none`, and PKCE S256. Only that fixed metadata URL is fetched. The client ID, supported method and stable callback `https://chatgpt.com/connector_platform_oauth_redirect` must match. This connection is for ChatGPT; a direct Codex CLI client is not supported.

The exact MCP `resource` is required during authorization and token exchange. Explicit consent is bound to the signed-in user, workspace, pending request and an HttpOnly nonce cookie. GET never grants access. Codes expire in two minutes and are consumed atomically. Access tokens last one hour. Refresh tokens rotate and last thirty days. Refresh and revocation immediately invalidate the old access token. Only credential hashes are stored. MCP calls never read session cookies or accept a workspace ID from a tool argument.

- `business:read`: account, projects, tasks, saved reports and agent/run status.
- `business:write`: create projects and tasks, update tasks and save report drafts. Also requires `business:read`.

Only the owner’s personal Business workspace is supported initially. Every call rechecks ownership and the current plan. Deleted accounts lose their codes and grants, which are also excluded from data exports. Pre-login requests have no account content and expired rows are swept during new requests.

The existing Neon database supplies durable storage. OAuth fails closed on Vercel without it. No new AI API key, client secret or payment configuration is needed.

## Tools

`get_account`, `list_projects`, `get_project`, `create_project`, `create_task`, `update_task`, `list_reports`, `get_report`, `save_report`, `list_agents`.

All tools use existing tenant-scoped repositories. Referenced projects are checked against the connected workspace. Discovery contains no private data.

This tool set does not send messages, spend, publish, approve outbound actions or change agent schedules. Keplar’s existing agents run on its own infrastructure. Creating a task or saving a report does not schedule unattended work.

## Plugin

The external-server plugin is described in `plugins/keplar-business/plugin.json` and `mcp.json`, including the supplied icon. Configure OAuth with CIMD and request both scopes to enable editing. The previously created Site prototype is a different App; do not rewrite its App binding or install this package before verifying the real endpoint.

## Verification and release

Run `npm run typecheck` and `node --import tsx --test tests/chatgpt*.test.ts`. A focused GitHub workflow runs these on relevant pull requests. Follow `CLAUDE.md` and the existing deployment process; do not deploy the app to a new host.

After deployment:

1. Read both discovery documents and verify their canonical URLs, S256, CIMD, `none`, issuer identification and scopes.
2. POST MCP `initialize` and `tools/list`; confirm the ten tools. Cookie-only `get_account` must return 401 with `WWW-Authenticate` pointing to protected-resource metadata.
3. Connect from ChatGPT, finish normal sign-in/MFA and review consent. Verify `get_account` and `list_projects` against the actual Keplar account.
4. With authorization, create a disposable project/task and save a report. Read them back in Keplar and ChatGPT. Another account cannot read their IDs.
5. Revoke the connection in Keplar; both its access token and refresh token must fail. Reconnect if desired.

Until those checks pass, report live integration as unverified.

Implementation reference: https://developers.openai.com/plugins/build/auth
