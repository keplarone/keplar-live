# Fixtures (synthetic)

Tiny, hand-written files in the exact schema of each dataset export. **None of these are real
benchmark items** (every row has `synthetic: true`), so they can be committed and shown freely,
unlike HLE-Diamond and GPQA, whose cards ask that items never be published.

| File | Schema of | Rows |
|---|---|---|
| `hle-diamond.jsonl` | `cais/hle-diamond` (id, question, image, answer, answer_type, category, raw_subject, partition, canary) | 12 (1 image item, excluded at load) |
| `simpleqa_verified.csv` | `google/simpleqa-verified` (original_index, problem, answer, topic, answer_type, multi_step, requires_reasoning, urls) | 12 |
| `frames.tsv` | `google/frames-benchmark` test.tsv (Unnamed: 0, Prompt, Answer, wikipedia_link_*, reasoning_types) | 8 |
| `gpqa_diamond.csv` | `Idavidrein/gpqa` gpqa_diamond.csv (Record ID, Question, Correct Answer, Incorrect Answer 1–3, High-level domain, Subdomain) | 6 |
| `fresh-claims.jsonl` | Keplar Fresh Claims (internal schema, see `lib/loaders.ts`) | 6 (2 deliberately fail the post-cutoff / double-verification checks) |

Mock runs read these when `bench/data/` has no real export, and add clearly labelled synthetic
placeholders when a tier needs more items. Live runs refuse fixtures and synthetic items, except the
explicit `--fixtures-smoke` connectivity check (live, `--limit` ≤ 3, accuracy meaningless).
