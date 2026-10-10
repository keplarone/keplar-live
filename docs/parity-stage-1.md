# Parity stage 1: personal answers, side drafts, private and shared chats, scheduled questions

Date: 2026-10-06 (ET). Track: competitor parity (Grok, ChatGPT, Claude). The full table is in `docs/competitor-parity.md`.

## Shipped
- **Answer preferences** (Account > Personalization):
  - Fields: About you, How to answer, six styles, and an on/off switch.
  - Sent as a fenced block to every panel model and the final writer.
  - On Free, "About you" is not sent to free hosts.
  - Code: `src/lib/personalize/prefs.ts`, `/api/preferences`.
- **Specialists** (Account > Specialists, plus a picker above the composer):
  - Saved instructions, reference notes and starters. 3 on Free, 30 on paid.
  - Notes are withheld from free hosts.
  - The server only takes the specialist id and reads the rest from your own workspace.
  - Code: `src/lib/personalize/specialists.ts`, `/api/specialists`.
- **Private chat** (toggle on a new chat):
  - Never saved locally or to the account. The server does no memory read or write and no learning (`req.private`).
  - Kept out of the sidebar, history, search and topic titles. Gone when you leave it.
- **Reason** (composer chip):
  - Step-by-step framing (`<reason_mode>`) and medium reasoning effort.
  - The thorough panel on paid plans; Free keeps its `:free` roster.
  - Under the answer, a "how this answer was checked" list built only from real run data (`reason-trail.ts`).
- **Side draft**:
  - "Open as draft" on any answer, with Edit, Preview, Versions/restore and All drafts tabs.
  - "Revise with Keplar" covers the whole draft or only the selection, with per-plan size caps. "Apply to draft" then brings the revision back.
  - Copy and download. Drafts stay in this browser.
- **Code runner** (Run on JS/Python code blocks and code drafts):
  - The page is `/apps/code-runner`, inside an `<iframe sandbox="allow-scripts">` with its own strict CSP (`default-src 'none'`, network only to the pinned Pyodide CDN).
  - Code runs in a Worker with a time limit. Output is capped. matplotlib charts come back as PNGs.
- **Share chat**:
  - Pick turns, auto-hide emails, phones and long numbers, and hide your own words. A preview shows exactly what will go out, and the server redacts again.
  - Revoke gives an immediate 404. Links expire after 90 days. `/c/<token>` is noindex and text only.
  - Account > Shared links lists answer and chat links with revoke.
- **Scheduled question** agent:
  - Your question runs on your schedule through the same pipeline (`runAsk`).
  - The answer, agreement level and cited sources go to your Keplar inbox. Plus and up.
- Privacy registry: `answer_prefs`, `specialists` and `chat_shares` are exported and deleted with the account.

## Tests
`tests/parity-stage1.test.ts` (9 tests) covers:
- prefs sanitizing and fencing, plus Free withholding
- specialist validation, limits and team isolation
- redaction (including the sentence-final card number bug found while testing) and revoke
- reason trail from real data only
- draft versions, selection revise and plan caps
- Reason as a modifier
- runner message parsing and CSP
- private chat reducer lifecycle
- scheduled-question formatting

## Blockers (unchanged by this stage)
- `KEPLAR_RETRIEVAL_ENABLED`: live web search
- `X_BEARER_TOKEN`: X posts
- `KEPLAR_REALTIME_VOICE`: real-time voice
- Google/Slack/GitHub connector OAuth client ids: live connectors

## Known limits
- A specialist chosen for a signed-in chat isn't saved with the chat on the server (the chats API doesn't store it yet), so after a reload the chat answers without it until you pick it again.
- Drafts are per browser.

## Shipped
- Commit `1543e37`. Production deploy `dpl_A58dEphw4X63t9Uz41ecx5nNvayE` (https://keplar-l11rcz0iv-team-6667.vercel.app, aliased to keplar.one), built from HEAD `25fafcc`.
- Smoke checks: `/apps/code-runner` 200 with its CSP; `/api/preferences`, `/api/specialists`, `/api/share/chat` 401 when signed out; `/c/<bad>` 404. In the browser: Python printed output with a chart, JS ran, `fetch` from the sandbox was blocked, private chat toggle and banner worked, no console errors.
- Screenshots: `screenshots/parity/`.
