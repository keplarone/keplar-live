---
title: Keplar Core evals, October 2026: plain Ask vs Core at Thorough on 12 benchmark items
metaTitle: Keplar Core evals, October 2026
description: A small, reproducible evaluation of Keplar's Core reasoning layer against plain multi-model Ask on free models, with limitations stated and raw results in the repository.
kind: evaluation
published: 2026-10-07
updated: 2026-10-19
dataFiles: docs/core-eval-results.json, docs/core-eval-rerun-multistep.json
keywords: AI reasoning benchmark, multi-model evaluation, Keplar Core, free models benchmark, reproducible AI eval
related: /ai-research-assistant, /docs/how-it-works/verification-review, /docs/using-keplar/thoroughness-modes, /blogs/can-you-trust-ai-consensus
---

This report describes one small evaluation run by the Keplar team on 6 and 7 October 2026. It compares two ways of answering the same questions with the same free models: the plain multi-model Ask pipeline (panel, compare, verify, synthesize) and Keplar Core at its Thorough depth (plan, solve each step with checks, review and revise). The benchmark items, the scorers and the harness are in the Keplar repository, and the raw results are stored as JSON next to this write-up, so the numbers can be reproduced and re-checked item by item.

## Summary

- On 12 harder items chosen ahead of time from a 29-item internal benchmark, the plain pipeline scored 9 of 12 as recorded and Core at Thorough scored 10 of 12.
- One item's answer key was wrong, which scored both arms 0 on it regardless of their answers. Without that item, the result is 9 of 11 against 10 of 11.
- The main run did not measure Core on the two multi-step items, because a shared free-quota guardrail made Core answer directly. A rerun of those two items with a fresh quota scored Core 2 of 2 and the plain pipeline 0 of 2.
- Combining the main run's ten non-multi-step items with the rerun's two gives 8 of 12 before and 12 of 12 after. Treat all of this as directional: twelve items is a small sample, the free models vary from run to run, and the two runs were mixed.
- Core made about twice as many model requests per item. Median time per item did not go up, because the plain arm lost time to retries on free hosts.

## Method

- **Benchmark.** `src/lib/core/bench.ts` in the Keplar repository holds 29 items in six categories: reasoning, math, coding, factual, long context and multi-step. Each item is scored automatically: an exact number, required terms, or hidden unit tests run in a sandbox. A correct number that only appears late in an answer scores 0.5. Code is scored by the share of hidden tests it passes. Some text checks are simple substring checks and are lenient.
- **Sample.** Twelve of the 29, two per category, chosen before the run as the harder ones: `r3 r5 m2 m5 c2 c4 f2 f5 l1 l2 s2 s5`. The run was kept small because the free daily request quota on the key is shared with the product.
- **Models.** The Free roster only (free open models through OpenRouter, at no cost). Both arms used the same models. No model was trained or tuned for the test.
- **Before arm.** The Ask pipeline as it was before Core: panel, compare, verify, synthesize, called through the same orchestrator the product uses.
- **After arm.** Core at Thorough: plan, solve each step with checks, final review and revision, wrapping the same pipeline.
- **Long-context items.** A synthetic log of about 52,000 characters attached as a link. One fact sits just inside the Free plan's 24,000-character window for attached pages; the other is well past it. The plain arm sees only the clamped window; Core retrieves from the full page.
- **Harness.** `src/lib/core/selfdev/evals.ts`, run with `scripts/core-eval.mts`. The rerun also records how Core ran each item and the first 280 characters of each answer, so each score can be audited.

## Results

### Main run, 12 items, as recorded (6 October 2026)

| | Before (plain Ask) | After (Core, Thorough) |
|---|---|---|
| Overall, as recorded | 0.75 (9 of 12) | 0.83 (10 of 12) |
| Overall without s2 (wrong answer key) | 0.82 (9 of 11) | 0.91 (10 of 11) |
| Reasoning (2) | 0.5 | 1.0 |
| Math (2) | 1.0 | 1.0 |
| Coding (2) | 1.0 | 1.0 |
| Factual (2) | 1.0 | 1.0 |
| Long context (2) | 0.5 | 1.0 |
| Multi-step (2) | 0.5 | 0.0 (not a Thorough result, see below) |
| Median time per item | 13.3 s | 12.5 s |
| Model requests per item (approx.) | 3.7 | 7.7 |

What changed, item by item:

- **r3 (ordering puzzle).** Before: the free synthesizer's answer was rejected by the quality gate for a repetition loop, and the fallback answer missed the name. After: correct.
- **l2 (two facts deep in a long page, then multiply).** Before: the second fact was past the Free window, and the answer was wrong. After: correct, because Core's retrieval over the whole page found both passages. On l1 the fact is inside the window, so both arms got it right.
- **s2: the answer key was wrong.** It expected 14:45; the correct arrival time is 15:05 (09:40 + 3 h 30 min + 25 min + 1 h 30 min). Both arms scored 0 on it whatever they answered. The key has since been fixed in `bench.ts`.
- **s5 (tax bands).** In the main run, Core did not work through the steps. The eval had capped the free pool at 340 requests, and by the last items that cap made the pool look tight. Core's Free rule (go deep only while the shared pool is comfortable) then gave a direct answer, which was wrong. The guardrail worked as designed, but it means the main run did not measure Thorough on multi-step.

### Multi-step rerun, 2 items, fresh quota and corrected key (7 October 2026)

| Item | Before (plain Ask) | After (Core, Thorough) |
|---|---|---|
| s2, train arrival (15:05) | 0: "arrives at 14:19" (its own working reached 13:35 + 1 h 30 min, but the headline was wrong) | 1: "arrives at 15:05", 2 rounds, about 15 requests, 26 s |
| s5, take-home pay and effective rate ($62,800, 25.2%) | 0: "$48,400, 42.4%" (two free answers were also rejected by the quality gate for looping) | 1: "$62,800, 25.2%", 2 rounds, about 11 requests, 24 s |

### Combined

Combining the main run's ten non-multi-step items with the rerun's two multi-step items gives 0.67 before (8 of 12) and 1.00 after (12 of 12). The two runs were mixed, and the plain arm is noisy: it passed s5 in the main run and failed it in the rerun.

## Limitations

- **Twelve items is a small sample.** One item is worth 0.08 of the overall score. The gains are directional, not a measured accuracy figure, and no confidence interval is claimed.
- **Free models vary from run to run.** Hosts, rate limits and quality-gate rejections change between runs. The plain arm hit quality-gate rejections (looping free answers) in both runs.
- **The runs were mixed.** The combined score joins ten items from one run with two from another, after one answer key was corrected.
- **Lenient checks.** Some text checks look for a single word or number, so they can pass an answer that is right for the wrong reason.
- **Cost.** Core makes about twice as many model requests. On the Free plan that comes out of the shared free quota, and Core only goes deep while the pool is comfortable. On paid plans it is billed through the normal meter, within the per-plan budgets in `src/lib/core/config.ts`.
- **Scope.** This measures one internal benchmark with free models. It says nothing about paid models, other benchmarks, or how often Keplar is right on real questions. Keplar does not retrain any model; the differences come from planning, running the math and code, cross-checking with a different model family, retrieval and revision.

## Reproduce

1. Clone the Keplar repository and install dependencies (`npm ci`).
2. Set `OPENROUTER_API_KEY` for the free roster. A run spends free-model requests from the shared quota; it costs no money.
3. Run `npx tsx scripts/core-eval.mts` with the item ids above (`r3 r5 m2 m5 c2 c4 f2 f5 l1 l2 s2 s5`). The harness writes a JSON file with a score, note, time and request count per item and arm.
4. Compare with `docs/core-eval-results.json` (main run) and `docs/core-eval-rerun-multistep.json` (rerun). Expect different numbers: free models change between runs.
5. The daily job `/api/cron/core` runs a rotating three-item subset of the same benchmark against the current configuration; results show on the admin Core page.

## Data

- `docs/core-eval-results.json`: the main run, 12 items, both arms, with per-item score, note, time in milliseconds and request count.
- `docs/core-eval-rerun-multistep.json`: the rerun of s2 and s5, with how Core ran each item and the start of each answer.
- `src/lib/core/bench.ts`: the 29 items and their scorers.
- `docs/core-intelligence-evals.md`: the team's original write-up this report is based on.

## FAQ

### Does this show Keplar is more accurate than other assistants?

No. It compares two ways of running Keplar's own pipeline on the same free models. No other product was tested, and the sample is twelve items.

### Why publish such a small run?

Because it is real, reproducible and shows the failure modes plainly: a wrong answer key, a guardrail that changed the result, and free models that behave differently between runs. A larger run will replace it when one exists.

### Will this report be updated?

Yes. Reports on this site are versioned by date. A new run gets a new page; this one stays as it was recorded.
