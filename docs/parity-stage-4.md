# Parity stage 4: Event responders, Family mode, Specialist directory, API tools, Specialist sync

Date: 2026-10-06 (ET). This track has not deployed anything. These commits go out with the next HEAD deploy.

## Built
- **Event responders** (`lib/business/event-agents.ts`, `event-dispatch.ts`, template `event-reply`; commit 4ecba8f). This is a new agent template that starts on an event, not on a schedule.
  - **Webhook.** Each agent gets its own secret URL `/api/webhooks/agents/<token>`.
    - The token is shown once and stored only as a sha256 hash. "New webhook URL" rotates it.
    - Responses: 202 when accepted, 404 for an unknown token, 409 when the agent is paused, 413 above 32 KB.
    - Rate limits: 30 per IP and 60 per agent.
  - **Email.** Each agent gets an address, `agent+<route>@<domain>`, served by Postmark inbound at `/api/webhooks/inbound-email`.
    - The endpoint requires Basic auth, checked in constant time.
    - Mail from senders not on the agent's allow-list is dropped. Without configuration the endpoint returns 503.
  - **What a run does.** It records the event to the inbox, then:
    - for an email, drafts a reply;
    - for a webhook, writes a summary and can draft a Slack post.
  - **Approval.** Every outbound action waits for the owner's approval, on both the Inngest path and the local path. This is enforced by template inside `runAgent`, and `autoSend` is refused for this template.
  - **Untrusted content.** Email and webhook content is treated as data, never as instructions.
  - **Fallback.** Without Gmail connected, the drafted reply stays in the inbox.
- **Family mode** (`lib/personalize/family.ts`, `/api/family`, Account > Family; commit d509fee).
  - **Parent PIN.** 4–8 digits. Repeated digits and straight runs are rejected. The PIN is stored as an scrypt hash with a salt.
  - **Lockout and reset.** 5 wrong tries lock the PIN for 15 minutes. Resetting a forgotten PIN requires signing in within the last 10 minutes.
  - **Answers.** Age-appropriate rules (13–17) come first in every answer on the account, including the API and Embed. Optional homework guidance explains the steps instead of handing over the answer.
  - **Hidden features.** Private chat, Talk live and Posts on X are hidden. The voice and X routes also refuse requests server-side.
  - **Data.** The settings are exported and deleted with the account. The PIN fields are redacted in exports.
- **Specialist directory** (`lib/personalize/specialist-directory.ts`, `/api/specialists/directory`, `/admin/specialists`, public `/specialists`; commit 17177d2).
  - **Listing.** An owner asks to list a Specialist link and picks a category.
  - **Screening.** An automatic screen runs first: the moderation check plus rules against instruction overrides, keys and card numbers. Anything flagged is rejected. Everything else waits for an admin.
  - **Public page.** Only approved listings with live links appear, with category chips and search.
  - **Owner controls.** Owners can withdraw a listing and see its status in Shared links.
  - **Caps.** 5 pending and 20 listed per account.
- **API built-in tools** (`lib/api/tools.ts`; commit a35f901). `POST /api/v1/ask` accepts `tools`, given as strings or `{type, urls?, query?}`:
  - `reason` and `debate`.
  - `web_search` and `deep_research`. These are off unless `KEPLAR_RETRIEVAL_ENABLED` is set, and never on Free.
  - `read_url`: up to 3 links through the SSRF-safe reader. These count toward the daily link reads, and the answer cites them.
  - `x_search`: needs `X_BEARER_TOKEN` and a paid plan, and is off in Family mode. Posts are passed as material labeled "claims by their authors, not verified facts".
  - **Outcome report.** The answer gains `tools: [{type, status, detail}]`, where status is `used`, `requested`, `unavailable` or `failed`. A tool that can't run is reported, never faked. `requested` means the mode was switched on, and the pipeline's own gates can still skip it.
  - **Docs.** The OpenAPI spec, `docs/api.md` and the /developers page are updated.
- **Specialist sync fix** (stage 1 gap; commits 2487c46, dbb96fb). A chat's Specialist is saved with the account copy (`chats.specialistId`, validated) and restored on other devices.

## Tests
- Stage 4 test results, all passing:

  | Test file | Tests |
  |---|---|
  | `parity-stage4-events` | 5 |
  | `-specialist-sync` | 1 |
  | `-family` | 4 |
  | `-directory` | 2 |
  | `-api-tools` | 4 |
- `api-keys` (17) still passes. The agents, chats and store suites pass.
- A scoped typecheck of the stage 4 files is clean. ESLint shows 0 errors.
- The audits show no new failures. The remaining ones belong to other tracks: core/signal, embed/ask, templates like, `sb_template_likes`, CHAPTERS.md, critic css, lifecycle-emails, team sites list.
- No build, dev server or screenshots this stage, because memory on the shared box is limited.

## Blockers (all flags are off until set)
- **Email events.** `KEPLAR_INBOUND_EMAIL=postmark`, `KEPLAR_INBOUND_EMAIL_DOMAIN`, `KEPLAR_INBOUND_EMAIL_SECRET` (16+ chars), plus a Postmark inbound stream and MX record for the domain.
- **Sending approved replies and posts.** Gmail and Slack connector client IDs.
- **Directory screening.** `OPENAI_MODERATION_API_KEY` for the live moderation check. Without it only the keyword rules run, and an admin still approves every listing.
- **API and X tools.** `X_BEARER_TOKEN` for `x_search`. `KEPLAR_RETRIEVAL_ENABLED` for `web_search` and `deep_research`.

## Notes
- Family mode hides Private chat in the app. The server still honors a private flag for memory, and the family rules apply to private chats too.
- Without Inngest, event runs use `after()` on the request that received the event.
