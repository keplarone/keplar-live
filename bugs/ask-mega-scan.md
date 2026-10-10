# Ask / chat mega scan — 2026-10-06 (EDT)

Deeper pass after Create Phase 2 deploy (`dpl_BSe3G6VzAQk9xTCV8WCmgts1ZaMY`).

## Method
- Surfaces: `KeplarApp`, `Composer`, dock overlay, `KeplarTurn` stream/retry, `useChatSync`, chat delete/undo, Create-in-chat (`CreateTurn`), ChatTools, Debate/Study/Slides/Deep Research composer entry, intent router.
- Unit tests green: chat-delete, chat-edits, chat-context, chat-understanding, streaming (+preview), followup, composer-*, chat-create, chat-intent, chat-cards, debate, study, slides, deep-research, identity, layout-contracts, chat-tools-empty (new).
- Live: smoke-prod already green on keplar.one; Ask HTML often WAF-denied from this box.

## Findings

| ID | Sev | Finding | Status |
|----|-----|---------|--------|
| A1 | P2 | Composer CSS comment said “quiet blue focus glow” while tokens use ink/white `--ring-rgb` | **fixed** |
| A2 | P2 | No contract locking ChatTools empty-nudge removal (`2751a19`) | **fixed** (test) |
| A3 | — | Stream/retry, network fail → Retry, delete+undo, sync 409, Create-in-chat confirm/stall retry, Tools empty hide, dock `--dock-h`, studio mode exclusivity, free Debate skip reasons, identity age scrub | **ok** (verified) |
| A4 | P2 | Module CSS still declares `outline: var(--b-focus)` in places; globals already `outline: none !important` on /app | **wontfix** for Ask (globals win); cleaned leftover Create/Settings module outlines separately |
| A5 | — | No P0/P1 found in deeper Ask pass | — |

## Counts
- Found: 0 P0, 0 P1, 2 P2 (both fixed) + verified OK list
- Open Ask: none blocking

## Commits / deploy
- Commits: `c5792e8` (Ask), with Create P2 `25df890` and Settings `cc15427`.
- Deploy: `dpl_DTgqw66SupBPV1HPJokkY3vYJL1j` → https://keplar-49rj7u971-team-6667.vercel.app aliased to https://keplar.one. smoke-prod passed.
