/**
 * Benchmark configuration: models, mixes, the 13 setups ("arms"), tiers,
 * token profiles and thresholds. Source: /workspace/research/benchmark-plan-2026-09-27.md
 * (§2 arms, §3 metrics, §4 methodology, §5 budget, addendum pilot tier) and
 * /workspace/research/tools/bench_budget.py (mix composition, token profiles).
 *
 * Everything that should be pre-registered lives in this file.
 */
import type { DatasetId } from "./types";

export const SEED = 20260927;

/* ─────────────────────────── models ─────────────────────────── */

/** Catalog ids (src/lib/orchestration/catalog.json). */
export const M = {
  sol: "gpt-6-sol",
  sonnet: "claude-sonnet-5",
  gemFlash: "gemini-3.8-flash",
  grok: "grok-4.7",
  dsFlash: "deepseek-flash",
  opus: "claude-opus-5-5",
  astra: "gpt-6-astra",
  luna: "gpt-6-luna",
  muse: "muse-spark-1.3",
  gemPro: "gemini-3.1-pro-preview",
  glm: "glm-5.3",
  mistral: "mistral-medium-3.5",
  qwen: "qwen3.8-max",
} as const;

/** Families billed via BYOK on OpenRouter (no 5.5% fee), per plan §5. */
export const BYOK_FAMILIES = new Set(["OpenAI", "Anthropic", "Google"]);
export const OPENROUTER_FEE = 1.055;

export type Mix = {
  id: "economy" | "premium" | "frontier";
  panel: string[];
  /** Merges equivalent panel answers into positions (bench_budget: GPT-6 Luna). */
  extractor: string;
  verifier: string;
  /** Runs only when the panel disagreed. */
  judge: string;
  synthesizer: string;
};

/** Economy and premium mixes exactly as in bench_budget.py. */
export const MIXES: Record<Mix["id"], Mix> = {
  economy: { id: "economy", panel: [M.sol, M.gemFlash, M.grok, M.dsFlash], extractor: M.luna, verifier: M.dsFlash, judge: M.sonnet, synthesizer: M.gemFlash },
  premium: { id: "premium", panel: [M.sol, M.sonnet, M.gemFlash, M.grok], extractor: M.luna, verifier: M.muse, judge: M.opus, synthesizer: M.sonnet },
  // Plan §2 names the panel (Astra, Opus 5.5, Gemini 3.1 Pro, Sol) but not the verifier/judge/synthesizer.
  // ASSUMPTION (flag for pre-registration): verifier Gemini 3.1 Pro, judge Astra, synthesizer Opus 5.5.
  frontier: { id: "frontier", panel: [M.astra, M.opus, M.gemPro, M.sol], extractor: M.luna, verifier: M.gemPro, judge: M.astra, synthesizer: M.opus },
};

/** Graders: two judges from families in neither panel (plan §4), plus a tie-breaker. */
export const JUDGES = { primary: [M.glm, M.mistral], tiebreak: M.qwen } as const;

/* ─────────────────────────── arms ─────────────────────────── */

export type ArmKind = "single" | "best-single" | "majority" | "keplar";
export type Arm = {
  id: string;
  /** Plan §2 row number. */
  n: string;
  label: string;
  kind: ArmKind;
  model?: string;
  mix?: Mix["id"];
  retrieval?: boolean;
  /** "key" arms get the extra repeats in the lean tier (Keplar ×4, Astra, Opus). */
  key?: boolean;
  optional?: boolean;
  /** Datasets this arm runs on (default: all). */
  datasets?: DatasetId[];
};

export const ARMS: Arm[] = [
  { id: "gpt-6-sol", n: "1", label: "GPT-6 Sol alone", kind: "single", model: M.sol },
  { id: "claude-sonnet-5", n: "2", label: "Claude Sonnet 5 alone", kind: "single", model: M.sonnet },
  { id: "gemini-3.8-flash", n: "3", label: "Gemini 3.8 Flash alone", kind: "single", model: M.gemFlash },
  { id: "grok-4.7", n: "4", label: "Grok 4.7 alone", kind: "single", model: M.grok },
  { id: "deepseek-flash", n: "5", label: "DeepSeek V4.1-Flash alone", kind: "single", model: M.dsFlash },
  { id: "gpt-6-astra", n: "6", label: "GPT-6 Astra alone", kind: "single", model: M.astra, key: true },
  { id: "claude-opus-5-5", n: "7", label: "Claude Opus 5.5 alone", kind: "single", model: M.opus, key: true },
  { id: "best-single", n: "8", label: "Best single model (chosen on dev split)", kind: "best-single" },
  { id: "majority-economy", n: "9a", label: "Majority vote, economy panel", kind: "majority", mix: "economy" },
  { id: "majority-premium", n: "9b", label: "Majority vote, premium panel", kind: "majority", mix: "premium" },
  { id: "keplar-economy", n: "10", label: "Keplar economy", kind: "keplar", mix: "economy", key: true },
  { id: "keplar-economy-exa", n: "11", label: "Keplar economy + Exa", kind: "keplar", mix: "economy", retrieval: true, key: true },
  { id: "keplar-premium", n: "12", label: "Keplar premium", kind: "keplar", mix: "premium", key: true },
  { id: "keplar-premium-exa", n: "13", label: "Keplar premium + Exa", kind: "keplar", mix: "premium", retrieval: true, key: true },
  { id: "keplar-frontier", n: "opt", label: "Keplar frontier mix (optional)", kind: "keplar", mix: "frontier", optional: true, datasets: ["hle-diamond"] },
];

export const SINGLE_ARMS = ARMS.filter((a) => a.kind === "single");

/**
 * Pre-registered primary comparisons (plan §4.6: 2–4, Holm-corrected, paired).
 * "best-single" is resolved per dataset from the dev split.
 */
export const PRIMARY_COMPARISONS: [string, string][] = [
  ["keplar-premium", "best-single"],
  ["keplar-economy", "best-single"],
  ["keplar-premium", "gpt-6-astra"],
  ["keplar-premium-exa", "keplar-premium"],
];

/* ─────────────────────────── datasets & tiers ─────────────────────────── */

export const DATASET_LABEL: Record<DatasetId, string> = {
  "hle-diamond": "HLE-Diamond",
  "simpleqa-verified": "SimpleQA Verified",
  frames: "FRAMES",
  "gpqa-diamond": "GPQA Diamond",
  fresh: "Keplar Fresh Claims",
};

/** Token profiles per dataset (plan §5; ASSUMPTIONS until the pilot measures them). */
export const PROFILES: Record<DatasetId, { inp: number; out: number; rsn: number; pj: number; jrsn: number }> = {
  "hle-diamond": { inp: 800, out: 500, rsn: 6000, pj: 0.6, jrsn: 6000 },
  "simpleqa-verified": { inp: 300, out: 150, rsn: 500, pj: 0.4, jrsn: 1000 },
  frames: { inp: 500, out: 400, rsn: 2000, pj: 0.5, jrsn: 2000 },
  "gpqa-diamond": { inp: 600, out: 300, rsn: 4000, pj: 0.4, jrsn: 4000 },
  fresh: { inp: 300, out: 200, rsn: 800, pj: 0.5, jrsn: 1500 },
};

/** max_tokens per answer call (covers reasoning + visible output on OpenRouter). Also the worst case the spend guard reserves. */
export const ANSWER_MAX_TOKENS: Record<DatasetId, number> = {
  "hle-diamond": 16000,
  "simpleqa-verified": 3000,
  frames: 8000,
  "gpqa-diamond": 12000,
  fresh: 4000,
};
export const ROLE_MAX_TOKENS = { extract: 800, verify: 6000, judge: 12000, retrieve: 2000, synthesize: 6000, grade: 2000 } as const;

export type Tier = {
  id: string;
  counts: Partial<Record<DatasetId, number | "all">>;
  /** Runs for every arm, and for key arms (Keplar ×4, Astra, Opus). */
  runsAll: number;
  runsKey: number;
  internal: boolean;
  note: string;
};

export const TIERS: Record<string, Tier> = {
  smoke: { id: "smoke", counts: { "hle-diamond": 6, "simpleqa-verified": 6, frames: 4, "gpqa-diamond": 4, fresh: 4 }, runsAll: 1, runsKey: 1, internal: true, note: "Harness smoke test on fixtures." },
  "pilot-100": { id: "pilot-100", counts: { "hle-diamond": 50, "simpleqa-verified": 40, frames: 10 }, runsAll: 1, runsKey: 1, internal: true, note: "Plan addendum: ≈ $116 (≈ $139 with 20% contingency)." },
  "pilot-150": { id: "pilot-150", counts: { "hle-diamond": 70, "simpleqa-verified": 60, frames: 20 }, runsAll: 1, runsKey: 1, internal: true, note: "Plan addendum: ≈ $169 (≈ $203 with 20% contingency)." },
  lean: { id: "lean", counts: { "hle-diamond": 400, "simpleqa-verified": 400, frames: 200 }, runsAll: 1, runsKey: 3, internal: false, note: "Plan §5: ≈ $2,872 (≈ $3,450 with contingency)." },
  full: { id: "full", counts: { "hle-diamond": "all", "simpleqa-verified": "all", frames: "all", "gpqa-diamond": "all", fresh: "all" }, runsAll: 3, runsKey: 3, internal: false, note: "Plan §5: ≈ $9,832 (≈ $11,800 with contingency)." },
};

/** `--sample N` uses the pilot weighting (addendum: 50/40/10). */
export const SAMPLE_WEIGHTS: Partial<Record<DatasetId, number>> = { "hle-diamond": 0.5, "simpleqa-verified": 0.4, frames: 0.1 };

/* ─────────────────────────── metrics & policy ─────────────────────────── */

/** Confidence at or above this is "high" (confident-error rate, plan §3). */
export const HIGH_CONFIDENCE = 0.8;
/** Same thresholds as the app's comparator (consensus ≥ 80, partial ≥ 60). */
export const LEVEL_THRESHOLDS = { consensus: 80, partial: 60 } as const;
/** Accuracy CI half-width above which the report calls a per-arm number "imprecise". */
export const IMPRECISE_HALF_WIDTH = 0.05;
export const DEV_FRACTION = 0.1;
export const MIN_DEV_ITEMS = 5;
export const CONTINGENCY = 1.2;

/** Official HLE-Diamond no-tools scores (plan §0 / §7) for the harness sanity check. */
export const OFFICIAL_HLE_DIAMOND: Record<string, number> = {
  [M.astra]: 0.606,
  [M.opus]: 0.55,
  [M.gemFlash]: 0.343,
  [M.sol]: 0.338,
  [M.muse]: 0.254,
  [M.grok]: 0.234,
};

/** Search arms never use results from benchmark-hosting / answer-leak domains (plan §4.7). */
export const BLOCKED_DOMAINS = [
  "huggingface.co",
  "lastexam.ai",
  "github.com/openai/simple-evals",
  "github.com/centerforaisafety",
  "kaggle.com",
  "arxiv.org",
  "paperswithcode.com",
];

/** Retrieval limits mirror the app (src/lib/orchestration/config.ts RETRIEVAL): ≤ 3 claims, 4 results each. */
export const RETRIEVAL_LIMITS = { maxClaims: 3, maxResults: 4 } as const;
/** Exa via OpenRouter per search incl. fee (plan §5; app SEARCH_PRICE_USD.exa). */
export const EXA_PER_SEARCH_USD = 0.00739;

/* ─────────────────────────── call settings (pre-register) ─────────────────────────── */

/** Reasoning effort per role, fixed for every arm (plan §2: "reasoning effort fixed per arm and published"). */
export const REASONING_EFFORT = { answer: "medium", extract: "low", verify: "medium", judge: "medium", retrieve: "low", synthesize: "low", grade: "low" } as const;
/** Temperature 0 where the model accepts it (plan §4.3), only for deterministic helper roles; answers use vendor defaults. */
export const HELPER_TEMPERATURE = 0;
/**
 * Keplar abstains on exact-answer items when its confidence is below this.
 * Pre-registration choice; override with --abstain-below (0 disables).
 */
export const KEPLAR_ABSTAIN_BELOW = 0.25;
