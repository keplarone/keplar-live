# Create: live collaboration, AI critic, one-click deploy (status)

Updated 2026-10-06 (ET). Production deploy `dpl_7sgy85pnRo84K3NwxYCiN3EWSVs8` (keplar-q5b2u9qkd-team-6667.vercel.app, aliased to keplar.one), built from a clean worktree at `bfc2a03` (UI included). Earlier API deploy: `dpl_5jMyFowg75SDawmXWwefDfQtsrMX` at `d034e20`.

## Commits
- `369c1e4` deps (yjs, y-protocols, y-codemirror.next, CodeMirror 6, axe-core, lib0)
- `bd2a2e2` backend for all three features plus tests
- `25fafcc` strict-type fixes, critic named colors as RGB, live-session draft preview (`/apps/draft/<id>/live/<token>/`), base fingerprints
- `e630f39` new collections classified in privacy/account-data, critic favicon font, CSS keyword exemption
- The proxy exemption for `/api/collab/` (outside the per-IP API limit; routes keep their own per-user limits) shipped inside `3de8594`, which committed src/proxy.ts whole.

## Shipped to prod (API, behind sign-in)
| Route | What |
|---|---|
| `GET/POST /api/collab/[id]` | role + actions, room (seeded / safe auto re-base / `behind`), transport, branches, base fingerprints, live preview URL; actions save / pull / split |
| `GET/POST /api/collab/[id]/sync` | relay transport: NDJSON stream (state-vector catch-up, merged updates, presence), batched pushes; viewers read-only |
| `GET/POST/DELETE /api/collab/[id]/invites` | invite links (editor/viewer, 1–30 days, 1–50 uses), revoke, remove person |
| `POST /api/collab/join` | redeem `#join=` token (verified email required) |
| `GET/POST /api/critic/[id]` | stored / quick report; streamed run: 63 rules, axe-core in Chromium, LLM pass (free plans use only `:free` models) |
| `POST /api/critic/[id]/fix` | apply selected fixes as a new version |
| `GET/POST /api/deploy/[id]` | overview (live URL + SSL, versions with preview URLs, rollback eligibility, history); streamed deploy / rollback with timestamped step logs; failed live check reverts the pointer automatically |

Tests: tests/collab-crdt.test.ts (10), tests/critic-rules.test.ts (7), tests/deploy-machine.test.ts (7), tests/deploy-flow.test.ts (2). All pass.

## UI (commit `bfc2a03`)
- `/app/create/live/[id]`: full-screen studio with Live / Critic / Deploy tabs. Opening an invite link (`#join=<token>`) redeems it, removes the hash and shows who you joined as. Signed out, it shows the sign-in gate and keeps the token for after sign-in. 403 and 404 get plain messages.
- AppBuilder has three new tabs, Live, Critic and Deploy, which use the full width (the ledger is hidden). Publish now opens PublishGate.
- LivePane:
  - CodeMirror 6 + Yjs editor; the critic gutter is driven by an instant rules pass in the browser.
  - Presence avatars: click one to follow that person, Esc to stop.
  - File tree with peer and issue dots.
  - Shared terminal; viewers are read-only.
  - Live preview: the draft URL for apps (reloads after edits), srcdoc for sites.
  - Invite dialog; save version and pull.
  - Banners for offline, behind and viewer.
- CriticPane: a streamed review (stages, then the report), category filters, a pass list with timings, diffs, per-finding and batch fixes, and "Show in editor". Fixes edit the live session (minimal Y.Text edits) or are saved as a new version.
- DeployPane:
  - Live card showing what visitors see, plus a Deploy button for owners and admins.
  - Step list with timestamped logs; the failed step opens on its own.
  - History; versions rail with Deploy this / Roll back to this.
  - DomainPanel embedded.
- PublishGate: the critic report for the version, its blockers and major findings, "Fix N and re-check" (then follows the new version), and "Publish anyway".
- features.ts: collaboration and the AI critic are `live` (href /app/create). Deploy had no gated entry.
- Small fix in AppBuilder: the `alive` ref is reset on mount. React StrictMode's dev remount had left it false, so the studio never loaded in `next dev`.

Tested:
- tests/create-advanced-ui.test.ts (5): structure, design rules, feature flags, siteSrcDoc, and a live fix converging across two peers. With collab/critic/deploy, create-tabs, app-builder and no-focus-box the suite is 47/47.
- Full `tsc --noEmit` in a clean worktree; eslint clean on the changed files.
- Headless Chrome against mocked APIs: zero overflow at 320, 390, 768 and 1280; editing syncs; follow mode, join, live apply-fix, deploy, the viewer read-only role, signed-out, and the AppBuilder tabs with the gate (fix, then publish).
- Screenshots in screenshots/create-advanced/.

Prod smoke (curl): `/`, `/app/create`, `/app/create/live/x` 200 (live page is noindex); `/api/collab/x`, `/api/critic/x`, `/api/deploy/x` 401; /features lists collaboration and AI critic as Live.

Known failures from other files (also present at HEAD): font.test.ts (src/components/embed/EmbedAsk.module.css, src/lib/create/showcase/data.ts) and us-english (field/monolith/CHAPTERS.md, lib/growth/lifecycle-emails.ts).

## Env vars / blockers
- `KEPLAR_COLLAB_WS_URL` + `KEPLAR_COLLAB_WS_SECRET` (optional): y-websocket-protocol server (Hocuspocus / y-websocket / y-partykit) for lower latency. Without them the Postgres relay is used; it works on Vercel today.
- `OPENROUTER_API_KEY`: needed for the critic's LLM pass (present in prod). If it is missing, the pass is skipped and the report says so.
- Custom domains: `VERCEL_DOMAINS_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` (present). This reuses the existing domain flow.
