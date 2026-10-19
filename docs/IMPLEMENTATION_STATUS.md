# Implementation status (master production directive)

Resumable log of the directive's milestones. The audit that set this order is `docs/AUDIT-2026-10.md`. PR #81's own audit and fixes are in `docs/engineering-audit-2026-10-19.md`. Statuses: planned, in progress, built (tests pass, not deployed), live (on `main`, which deploys to keplar.one), blocked.

| # | Milestone | Status | Where | Evidence |
|---|---|---|---|---|
| 0 | Repository audit | built | PR #84 | `docs/AUDIT-2026-10.md` |
| 1a | Server citation check for Deep Research (supported / partly / not verified, nothing removed) | live | #81 (`40a8f8e`) | `src/lib/research/citation-check.ts`, `tests/deep-research.test.ts`, `e2e/citation-check.e2e.ts` |
| 1b | Citation check: conflicting figures with the page's quote, fuller page text | built | PR #84 | `tests/deep-research.test.ts` ("a conflict needs a different figure…", "reads the fuller page text…") |
| — | Central `authorize()` gate (MCP calls first) | live | main `9ea123c` | `src/lib/security/authorize.ts`, `tests/authorize.test.ts` |
| — | Versioned side SQL setup (auth tables) | live | main `97e5900` | `src/lib/accounts/sql-setup.ts`, `tests/sql-setup.test.ts` |
| 2 | Shared task-state machine with enforced transitions and audit | planned | — | — |
| 3 | Unified, hash-chained audit events | planned | — | — |
| 4 | Proof-of-completion receipts | planned | — | — |
| 5 | Versioned migrations for the remaining DDL, at deploy | planned (needs owner approval: production database) | — | — |
| 6 | Catalog refresh job with price diff | planned | — | — |
| 7 | Money ledger reconciliation | planned (needs owner approval: payments) | — | — |
| 8 | 2FA fail-closed | planned (needs owner approval: auth) | — | — |

## Citation check notes

- Deep Research web search runs only when `KEPLAR_RETRIEVAL_ENABLED` is set, so the check runs only on answers that actually read pages.
- Not verified against live search results: the tests use recorded-shape pages. The first real Deep Research runs should be read by a person to tune the thresholds in `citation-check.ts`.
