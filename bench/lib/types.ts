/** Shared types for the Keplar One benchmark harness. */

export type DatasetId = "hle-diamond" | "simpleqa-verified" | "frames" | "gpqa-diamond" | "fresh";

export type Item = {
  dataset: DatasetId;
  id: string;
  question: string;
  /** Gold answer. For multiple choice this is the letter (A, B, ...). */
  answer: string;
  answerType: "exact" | "mc";
  /** Stratification key (HLE partition, SimpleQA topic, FRAMES reasoning type, GPQA domain). */
  stratum: string;
  hasImage: boolean;
  /** Dataset card asks not to reveal question text / answers publicly (HLE-Diamond, GPQA). */
  noReveal: boolean;
  /** Synthetic fixture or mock filler, never a real benchmark item. */
  synthetic: boolean;
  meta: Record<string, unknown>;
};

export type Role = "answer" | "extract" | "verify" | "judge" | "retrieve" | "synthesize" | "grade";

export type Position = { answer: string; models: string[] };

/**
 * Structured context for the fake provider only. The live provider never sends
 * it anywhere; it exists so mock runs can produce deterministic, plausible output.
 */
export type MockHint = {
  item: Item;
  run: number;
  positions?: Position[];
  draft?: string;
  claim?: string;
  chosen?: string | null;
  support?: number;
  predicted?: string | null;
  template?: "hle" | "simpleqa";
};

export type WebOptions = { engine: "exa"; maxResults: number; excludeDomains: string[] };

export type CallRequest = {
  modelId: string;
  role: Role;
  system: string;
  prompt: string;
  maxTokens: number;
  reasoningEffort?: "low" | "medium" | "high";
  temperature?: number;
  web?: WebOptions;
  run: number;
  mock: MockHint;
};

export type CallResult = {
  ok: boolean;
  text: string;
  inputTokens: number;
  outputTokens: number;
  /** Cost counted against the cap: max(billed, upstream BYOK cost, token-price estimate). */
  costUsd: number;
  billedUsd?: number;
  latencyMs: number;
  citations: string[];
  refusal?: boolean;
  error?: string;
  servedBy?: string;
  cached?: boolean;
};

export interface BenchProvider {
  readonly live: boolean;
  readonly name: string;
  call(req: CallRequest): Promise<CallResult>;
}

export type Parsed = { answer: string | null; confidence: number | null; declined: boolean };

export type Verdict = "correct" | "incorrect" | "not_attempted";

export type Grade = {
  verdict: Verdict;
  method: "letter" | "dual-judge" | "tiebreak" | "needs-human" | "error";
  judges: { model: string; verdict: Verdict | null }[];
  /** Verdict from the optional official-protocol judge (HLE comparability). */
  official?: Verdict | null;
};

export type Agreement = {
  /** Same thresholds as src/lib/orchestration/comparator.ts: consensus ≥ 80, partial ≥ 60. */
  level: "consensus" | "partial" | "none" | "single";
  support: number;
  disagreed: boolean;
  responded: number;
  positions: number;
};

export type ArmResult = {
  arm: string;
  itemId: string;
  dataset: DatasetId;
  run: number;
  text: string;
  answer: string | null;
  declined: boolean;
  confidence: number | null;
  confidenceSource: "keplar" | "verbalized" | "vote-share" | null;
  agreement?: Agreement;
  /** Agreement of the premium panel on this item (used to split single-model arms). */
  panelAgreement?: { economy?: boolean; premium?: boolean };
  costUsd: number;
  latencyMs: number;
  retrieval?: { searches: number; urls: string[]; blocked: string[]; outcomes: string[]; leaked: boolean };
  stages?: Record<string, string>;
  grade?: Grade;
  error?: string;
};
