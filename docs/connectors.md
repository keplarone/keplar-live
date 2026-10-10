# Connectors (Gmail, Google Calendar, Slack, GitHub; Notion and Linear via Connected apps)

Status: **BETA**. Implemented and unit-tested with mocked provider APIs. **Not tested against the real providers**: that needs your OAuth app keys.

## What works
- **Gmail** (send one email), **Google Calendar** (create an event on the primary calendar), **Slack** (post a message), **GitHub** (open an issue in a public repo): OAuth sign-in, encrypted token storage (AES-256-GCM, workspace-bound, `src/lib/mcp/crypto.ts`), automatic Google token refresh, real API calls.
- **Per-tool switches**: after connecting, every tool is OFF. Turn on only what agents may use (Business > Connectors).
- **Approval**: every one of these tools writes outside Keplar. Each use passes the AI Firewall and waits in the approval queue; calendar events and GitHub issues are always high risk (never auto-sent); emails to people who aren't contacts are never auto-sent either.
- **Needs check**: an agent whose connector isn't connected (or whose tool is off) does not run. The run is recorded as failed with "Needs Gmail. Connect Gmail under Connectors…", costs no Usage, and drafts nothing.
- **Notion and Linear**: connect through **Connected apps** (remote MCP over OAuth, BETA); the Connectors tab links there.

## Hidden until you add keys (server environment, e.g. Vercel)
A connector whose server keys are not set is **hidden from regular users**: no card, no "Not configured" badge, no env var names, no redirect URI (`src/lib/business/visibility.ts`; the API never sends them). Admin accounts (`KEPLAR_ADMIN_EMAILS`, default team@keplar.one) see them in an admin-only **Setup needed** section under Business > Connectors, with the env names and redirect URI. Plaid and Stripe bank linking (Financial Connections) follow the same rule: hidden until `PLAID_CLIENT_ID`/`PLAID_SECRET` or `STRIPE_SECRET_KEY`/`STRIPE_PUBLISHABLE_KEY` are set. See `docs/banks-and-analytics.md`. An already-connected connector stays visible so it can be switched off. If nothing is available the tab shows a calm "Nothing to connect yet" note. Agent workflows that need a hidden connector (Gmail, Slack, Social scheduler) are not offered in "Add an agent" (and the API refuses them); once the keys are set they appear.

| Connector | Env vars | Redirect / callback URL |
|---|---|---|
| Gmail + Google Calendar | `GOOGLE_CONNECT_CLIENT_ID`, `GOOGLE_CONNECT_CLIENT_SECRET` | `<site>/api/business/connectors/oauth/callback` |
| Slack | `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` (bot scopes `chat:write`, `chat:write.public`) | same |
| GitHub | `GITHUB_CONNECT_CLIENT_ID`, `GITHUB_CONNECT_CLIENT_SECRET` (scope `public_repo`) | same |

`<site>` is `BETTER_AUTH_URL` when set, otherwise the site URL. The Connectors tab shows the exact redirect URI.
Google's `gmail.send` and `calendar.events` scopes are sensitive: until the Google app is verified, Google shows an "unverified app" screen (works for listed test users). Outlook and the social scheduler remain "Not set up yet".

## Limits
- GitHub uses `public_repo`: issues in public repositories only.
- Slack posts need the bot in the channel or `chat:write.public`.
- Reading mail/calendar/Slack isn't offered yet, so nothing reads your data.

## Verification status (kept honest in code)
`src/lib/business/verification.ts` lists every connector with `verified: false` until someone has completed a real sign-in and a real read/write against the live provider and recorded the date. While it is false, the Connectors and Connected-apps screens show "Not verified with live accounts" and a beta note. `tests/connectors-honesty.test.ts` fails if an entry is set to verified without a date, and checks that a provider 500, a network failure or a non-JSON 200 never reports success (Gmail, Calendar, Slack and GitHub must return a confirming id/link/`ok:true`). All of those tests use simulated provider responses.
