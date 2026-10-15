/**
 * Keplar's self-learning and self-development records. Keplar improves its own prompts, routing, retrieval and
 * strategies from outcomes; it never retrains or fine-tunes the underlying models, and it never ships code by itself.
 */

/** What a variant changes. A closed set: nothing else can be expressed by an automatic change. */
export type VariantTarget = "planner" | "step" | "critic" | "insight" | "retrieval" | "tools";
export const VARIANT_TARGETS: readonly VariantTarget[] = ["planner", "step", "critic", "insight", "retrieval", "tools"];

/** pending_review: passed safety checks and evals, waiting for an admin to approve it before it serves any traffic. */
export type VariantStatus = "champion" | "canary" | "candidate" | "pending_review" | "retired" | "rolled_back" | "rejected" | "failed_checks";

/** Bounded knobs a variant may set (validated in guard.ts). */
export type VariantParams = {
  /** Critic: score an answer must reach (6-10). */
  passScore?: number;
  /** Retrieval: extra search query hints (e.g. "official documentation"), at most 3, 40 chars each. */
  searchHints?: string[];
  /** Tools: always run a math check when numbers appear (true) or only on math steps (false). */
  eagerMath?: boolean;
  /** Tools: sandbox time limit in ms (500-4000). */
  sandboxMs?: number;
  /** Insight: how many next steps to keep at most (0-3). */
  maxNext?: number;
};

export type Stats = { turns: number; good: number; bad: number };

export type VariantRow = {
  id: string;
  workspaceId: "system";
  target: VariantTarget;
  /** Short human label for the admin page. */
  label: string;
  /** Strategy text appended to Core's prompt for this target (<= 600 chars). Empty = the built-in prompt as is. */
  text: string;
  params: VariantParams;
  status: VariantStatus;
  origin: "seed" | "auto" | "admin";
  /** The failure cluster that motivated an automatic variant. */
  cluster?: string;
  createdAt: string;
  promotedAt?: string;
  /** When promoted: the champion it replaced (restored by the breaker or a rollback) and that champion's reward at the time. */
  replaced?: string;
  baseline?: number;
  /** Live outcome tallies (evidence-weighted rewards in [0,1]). */
  stats: Stats;
  /** Offline eval results when it was a candidate. */
  evalScore?: number;
  championEvalScore?: number;
  guardFailures?: string[];
  note?: string;
  /** A canary that met the promotion bar on live turns: waits here for an admin to promote it (never promoted automatically). */
  readyToPromote?: { at: string; reward: number; championReward: number; n: number };
};

export type CoreState = {
  id: "state";
  workspaceId: "system";
  /** Kill switch: Core is skipped and Ask runs exactly as before. */
  killed: boolean;
  /** Freeze: Core runs, but only the built-in prompts (no learned variant is applied, nothing is promoted). */
  frozen: boolean;
  /** Share of traffic a canary variant gets at first (percent). */
  canaryPct: number;
  lastRunAt?: string;
  lastRunSummary?: string;
  /** Learned calibration: for each confidence bucket ("0.6"), the observed share of good outcomes (set by the pipeline from 30+ turns). */
  calibration?: Record<string, number>;
  updatedAt: string;
};

export type Signal = "up" | "down" | "regenerate" | "copy" | "correct" | "confused" | "edit" | "complete";
export const SIGNALS: readonly Signal[] = ["up", "down", "regenerate", "copy", "correct", "confused", "edit", "complete"];

/** One Ask turn's outcome. No prompt text and no account id (the key is the same salted hash the router learning uses). */
export type TurnRow = {
  id: string;
  workspaceId: "system";
  at: string;
  tier: "free" | "paid";
  category: string;
  depth: "quick" | "thorough" | "exhaustive";
  escalated: boolean;
  /** Variant id used per target. */
  variants: Partial<Record<VariantTarget, string>>;
  confidence: number;
  criticScore: number | null;
  latencyMs: number;
  calls: number;
  units: number;
  stoppedBy: string;
  checksFailed: number;
  /** Content-free tags: needs:math, needs:code, needs:web, long-context, domain:law, tool:search-unavailable, ... */
  tags: string[];
  /** Only for people who turned on "Help improve Keplar": a few redacted topic words. Otherwise absent. */
  topic?: string;
  fb: Partial<Record<Signal, number>>;
  /** The reward already credited to the variants (so a later signal adjusts by the difference). */
  credited: number;
};

export type EvalRun = {
  id: string;
  workspaceId: "system";
  at: string;
  kind: "scheduled" | "candidate" | "manual" | "replay";
  label: string;
  n: number;
  score: number;
  byCategory: Record<string, { n: number; score: number }>;
  guardFailures: string[];
  /** live = real models were called; offline = deterministic checks only. */
  mode: "live" | "offline";
};

export type ChangeRow = {
  id: string;
  workspaceId: "system";
  at: string;
  action: "candidate" | "review" | "canary" | "promote" | "rollback" | "reject" | "kill" | "unkill" | "freeze" | "unfreeze" | "proposal" | "approve-proposal" | "reject-proposal" | "eval";
  target?: VariantTarget;
  variantId?: string;
  by: "auto" | "admin" | "breaker";
  note: string;
};

export type GapCluster = {
  key: string;
  /** Content-free label (e.g. "math word problems · low confidence"). */
  label: string;
  turns: number;
  badRate: number;
  tags: string[];
  /** Redacted topic words, only from consented turns. */
  examples: string[];
  /** What kind of fix would help. */
  need: "prompt" | "retrieval" | "tool" | "code";
};

export type ProposalRow = {
  id: string;
  workspaceId: "system";
  at: string;
  status: "open" | "approved" | "rejected";
  title: string;
  gap: string;
  /** Proposed change as a unified-diff-style sketch. Never applied automatically. */
  diff: string;
  evidence: string;
  decidedBy?: string;
  decidedAt?: string;
};

export type CorePrefs = {
  id: "prefs";
  workspaceId: string;
  /** Opt out of all outcome tracking for this account (nothing about its turns is recorded). */
  optOut: boolean;
  /** Learned from this person's own feedback: -1 (wants shorter) .. 1 (wants more detail). */
  brevity: number;
  updatedAt: string;
};
