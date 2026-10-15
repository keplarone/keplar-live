# Project Rebirth: plan

Principle: fix what the audit proved, in risk order, in small reversible commits, each with a regression test; measure before
and after; never remove a capability without a row in `PARITY.md`. "Rebirth" is a sequence of verified improvements, not a
rewrite: the platform's core (tenant-scoped store, SSRF guard, sandboxed user content, signed webhooks, MCP gateway) is sound
and is kept.

## Phase 1 — Discovery (done)
`AUDIT.md` (all findings with file/line and status), `PARITY.md` (every feature and its disposition), `BASELINE.md` (measured
performance). Seven independent reviews; high findings re-checked by reading code.

## Phase 2 — Security and reliability of what exists (in progress)
1. Auth: AUTH-1, 2, 3, 4, 5, 7, 8, 10.
2. Authorization: AZ-1, 2, 3, 4, 6.
3. Agents: AI-1, 2, 3, 9, 10.
4. Input/browser: IN-1, 2, 3, 4 (done).
5. CI gate (OPS-1): tests, typecheck, lint, audit, secret scan and build on every pull request and push; Dependabot.
6. Desktop: DSK-1 and the small items (log redaction, Poly Haven host/size cap, async save dialog).
Exit: every High is Fixed or explicitly Accepted with a reason; CI green on `main`.

## Phase 3 — Data-path performance and durability
PERF-1…7 (projection and SQL-side filtering instead of loading whole collections), REL-1 (durable media jobs via Inngest or
`after()` plus a reaper), REL-2 (timeouts), REL-4 (`after()` for post-response work), PERF-8 (parallel reads before the first
byte of a chat turn), DDL out of cold start. Measure each on the same machine and record before/after in `BASELINE.md`.

## Phase 4 — Front-end performance
Mobile home first (5.5 s LCP, 1.14 s TBT in the lab): defer the animated scene until after first paint and idle, keep the hero
text and primary action server-rendered, code-split the editor (CodeMirror/yjs) out of shared Create chunks, add sizes to the 24
images without dimensions. Re-run the baseline; then use Speed Insights p75 values to pick the next routes.

## Phase 5 — Design system and reachability
Settle UI v2 (the doc and the code disagree: decide which wins), bring hard-coded colours/spacing onto tokens starting with the
worst files, fix the keyboard traps (UX-3, UX-4), heading structure in chat, `window.confirm` → kit dialog, focus indicator
contrast. Wire Keplar Browser and Keplar Wants into the app shell (UX-2) and fix "Manage connected apps" (UX-1). Fix the copy
that under- or over-claims (UX-6, UX-7).

## Phase 6 — AI platform hardening
AI-4 (approval after untrusted output), AI-5 (Browser never submits forms on its own), AI-6 (computer-use confirmation and
billing), AI-7 (Blender Python never auto-approved), AI-11 (move the checker out of `node:vm`), AI-12 (human review for
self-learning prompt changes); then a red-team evaluation set for prompt injection, which `docs/known-gaps.md` lists as not done.

## Phase 7 — Production hardening
Load test critical routes on a preview deployment, confirm Inngest and Upstash are configured in production (they change the
severity of REL-3 and PERF-12), backup/restore drill for Neon, structured timing around database calls, alerting on error rate
and job failures. Desktop: code signing (DSK-2) once certificates exist, gated releases (DSK-3), cookie encryption (DSK-4).

## Decisions needed from the owner
- **Revenue Guard (UX-5):** build it, or label it "coming soon" in the storefront and plan table.
- **Abuse takedowns (AZ-1):** the fix keeps instant takedown for verified signed-in reporters or several independent reports,
  and routes a single anonymous report to urgent human review. Confirm this policy.
- **UI v2 vs current code (UX-9):** which visual direction is final.
- **Desktop releases (DSK-3):** the repo instructs agents to release without asking; with unsigned auto-updates that is a supply
  chain risk. Consider requiring human sign-off until builds are signed.

## Not doing
A 100,000-word specification padded to a length target. A from-scratch rewrite of working subsystems. Claims of "unhackable"
or "bug-free": the goal is defence in depth, measured improvement and documented residual risk.
