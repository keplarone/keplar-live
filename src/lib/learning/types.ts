/**
 * Keplar's system-level learning. The models are NOT retrained or fine-tuned: Keplar keeps score of which models and modes
 * worked for which kind of question, and nudges its own routing within fixed guardrails. Nothing here can change code,
 * secrets, billing or the fixed guards (human / conscious replies, who-made answer, age rule).
 */

/** Free-plan routing only ever sees free models, so its scoreboard is kept apart from the paid one. */
export type Tier = "free" | "paid";

/** A question type: the classifier's kind and complexity, e.g. "code:complex". Never derived from stored text. */
export type Category = string;

export type FeedbackKind = "up" | "down" | "regenerate" | "copy" | "correct";
export const FEEDBACK_KINDS: readonly FeedbackKind[] = ["up", "down", "regenerate", "copy", "correct"];

/** One panel seat in a finished turn. `agree` is only set when at least 3 models answered (otherwise there is no majority). */
export type SeatOutcome = { id: string; ok: boolean; agree?: boolean };

/** One turn's operational record. No prompt text, no account id: the key is a salted hash that only the account itself can recompute. */
export type OutcomeRow = {
  id: string;
  workspaceId: "system";
  at: string;
  tier: Tier;
  category: Category;
  mode: "single" | "consensus";
  seats: SeatOutcome[];
  latencyMs: number;
  units: number;
  /** "ok", or why the turn was not a normal answer. */
  status: "ok" | "no_response";
  /** Policy version that was routing when this turn ran (0 = baseline, no learned policy). */
  policyVersion: number;
  /** Feedback tallies for the turn (one per kind at most per account). */
  fb: Partial<Record<FeedbackKind, number>>;
};

/** Running tallies for one model on one question type (evidence-weighted successes and failures). */
export type ArmRow = {
  id: string;
  workspaceId: "system";
  tier: Tier;
  category: Category;
  modelId: string;
  good: number;
  bad: number;
  turns: number;
  latencySumMs: number;
  unitsSum: number;
  updatedAt: string;
};

/** Policy: multiplicative score nudges per tier / category / model. A closed shape: nothing else can be expressed. */
export type Boosts = Record<string, Record<string, number>>; // key "tier|category" -> modelId -> multiplier

export type PolicyStatus = "active" | "superseded" | "rolled_back" | "pending_approval" | "rejected" | "failed_checks";

export type PolicyRow = {
  id: string;
  workspaceId: "system";
  version: number;
  at: string;
  status: PolicyStatus;
  boosts: Boosts;
  /** Human-readable list of what changed against the policy that was active. */
  diff: string[];
  /** Size of the change: "small" can be promoted automatically, "large" needs an admin. */
  size: "small" | "large";
  evidence: PolicyEvidence;
  by: "auto" | "admin" | "breaker";
  note?: string;
  decidedAt?: string;
  decidedBy?: string;
  /** The version this one replaced (what a rollback goes back to). */
  replaces: number;
};

export type PolicyEvidence = {
  outcomes: number;
  holdout: number;
  baselineScore: number | null;
  candidateScore: number | null;
  wins: number;
  losses: number;
  ties: number;
  costDeltaPct: number;
  guardChecks: number;
  guardFailures: string[];
  /** Categories where the candidate was worse than the baseline (must be empty to promote). */
  regressions: string[];
};

export type StateRow = {
  id: "state";
  workspaceId: "system";
  /** 0 = no learned policy. */
  activeVersion: number;
  /** Admin switch: when true nothing learned is applied (the router is exactly the baseline). */
  frozen: boolean;
  lastRunAt?: string;
  lastRunSummary?: string;
  updatedAt: string;
};

export type CaseRow = {
  id: string;
  workspaceId: string; // the person's own workspace: they can see it in their export and it is deleted with the account
  at: string;
  tier: Tier;
  category: Category;
  reason: "no_response" | "thumbs_down" | "correction" | "regenerate" | "low_agreement";
  /** Redacted, truncated, secret-free. May be empty when the text looked sensitive. */
  text: string;
};

export type LearnSettings = { id: "settings"; workspaceId: string; shareFailures: boolean; updatedAt: string };
