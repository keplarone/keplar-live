# Features 2 progress (projects with memory, scheduled agents, referral rewards)

Started 2026-10-04. Rules: never push or deploy; stage explicit paths only; other executors edit the same tree
(`docs/create.md` and other people's uncommitted files are not touched); one small step per commit.
Labels: **REAL** = works end to end with the code and tests in this repo. **BETA** = works but has a stated limit.
**COMING SOON** = not built; the UI says so.

## What already existed (extended, not duplicated)
- **Projects** (`/app` Projects view, `ProjectsView` in `src/components/app-ui/Views.tsx`): a name + `projectId` on chats, kept in the
  browser (localStorage). Chats sync to Neon (`chat_threads.projectId`). No server record of the project, no per-project context.
- **Sites** (`SiteProjects.tsx`): Create's site projects. Separate concept, untouched.
- **Memory** (`src/lib/memory/**`): account-wide notes (`memory_items`), chat digests, Account → Memory, the free privacy gate
  (`src/lib/privacy/free-gate.ts`, commit 151c624).
- **Agents**: Business OS agents (`src/lib/business/agents.ts`, `scheduler.ts`, `cron.ts`, Inngest functions, approvals, firewall,
  kill switch, caps; docs/business-os.md). The `/app` Agents view was a static "No agents running" stub.
- **Cron**: `vercel.json` has two daily crons (`/api/cron/domains`, `/api/cron/learning`), auth by `CRON_SECRET`.
- **Referral**: nothing existed (no code, no credit grant).

## Log

### (4) Saved projects with memory
- **REAL**: server-side projects (`projects`, `project_notes`, `project_files`; `src/lib/projects/**`, `/api/projects/**`). Each project holds
  instructions (1,500 chars), memory notes (50 × 220 chars, same hygiene as account memory: no links, secrets, birthdates or instructions to
  the assistant), files (10 per project, text only, 40k chars each / 150k total; the original file is not kept) and its chats
  (`chat_threads.projectId`, which now also follows a move into/out of a project via `PATCH /api/chats/:id {projectId}`).
- **REAL**: the Projects view opens a workspace per project: view/edit/delete each note, add notes, clear memory, add/remove files, open or
  delete the project's chats, per-project memory switch, JSON export (`/api/projects/:id/export`), delete project (chats kept or deleted).
  A project that only existed in the browser is adopted on first open under the same id; the server list merges into the local one on other devices.
- **REAL**: project context is added to chat requests as a fenced, token-capped block (`<<<KEPLAR_PROJECT`), only after the server checks the
  project belongs to the signed-in account.
- **Privacy gate (151c624)**: `allowed = !withheld` in `/api/keplar`. On Free (and support replies) while free hosts may train
  (`KEPLAR_FREE_DATA_COLLECTION != deny`) nothing of a project (notes, files, instructions) is read or sent; the workspace says so. Tests
  (`tests/projects-api.test.ts`) capture the outgoing model request bodies. Also off when the account memory switch or the project's own switch is off.
- "Erase my memory" (chat command + Account) also clears project notes. Account export/delete include the three new collections.
- **COMING SOON** (labelled in the UI): Keplar suggesting notes from project chats. No model writes to project memory today; notes are only the ones you add.
- Pending: project-level sharing/collaboration (not built, not promised).

### (5) Agents on a schedule
- **REAL**: `/app` Agents is a live page (was a static stub): add Daily brief, Page monitor (BETA), Lead follow-up (plus the existing invoice reminder / weekly report),
  edit schedule (presets or cron + IANA time zone), pause/resume, run now, per-run history (steps, drafts and their status), stop for good, stop-all switch,
  caps and plan limits. Backend: `/api/business/agents[/:id[/runs]]`, `/api/cron/agents`, `src/lib/business/{schedule-limits,monitor}.ts`; cron matcher is time-zone aware.
- **REAL**: outbound is always a draft in Approvals (lead follow-up drafts `email.send`; brief and monitor write only to the in-app inbox); scheduled runs ignore auto-send.
- **REAL**: server-side 24/7 through Vercel cron (`vercel.json`, daily on Hobby) and, when Inngest keys exist, Inngest's 5-minute tick; exactly-once by slot claims.
  Limits documented in `docs/business-os.md` §7a. Per-plan: Free/Lite none (Free pool untouched), Plus 3 agents / daily / 12 runs a day, Pro 10 / hourly / 96, Business 50 / 15 min / 480.
- **BETA**: page monitor (text-only public pages, no JS or login).
- **COMING SOON**: emailing or Slack-posting briefs.
- **Pending / honest limit**: on Hobby, a schedule runs once a day at best (±1 h); precise or sub-daily timing needs Inngest keys or Vercel Pro. Lead follow-up needs Gmail connected.

### (10) Referral rewards
- **Existed before**: nothing (no code, no grant). Built on the existing limit-extension credit ledger rather than a new balance.
- **REAL**: per-account unique invite code/link (`/invite/<code>`), claim by the new, email-verified account, reward = **extra usage credit only** for referrer and friend
  (500 each by default, env-tunable, expire in 180 days; spent on Lite/Plus/Pro after the plan's allowance, waiting on Free/Business). No cash/payout path exists; a test enforces it.
- **REAL**: abuse protection: one reward per new account and per normalised mailbox and per browser, self-referral block (account, mailbox, browser), throwaway-domain block,
  network / company-domain / young-referrer clusters held for admin, atomic per-referrer monthly (5) and lifetime (20) caps, program-wide daily cap (100), kill switch `KEPLAR_REFERRALS=off`.
- **REAL**: `/referral-terms` (built from live settings, in the sitemap), cookies disclosed in the privacy policy, Account → Invite friends, in-app claim notice, `/admin/referrals` (totals, claims + reasons, approve/deny, audited).
- **Honest limits / pending**: heuristics reduce but cannot eliminate farming (bounded by caps); no email notification when a held claim is approved (COMING SOON); unit-tested at API level, browser e2e noted below.
  See `docs/referrals.md`.

### Verification (2026-10-04)
- `npx tsc --noEmit` clean; `npm run lint` 0 errors (34 pre-existing warnings); `npm test` 1757 pass / 0 fail (before the last lint-only commits; the touched test files re-run green).
- Browser e2e (`e2e/features2.e2e.ts`, production build in an isolated copy so other executors' `.next` was untouched): 6/6 pass: Agents add/edit schedule/pause/run now/history on desktop and phone,
  Free sees "Plus and up" and no Add button, invite link → sign-up note → claim notice, Account → Invite friends, referral terms, project memory add/delete + export link.
  Screenshots checked at 1280 and 390 px in Light and Dark.
