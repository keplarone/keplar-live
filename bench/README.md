# Keplar One benchmark harness

Implements §3 (metrics), §5 (budget) and the pilot addendum of
`/workspace/research/benchmark-plan-2026-09-27.md`. It sends each question to the 13 setups from
plan §2, grades the answers, and writes a results JSON and a markdown report.

**Mock is the default (bench only; the product has no mock mode).** Without `--live`, every call goes to an offline fake provider. It makes no
network calls and spends nothing; its outputs are synthetic and every report says so. A real run
needs **all three** of these: `--live`, `OPENROUTER_API_KEY` in the environment, and a hard `--max-usd` cap.

## Commands (run from the repo root)

```bash
# Self-tests (offline; fetch is stubbed to fail)
node --import tsx --test bench/tests/*.test.ts

# Mock smoke run on the synthetic fixtures (default tier: smoke)
npx tsx bench/run.ts

# Mock pilot / lean dry runs (synthetic placeholders fill the sample)
npx tsx bench/run.ts --tier pilot-100
npx tsx bench/run.ts --tier pilot-150
npx tsx bench/run.ts --tier lean

# Cost estimate only, or freeze the seeded item-ID manifest for pre-registration
npx tsx bench/run.ts --tier pilot-100 --estimate-only
npx tsx bench/run.ts --tier pilot-100 --plan-only --data-dir bench/data

# REAL pilot run (spends money; asks you to type "yes" first)
OPENROUTER_API_KEY=sk-or-... npx tsx bench/run.ts --tier pilot-100 --live --max-usd 150 --data-dir bench/data
```

`npx tsx bench/run.ts --help` lists every flag. Smoke flags: `--limit N` (at most N test items in total and N dev items per dataset), `--fixtures-smoke` (live connectivity check on the bundled synthetic fixtures; needs `--live` and `--limit` ≤ 3; accuracy is meaningless) and `--max-tokens N` (clamps every call; changes the protocol, smoke only). Other useful ones: `--sample N` (pilot weighting 50/40/10),
`--datasets`, `--arms`, `--with-frontier`, `--ids manifest.json` (reuse a frozen sample),
`--concurrency`, `--abstain-below`, and `--max-usd` in mock mode (simulates the cap).

## Spend safety

1. The cost estimate is printed **before anything runs**. It's a TypeScript port of
   `research/tools/bench_budget.py` (same token profiles and mix structure), priced from the app
   catalog on the run date, plus the dev split used to choose the best single model. A test checks
   it against the Python tool (pilot-100 ≈ $116 without the dev split, lean ≈ $2,872).
2. `--live` refuses to start without `OPENROUTER_API_KEY` or `--max-usd`. It also refuses if the
   cap is below the estimate, or if the data is the fixtures or contains synthetic items. Then it
   asks for an interactive "yes" (skip with `--yes`).
3. Before **every** live call, `SpendGuard` reserves that call's worst case: estimated input plus the
   full `max_tokens` as output, ×1.15, plus the search fee. If spent + in-flight + worst case would
   exceed `--max-usd`, the call is never sent. The run then stops, writes a partial report marked
   **RUN ABORTED**, and exits with code 3.
4. The counted cost of a call is the max of: OpenRouter's billed `usage.cost` (plus
   `upstream_inference_cost` only when `is_byok` is true; otherwise `cost` already includes it), and a
   token-price estimate. Timeouts count the worst case.

| Tier | Test questions (HLE-D / SQA-V / FRAMES) | Runs | Estimate incl. dev split | +20% |
|---|---|---|---|---|
| pilot-100 | 50 / 40 / 10 | 1 | ≈ $122 | ≈ $146 |
| pilot-150 | 70 / 60 / 20 | 1 | ≈ $176 | ≈ $211 |
| lean | 400 / 400 / 200 (1,000) | 1; ×3 for the 4 Keplar setups + Astra + Opus | ≈ $2,911 | ≈ $3,493 |
| full | all of HLE-D, SQA-V, FRAMES, GPQA-D, Fresh (dev split carved out of each pool) | 3 | ≈ $9.8k | ≈ $11.8k |

The estimate is conservative. It ignores output reuse: mock pilot-100 simulates about $69, because
panel answers double as single-model answers and the judge runs only on disputed items.

## Setups (plan §2)

| # | id | What |
|---|---|---|
| 1–5 | `gpt-6-sol`, `claude-sonnet-5`, `gemini-3.8-flash`, `grok-4.7`, `deepseek-flash` | Each panel model alone |
| 6–7 | `gpt-6-astra`, `claude-opus-5-5` | Strongest single models |
| 8 | `best-single` | Chosen per dataset on a held-out, seeded dev split (10%, min 5). Tie-break: official HLE score, then setup order |
| 9 | `majority-economy`, `majority-premium` | Most common panel answer. Tie goes to the first panel model; answers are made equivalent by normalisation plus the extractor model |
| 10–13 | `keplar-economy`, `keplar-economy-exa`, `keplar-premium`, `keplar-premium-exa` | Full pipeline, with and without Exa search on disputed claims |
| opt | `keplar-frontier` (`--with-frontier`) | Astra, Opus 5.5, Gemini 3.1 Pro, Sol on HLE-Diamond. Verifier, judge and synthesizer roles are an assumption (see `lib/config.ts`) |

Mixes match `bench_budget.py`. Keplar pipeline (`lib/pipeline.ts`, mirroring `docs/orchestration.md`):
1. The panel answers.
2. The extractor (GPT-6 Luna) groups equivalent answers into positions.
3. Agreement is scored with the app's thresholds (consensus ≥ 80, partial ≥ 60). A decline is a missing vote, not dissent.
4. The verifier reviews the draft.
5. The judge runs only if the panel disagreed.
6. The +Exa setups add an OpenRouter web plugin check on disputed claims: `engine: "exa"` is always pinned, at most 3 claims × 4 results, and benchmark-hosting domains are excluded and post-filtered (plan §4.7).
7. The synthesizer writes the final answer.

Keplar's confidence is a deterministic, pre-registered rule (`keplarConfidence`). Keplar abstains on
exact-answer items when confidence < 0.25 (`--abstain-below`).

Reuse: a panel model's Keplar answer is its single-model answer (identical prompt). The majority
vote reuses the panel. The +Exa setups share the panel, verifier and judge with their no-search
twins, so the effect of search is measured on identical panels. Each setup's cost still includes
every call it depends on.

## Grading and metrics

- **Multiple choice** (GPQA, HLE MC items): deterministic letter match.
- **Short answers**: two judges from families in neither panel (GLM-5.3, Mistral Medium 3.5), using
  the official templates in `prompts/`.
  - HLE-Diamond uses the HLE judge.
  - SimpleQA Verified, FRAMES and Fresh use the SimpleQA grader, which returns **correct / incorrect / not attempted**.
  - When the judges disagree, Qwen3.8-Max breaks the tie. If there's still no majority, the answer is flagged `needs-human` and scored incorrect.
  - Graders see only the question, the gold answer and the final answer. They never see the setup or any model names.
- **Metrics:**
  - Accuracy with a 95% bootstrap CI (10,000 resamples, seeded), plus Wilson for run 1.
  - Accuracy given attempted, abstention rate, and confident-error rate (≥ 0.8).
  - ECE (10 equal-width bins), adaptive ECE, Brier, a reliability table, selective accuracy at 50/80/100% coverage, and AURC.
  - Cost per question and per correct answer.
  - p50/p95 latency.
  - Disagreement rate. Accuracy is split by agreed vs disagreed (every setup is split by its panel's agreement: premium for single models) and by consensus / partial / none.
- **Comparisons:** paired bootstrap CI plus exact McNemar.
  - The 4 pre-registered primary comparisons are Holm-adjusted per dataset. The others are exploratory.
  - A difference is "clear" only when p < 0.05 and the CI excludes 0. Anything else is labelled **NOT statistically clear**.
  - Comparing a search setup with a no-tools baseline is flagged.
- **HLE-Diamond harness check:** each single model's CI is compared with the official CAIS score.

Pilot, smoke and `--sample` reports start with **INTERNAL — NOT FOR PUBLICATION**.

## Outputs (`bench/out/<run-id>/`, git-ignored)

- `report.md`: the report.
- `results.json`: config, estimate, spend, manifest, item hashes, per-setup summaries, comparisons, and per-item results. For HLE-Diamond and GPQA, output text and answers are replaced with hashes.
- `manifest.json`: the seeded item IDs (pre-register this; reuse it with `--ids`).
- `raw-outputs.jsonl`: unredacted outputs. **Never publish.**
- `calls.jsonl`: every unique call with its tokens, cost and latency (used to measure real token profiles).

## Datasets: licenses checked Sep 28, 2026 (HF cards), and how to get them

Nothing is downloaded by the harness. Put the exports in `bench/data/` (git-ignored):

| Dataset | License / terms | File the loader expects | Size |
|---|---|---|---|
| HLE-Diamond `cais/hle-diamond` | MIT, **gated**. The card asks that the dataset not be publicly shared, re-uploaded or distributed. Has a canary string | `hle-diamond.jsonl` | ~224 MB (images). **Large: accept the gate and terms first** |
| SimpleQA Verified `google/simpleqa-verified` | MIT (per plan §1; not restated on the card page). The card says it's meant to be used **without tools** | `simpleqa_verified.csv` | small (1,000 rows) |
| FRAMES `google/frames-benchmark` | Apache-2.0 | `test.tsv` or `frames.tsv` | ~0.5 MB |
| GPQA `Idavidrein/gpqa` (diamond) | CC BY 4.0, gated. **Don't reveal examples in plain text or images online** | `gpqa_diamond.csv` | ~9 MB repo |
| Keplar Fresh Claims | internal. Each item must be written after the cutoff, be about an event after the cutoff, have ≥ 1 source and ≥ 2 human verifiers | `fresh-claims.jsonl` | — |

```bash
# after `huggingface-cli login` and accepting the gates for cais/hle-diamond and Idavidrein/gpqa
python - <<'PY'
from datasets import load_dataset
load_dataset("google/simpleqa-verified", split="eval").to_csv("bench/data/simpleqa_verified.csv", index=False)
load_dataset("cais/hle-diamond", split="test").to_json("bench/data/hle-diamond.jsonl")   # ~224 MB
PY
huggingface-cli download google/frames-benchmark test.tsv --repo-type dataset --local-dir bench/data
huggingface-cli download Idavidrein/gpqa gpqa_diamond.csv --repo-type dataset --local-dir bench/data
```

HLE-Diamond image items are excluded, and the text-only subset is used for every setup (the count
appears in the report). Pin the HF commit SHAs in the pre-registration.

## Known gaps / before a publishable run

- `prompts/simpleqa_grader.txt` is the original SimpleQA grader. Replace it with the SimpleQA Verified autorater prompt from the Kaggle starter notebook.
- The official-protocol HLE judge score (o3-mini) isn't implemented: `Grade.official` is unset.
- OpenRouter slugs come from `src/lib/orchestration/config.ts` (`OPENROUTER_SLUG_OVERRIDES`). They were checked against `GET /api/v1/models` on Sep 28, 2026, and 8 were fixed (e.g. `claude-opus-5-5` → `anthropic/claude-opus-5.5`, `deepseek-flash` → `deepseek/deepseek-v4.1-flash`, `qwen3.8-max` → `qwen/qwen3.8-max-0902`, `mistral-medium-3.5` → `mistralai/mistral-medium-3-5`). Mistral Medium 3.5 is only served first-party (quantization "unknown"), so it's exempt from the fp8/bf16 filter.
- Live smoke test (Sep 28, 2026): `echo yes | npx tsx bench/run.ts --live --fixtures-smoke --limit 1 --datasets simpleqa-verified --max-usd 2 --max-tokens 700`. Every setup's models answered except the premium verifier Muse Spark 1.3, which needs the account's 18+ confirmation in OpenRouter settings. The `--max-tokens` clamp is needed on low-limit keys: OpenRouter refuses requests whose `max_tokens` × price exceeds the key's per-request credit (HTTP 402).
- The sampler uses a seeded mulberry32 stream, not `numpy.random.default_rng(20260927)`. Pre-register the written manifest rather than the RNG.
- Human judge validation (300 items, κ) and repeated-run spread reporting are left to the analysis step.
- The retrieval check uses OpenRouter's `plugins: [{ id: "web" }]`, as the app does. OpenRouter now documents this as deprecated in favour of the `openrouter:web_search` server tool.
