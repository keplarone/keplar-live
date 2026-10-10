# Keplar Core: evals

The benchmark, scorers and harness are in the repo, so these numbers can be reproduced:

- items and scorers: `src/lib/core/bench.ts` (29 items in six categories, each scored automatically: exact numbers, required terms, or hidden unit tests run in the sandbox)
- harness: `src/lib/core/selfdev/evals.ts`; runner: `scripts/core-eval.mts`
- raw results: `docs/core-eval-results.json` (main run) and `docs/core-eval-rerun-multistep.json` (multi-step rerun)

## Setup (2026-10-06, run from the box)

- **Models:** the Free roster only (OpenRouter `:free` models, $0). The same free models are used in both arms.
- **Before:** the Ask pipeline as it was before Core (panel → compare → verify → synthesize), called through `orchestrate()`.
- **After:** Core at **Thorough** (plan → solve each step with checks → final review and revision), wrapping the same pipeline.
- **Items:** 12 of the 29 (two per category), chosen ahead of time as the harder ones: `r3 r5 m2 m5 c2 c4 f2 f5 l1 l2 s2 s5`. The run was kept small because the free daily request quota on the key is shared.
- **Long-context items:** a synthetic log of about 52,000 characters, attached as a link. The first fact sits just inside the Free plan's 24,000-character window for attached pages (at about 23,500 characters), and the second is well past it (about 33,000). Both arms get the page exactly as the Ask route would send it. The plain pipeline sees only the clamped window; Core retrieves from the full page.
- **Scoring:** an integer answer has to match exactly. Some text checks are simple substring checks (for example r5 looks for "no"), so they are lenient. A correct number that only appears late in the answer gets 0.5. Code is scored by the share of hidden tests it passes.

## Results

### Main run (12 items, as recorded)

| | Before (plain Ask) | After (Core, Thorough) |
|---|---|---|
| **Overall, as recorded** | 0.75 (9 of 12) | 0.83 (10 of 12) |
| **Overall without s2** (its answer key was wrong, see below) | **0.82** (9 of 11) | **0.91** (10 of 11) |
| Reasoning (2) | 0.5 | 1.0 |
| Math (2) | 1.0 | 1.0 |
| Coding (2) | 1.0 | 1.0 |
| Factual (2) | 1.0 | 1.0 |
| Long context (2) | 0.5 | 1.0 |
| Multi-step (2) | 0.5 | 0.0 (not a Thorough result, see below) |
| Median time per item | 13.3 s | 12.5 s |
| Model requests per item (approx.) | 3.7 | 7.7 |

What changed, item by item:

- **r3 (ordering puzzle).** Before: the free synthesizer's answer was rejected by the quality gate (a repetition loop), and the answer shown missed the name. After: correct.
- **l2 (two facts deep in a long page, then multiply).** Before: the second fact was past the Free window, and the answer was wrong. After: correct, because Core's BM25 retrieval over the whole page found both passages. (On l1 the fact is inside the window, so both arms got it right.)
- **s2: the answer key was wrong.** It expected 14:45; the correct arrival time is 15:05 (09:40 + 3 h 30 min + 25 min + 1 h 30 min). Both arms scored 0 on it no matter what they answered. The key is now fixed in `bench.ts`.
- **s5 (tax bands).** In the main run, Core did not work through the steps. The eval had capped the free pool at 340 requests, and by the last items that cap made the pool look "tight". Core's Free rule (go deep only while the shared pool is comfortable) then gave a direct answer, which was wrong. This is the guardrail working, but it means the main run did not measure Thorough on multi-step. Both items were re-run.

### Multi-step rerun (fresh pool, corrected s2 key)

The eval now also records how Core ran each item and the first 280 characters of the answer, so each score can be checked: `docs/core-eval-rerun-multistep.json`.

| Item | Before (plain Ask) | After (Core, Thorough) |
|---|---|---|
| s2 train arrival (15:05) | 0: "arrives at 14:19" (its own working reached 13:35 + 1 h 30 min, but the headline was wrong) | 1: "arrives at 15:05", 2 rounds, about 15 requests, 26 s |
| s5 take-home and effective rate ($62,800, 25.2%) | 0: "$48,400, 42.4%" (two free answers were also rejected by the quality gate for looping) | 1: "$62,800, 25.2%", 2 rounds, about 11 requests, 24 s |

### Combined

Combining the main run's 10 non-multi-step items with the rerun's 2 multi-step items gives **0.67 before (8 of 12) vs 1.00 after (12 of 12)**. Treat this as directional:

- The two runs were mixed.
- The baseline is noisy: it passed s5 in the main run and failed it in the rerun.

## How to read these numbers

- Twelve items is a small sample. One item is worth 0.08 of the overall score. Treat the gains as directional, not as a measured accuracy figure.
- The free models vary from run to run (hosts, rate limits, quality-gate rejections). The "before" arm hit quality-gate rejections (looping free answers) in both runs.
- Core makes about twice as many model requests. On the Free plan that comes out of the shared free quota, and Core only goes deep while the pool is comfortable. On paid plans it is billed through the normal meter, within the per-plan budgets in `src/lib/core/config.ts`.
- Median time did not go up, because the "before" arm lost time to retries and fallbacks on the free hosts. The fast path itself (Quick, and Auto on easy questions) adds no model calls. `tests/core-engine.test.ts` checks that it makes the same calls as the plain pipeline, with under 250 ms of overhead.
- Keplar does not retrain any model. These gains come from planning, running the math and code, cross-checking with a different model family, retrieval, and revising.

## Scheduled evals

The daily job (`/api/cron/core`) runs a rotating three-item subset of this benchmark against the current champion, and the same items against one candidate change when there is one. It also re-asks up to two redacted failed questions, from people who opted in to sharing, and has them graded by a critic from another model family. Results show on `/admin/core` under Evals.
