# Keplar Core: status

Updated Oct 6, 2026 (ET). Code is in `src/lib/core/` (engine) and `src/lib/core/selfdev/` (self-learning). Evals are in `docs/core-intelligence-evals.md`, and screenshots are in `screenshots/core/`.

Keplar does not retrain any model. Core gets better answers out of the same models through planning, running checks, retrieval, cross-model review and revision. It also learns which prompts, routes and strategies work, and adjusts those over time.

## What it is, in one paragraph

Easy questions take the existing Ask pipeline unchanged; this is the fast path, with no extra model calls. Harder questions, or any question where the person picks **Thorough** or **Exhaustive**, go through a loop:

1. Plan the steps.
2. Solve each step, running math and code in the sandbox where that applies.
3. A model from a different family reviews the draft.
4. The draft is revised until it meets the quality bar or a stated guardrail stops it.
5. The answer comes back with the answer first, a calibrated confidence, 1–3 next steps, and at most one clarifying question.

The plan and the checks appear in a collapsed "How this was worked out" panel under the answer.

## Implemented, tested, deployed

| Area | State |
|---|---|
| Adaptive routing (Auto / Quick / Thorough / Exhaustive, auto-escalation when checks fail) | Implemented, unit and engine tests, deployed |
| Free plans use OpenRouter `:free` models only (registry guard + pool governor) | Implemented, tested (`core-engine`, existing free-guard tests), deployed |
| Planning and multi-step tool use, collapsible plan view | Implemented, tested, deployed |
| Verification: cross-family critic, self-critique and revision, sandboxed math/code checks, calibrated confidence | Implemented, tested, deployed. Calibration needs 30+ rated turns per bucket before it moves |
| Long context: chunking, BM25 retrieval over the whole attachment, rolling summary of long histories | Implemented, tested, deployed. Embeddings are not used (no key; see blockers) |
| Proactive next steps (1–3), one clarifying question only when needed | Implemented, deployed |
| Background continuation: when the wall-clock limit is hit, the job is saved and resumed; a browser notification when it finishes (if allowed) | Implemented, tested. It resumes while the tab polls, and from the daily cron otherwise |
| Self-learning (B), see below | Implemented, 12 pipeline tests, deployed (cron + admin) |
| Admin dashboard `/admin/core` (quality, latency, cost, calibration, variants, evals, gaps, proposals, change log, kill/freeze/rollback) | Implemented, deployed. Not screenshotted (needs an admin session) |
| Account controls: opt out of learning, reset learned brevity | Implemented, deployed |
| Eval harness: before vs after on 29 auto-scored items | Implemented. On 12 items: 0.75 before vs 0.83 after as recorded, and 0.82 vs 0.91 with the mis-keyed item removed. The multi-step rerun went 0/2 before vs 2/2 after. Details in the evals doc |

**Tests:** `tests/core-units.test.ts` (13), `tests/core-engine.test.ts` (5), and `tests/core-pipeline.test.ts` (12) all pass. A scoped type check of `src/lib/core`, the Core routes and the tests is clean. The full-repo `tsc` gets OOM-killed on the shared box, so the Vercel build's type check is the full check, and it passed.

**Deployed:** Core is live in production at keplar.one, deployment `dpl_5jMyFowg75SDawmXWwefDfQtsrMX` (created Oct 6, 2026, 9:47 PM ET, built after `d034e20`). Another track ran that deploy, and it picked up the Core commits. It also includes 5f227da, 92ecb40, 10d9aac, 527ebcd and 09d2e02. Smoke checks on keplar.one:

- `/` returns 200.
- `/api/cron/core` returns 401 without the cron secret.
- `/api/core/prefs` returns 401 when signed out.
- `/admin/core` returns 404 for non-admins, by design.

No live Ask turn was run against production, to save the shared free pool; the live model results come from the eval runs on the box. The answer-key and eval-logging change in `837e70e` is not deployed yet. It only affects the daily eval, and the candidate-vs-champion gate is relative, so the wrong s2 key scored both arms the same.

**Commits:**

- `b3baeb9`: Keplar Core engine, self-learning, UI, routes and tests.
- `d034e20`: test fixture fix that unblocked the production type check. An earlier deploy, `keplar-9t6jyp80i`, failed on it and never went live.
- `837e70e`: these docs, the eval results, the screenshots, and the s2 answer-key fix.

## (A) No ceilings, only explicit guardrails

The loop has no fixed number of rounds. Plan → solve → review → revise repeats until the review score reaches the pass bar (`KEPLAR_CORE_PASS_SCORE`). Only these stop it:

- **Per-plan budgets** (`src/lib/core/config.ts`, override with `KEPLAR_CORE_BUDGETS` as partial JSON). Each depth sets model requests, wall-clock time per turn, total background time, spend, and tokens per step. Free Thorough: 14 requests / 90 s per turn, up to 20 requests / 4 min in total. Free Exhaustive: 32 / 150 s, up to 48 / 12 min. Free is always $0, uses `:free` models only, and goes deep only while the shared free pool is comfortable. Paid plans get more room (for example Pro: 30 per turn, 96 in total). Paid background work is charged through the normal meter, and only after a spend check.
- **Wall-clock limit with resumable continuation.** When a turn hits its time limit, the best answer so far is shown, marked as still improving. The job continues in the background (`core_jobs`), and the person can choose "Keep going" or stop it. When it finishes, they get a browser notification if they allowed notifications.
- **Safety:** the existing safety and quality gates, and the sandbox for code. Core never widens what a plan is allowed to send to free hosts. Only public pages and transcripts go to them, never file text.
- **Depth control** in the composer (Auto / Quick / Thorough / Exhaustive). Auto escalates on its own when checks fail or confidence is low.
- **Kill switch:** `KEPLAR_CORE_OFF=1` or the admin "kill" makes Ask behave exactly as it did before Core.

## (B) Self-learning, end to end

1. **Outcomes.** Each Core turn records a redacted outcome: the depth, the variants used, latency, calls, cost, confidence, and the signals that follow:
   - thumbs up/down
   - regenerate
   - copy
   - an edit
   - "confused": the person rephrases the same question (≥ 60% word overlap)
   - completion

   People can opt out under Account → Memory. Opting out stops the recording, and both `core_prefs` and `core_jobs` are included in account export and delete.
2. **A/B tests (bandit).** Each target (planner, step, critic, insight, retrieval, tools) has a champion and at most one canary. The canary starts at 10% of traffic and can rise to 50% once it has 20+ turns. Assignment is a deterministic hash, so a person's experience stays consistent.
3. **Gaps.** The daily job clusters bad outcomes (reward < 0.45, clusters of 5+). Each cluster is labeled by what would fix it: a prompt, retrieval, a tool, or code.
4. **Fixes.** A prompt, retrieval or tool gap gets a small candidate: a prompt addendum of 600 characters or less, or knob changes within each target's allowed range. A guard rejects banned phrasing, out-of-range knobs, and text on targets that take none.
5. **Eval gate.** The candidate runs the scheduled eval items on live free models. To pass, it must score at least as well as the champion, use no more than 1.3× the latency and calls, and drop no category by more than 0.15. One candidate is tried per day, and a candidate waits if live evals are unavailable.
6. **Canary → promote or roll back.** Promotion needs 40+ turns on each arm, a canary reward at least as good as the champion's, latency no worse than 1.3×, and a bad-outcome rate no more than 0.03 higher. A canary is rolled back automatically if its reward falls more than 0.05 below the champion's, or on any guard regression. After a promotion, a breaker rolls back if the reward falls more than 0.08 below the recorded baseline.
7. **Code changes never auto-deploy.** A gap that needs code (for example, search unavailable) becomes a proposal in the admin review queue: a suggested diff outline plus the eval evidence. Only the owner can approve or reject it. Approving records the decision; it does not apply or deploy any code.
8. **Control.** Every change is written to the change log. Rollback takes one click. "Freeze" uses only the built-in prompts and stops promotions. "Kill" turns Core off. Admin actions are audited.
9. **Schedule.** Vercel Cron runs `/api/cron/core` daily at 06:47 UTC (2:47 AM ET):
   - resumes background jobs
   - recomputes calibration
   - runs the gap → candidate → eval → canary steps
   - runs the scheduled champion eval
   - replays up to two redacted failed questions, from people who opted in to sharing, graded by a critic from a different model family

   Data lives in the existing database (Neon, `system_core_*` collections).

## Pending / not done

- Embedding retrieval: the code path exists, but no embeddings key is configured, so retrieval is BM25 only.
- The admin dashboard has not been screenshotted, because that needs an admin session. The Ask screenshots use a scripted event stream with the real UI components, not a live model run.
- The eval is small (12 items plus a 2-item rerun). A wrong answer key (s2) was found and fixed during the review; the other 28 keys were re-checked by hand.
- The cron runs daily, so background jobs left unattended (tab closed) resume at most once a day. A more frequent cron, or Inngest, would shorten that.

## Blockers (keys and costs)

- **No embeddings key** (for example an OpenAI or Voyage key). Without one, long-context retrieval is lexical only. It would be plugged in through `setEmbedder` in `retrieval.ts`. Cost: whatever the embeddings provider charges per token.
- **Shared free pool:** about 1,000 free requests a day and about 20 a minute on one OpenRouter key, shared by all Free users. Core goes deep on Free only when the pool is comfortable, so at busy times Free gets the direct answer.
- **Reasoning is off on free models** (`openrouter.ts`, owned by another track). This limits how much Thorough can gain on Free.
- **Live candidate evals** use about 60–100 free requests a day out of the same pool. Lower `PIPELINE.evalItems` or `replayCases` in `selfdev/pipeline.ts` if the pool is tight.
- **No Inngest keys.** They are not required: background work uses tab polling plus the daily cron.
- **Not mine:** the privacy test reports unclassified collections from other tracks.
