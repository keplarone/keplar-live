# Capability audit: missing features recovery

Audited and updated 2026-10-12. Each status below was checked against the code and the tests in this repository. Nothing is listed as working because a page or a document says so.

**Status values:**
- **Verified**: built, with an automated acceptance test that passes (`npm test`), and checked in the local dev app where it renders.
- **Built, not yet live-verified**: code and tests pass, but the real end-to-end path depends on something only production has (live models, the serverless browser). It has not been deployed by this work.
- **Partial**: some of the capability exists; the gap is named.
- **Blocked**: cannot be finished from this repository. The blocker is named.
- **Not built**: no implementation yet.

Deployment: none of the work below has been deployed. The last production deployment predates it.

## Matrix

| System | Status | What exists (code) | Acceptance test | Gaps and blockers |
|---|---|---|---|---|
| **Keplar Remembrance** (persistent memory) | **Verified** | `src/lib/memory/*`: saved notes (auto and "remember that…"), edit, delete, erase-all, on/off; facts screened for instructions, secrets, birthdates and addresses; relevant notes sent each turn within a token cap; past-chat recall. A new preference or name replaces the old one (`facts.ts#supersedes`), so the models never get both "short answers" and "long answers". Committed `e8f49db`. | `tests/memory.test.ts` "Remembrance acceptance": save, then recall in a later request, update (old note gone and not sent), delete (not sent). Also contradiction-handling unit tests. 13/13. | Retrieval is keyword overlap plus Postgres full-text search, not embeddings. Good enough at the 100-note cap; revisit if the cap grows. |
| **Keplar Browser** (AI-controlled browser) | **Removed by owner decision (2026-10-17)** | Pages, API routes (`/api/browser/tasks*`), `src/lib/browser/*` and its tests were deleted; `/app/browser` redirects to Ask. Its SSRF network guard is kept for the site QA browser in `src/lib/site-builder/qa/guard.ts` (tests in `tests/site-qa-guard.test.ts`). | n/a | n/a |
| **Keplar Vision** (authorized screen understanding) | **Verified (web)**; **Blocked (desktop apps)** | `src/components/app-ui/screen-share.ts` + the Composer's attach menu "Share screen". Only through the browser's own picker (`getDisplayMedia`, video only). A frame becomes an image attachment when sharing starts and each time the person presses Capture. An unchanged screen is not attached again (`frameSignature`). Stop, the browser's own "stop sharing" bar, or 15 minutes end it. No background capture loop. Committed `2b35c58`. | `tests/screen-share.test.ts` (fingerprint, error copy, labels, timeout, "no interval capture" source checks). In the dev app with a synthetic screen: share attaches one frame; Capture on an unchanged screen attaches nothing and says so; Capture after a change attaches a second frame; Stop removes the bar and ends the track. | **Desktop apps (keplar-desktop, keplar-business):** Electron rejects `getDisplayMedia` unless the main process registers `session.setDisplayMediaRequestHandler`. Neither app does yet. The fix must show a source picker the person chooses from (never auto-pick a screen), then ship as a desktop release. |
| **Keplar Computer Control** (desktop companion) | **Partial / Not built** | Only Roblox Studio is controlled, through the desktop app's Studio MCP bridge (`src/lib/desktop/studio-bridge.ts`, keplar-desktop `src/main/studio/bridge.ts`), started by the person. | — | General control of the person's computer (mouse, keyboard, other apps) is **not built**. It needs a native companion in the desktop app with OS permission prompts (macOS Accessibility and Screen Recording; Windows UI Automation), a visible "Keplar is controlling" indicator, a per-session grant, approval before purchases, sends and account changes, and a kill switch. A web page cannot do this, and Keplar does not claim it can. |
| **Keplar Cloud** (persistent offline execution) | **Verified for its task types** | Roblox Cloud jobs (`src/lib/roblox-cloud/worker.ts`: lease, checkpoints, slices, daily cron). Keplar Core "Keep working" jobs (`src/app/api/core/jobs`, slices + cron). Business agents on Inngest (`src/lib/inngest/functions.ts`: schedules, events, retries, per-workspace concurrency). (Keplar Cloud browser tasks were part of Keplar Browser and were removed with it.) | Existing Roblox Cloud, Core-jobs and agent tests. | There is no general "run anything overnight" job type: each kind of background work is its own worker. |
| **ChatGPT parity audit** | **Done** (`docs/competitor-parity.md`) | Every ChatGPT, Claude and Grok capability from their official help pages (links in that doc, checked 2026-10-06), with Keplar's status. Updated today for the browser agent and screen sharing. | — | Open gaps listed there: read/search connectors (Drive, Gmail, Docs), web search and Deep Research flag-gated by cost (`KEPLAR_RETRIEVAL_ENABLED`), native store apps. |
| **Proactive intelligence** | **Partial** | Daily brief, Scheduled question agents (cron, delivered to the Keplar inbox), event responders, lifecycle emails. | Existing agent and scheduler tests. | Nothing proactively watches the person's context without a schedule they set. That is deliberate: no hidden monitoring. |
| **Web retrieval** (supports Browser and answers) | **Partial** | OpenRouter web plugin and source check (off by default), `readLink` for pasted links (SSRF-safe), Deep Research. | Existing retrieval and link tests. | `KEPLAR_RETRIEVAL_ENABLED` is not set in production (cost decision for the founder). |

## Safety rules this work follows

- No silent screen capture: frames only from the browser's own picker, only at start and on Capture.
- No hidden remote control: the browser runs on Keplar's servers in its own context. Every step is saved and shown, and Stop is always available.
- Purchases, payments, sends, posts, deletes, accepting terms and signing in are handed back to the person. Passwords, card numbers and ID numbers are never typed.
- Page text is data, never instructions (the fenced prompt and the system rules), and the tests include a page that tells Keplar to buy.
- Tests use fixtures and synthetic screens, never real customer data.

## Next steps (need a decision or a release)

1. ~~Run one real Keplar Browser task in production~~ (Keplar Browser removed by owner decision).
2. Desktop apps: add a display-media handler with a source picker, then release (keplar-desktop and keplar-business).
3. ~~Link Keplar Browser from the app's navigation~~ (removed by owner decision).
4. Computer control companion: design review first (permissions, indicator, approvals). Not started.
