# Blind pairwise evaluation (Keplar vs one model)

Measures whether Keplar's answers are preferred over a strong single model's on open-ended tasks, where a gold answer doesn't exist.
The accuracy benchmark in `bench/run.ts` covers tasks that do have one.

## What is fixed before any run

- **Tasks:** `tasks.v1.jsonl`, 37 original tasks in 11 categories: general, reasoning, math, coding, research, factual, writing, education, ambiguous, adversarial and long-context. Multimodal is not covered yet.
  - The file is versioned. A change means a new `tasks.v2.jsonl`; never edit v1 after a run.
  - Tasks with a known answer carry a deterministic check (required words, a regex or a number).
  - Long-context documents are generated from a fixed seed, about 30k characters with the fact placed deep inside.
- **Split:** 11 tasks in **dev** and 26 in held-out **test**, stratified so every category is in test. Within a category, tasks are ordered by a fixed hash of their id. Tune prompts or the judge only on dev, and report test. Results never move a task between splits.
- **Arms:**
  - Keplar is the real product pipeline (`runCore`, Pro plan, depth Auto, with the per-request cap of $1.50).
  - The baseline is one model with a neutral system prompt.
- **Judge:** a model from a family different from the baseline. A same-family judge is refused.
- **Blinding:** both answers are anonymised, so product and model names become "the assistant".
- **Position bias:** every pair is judged in both orders, and a verdict that flips with the order counts as a tie. The first order is seeded per task.
- **Statistics:**
  - Win rate = wins / (wins + losses), with a Wilson 95% interval.
  - Also: ties counted as half a win, with a bootstrap interval.
  - Exact two-sided sign test.
  - Exclusions (a failed answer or an unreadable verdict) are counted and listed, never dropped.
  - Latency p50/p95 and spend are reported for each arm.

## Run

```bash
node --import tsx --test bench/tests/pairwise.test.ts      # self-tests, offline
npx tsx bench/pairwise.ts --split all                       # mock: synthetic answers and judge, $0, exercises the harness only
OPENROUTER_API_KEY=... KEPLAR_LIVE_MODELS=1 npx tsx bench/pairwise.ts --live --max-usd 40 --baseline claude-sonnet-5 --judge glm-5.3
```

A live run needs `--live`, the key and a hard `--max-usd`, then a typed "yes" (or `--yes`).

- Each call reserves its worst case first. A call that would cross the cap is never sent, and the report is marked **RUN ABORTED**.
- The worst case for the 26 test tasks is about $43. A typical run costs far less, because Auto answers easy questions with one model.

Output goes to `bench/out/pairwise/` (git-ignored). Copy a live report into `docs/` deliberately, with the date, models and split.

## Reading it

- **A single judge model is not people.** A preference result is a signal to confirm with blind human ratings, and the rows file has what a human pass needs.
- **The sample is small.** A per-category result is an anecdote. Quote the interval, not just the point estimate.
- **The 60% target (wins over losses against a strong single model) is a goal, not a result.** No live run has been made yet; the first one is the owner's decision because it spends money.
