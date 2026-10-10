/**
 * Keplar Core: the reasoning layer around the existing models (Ask, and usable by Create and agents).
 * Nothing here trains or fine-tunes a model. Core plans, runs steps with tools, checks its own work, and learns which
 * prompts, routes and strategies work better from feedback. These types are shared by the server, the stream and the UI.
 */

/** What the person picked in the composer. "auto" lets Keplar decide and escalate. */
export type Depth = "auto" | "quick" | "thorough" | "exhaustive";
export type ResolvedDepth = "quick" | "thorough" | "exhaustive";
export const DEPTHS: readonly Depth[] = ["auto", "quick", "thorough", "exhaustive"];

export type CoreStepKind = "reason" | "math" | "code" | "search" | "retrieve" | "write";

export type CoreStepStatus = "pending" | "active" | "done" | "revised" | "failed" | "skipped";

export type CoreStep = {
  id: string;
  title: string;
  kind: CoreStepKind;
  status: CoreStepStatus;
  /** One or two plain sentences: what this step found. Never the whole scratch work. */
  result?: string;
  /** What checked it (for example "Ran the calculation" or "Checked by a second model"). */
  check?: string;
  /** Display name of the model that did the step (the specialist). */
  model?: string;
  attempts: number;
};

export type CoreCheck = {
  kind: "execution" | "critique" | "cross-model" | "grounding" | "syntax";
  label: string;
  outcome: "passed" | "fixed" | "failed" | "inconclusive";
  detail?: string;
};

export type Confidence = { level: "high" | "medium" | "low"; score: number; words: string };

/** Why the reasoning loop stopped. Only "criterion" means it reached its quality bar. */
export type StopReason = "criterion" | "budget" | "time" | "pool" | "cancelled" | "not-needed";

export type CoreBudgetUse = { calls: number; callLimit: number; ms: number; msLimit: number; usd?: number };

export type CoreJobRef = { id: string; status: "paused" | "running" | "done" | "failed" };

/** Stream events (type "core" in KeplarEvent). */
export type CoreEvent =
  | { phase: "route"; depth: ResolvedDepth; asked: Depth; reason: string; escalated?: boolean }
  | { phase: "plan"; steps: Pick<CoreStep, "id" | "title" | "kind">[]; round: number }
  | { phase: "step"; step: CoreStep }
  | { phase: "verify"; status: "active" | "done"; detail?: string; round?: number }
  | { phase: "budget"; use: CoreBudgetUse; stoppedBy?: StopReason; job?: CoreJobRef }
  | { phase: "insight"; nextSteps: string[]; clarify?: string };

/** Attached to the finished answer (KeplarAnswer.core). Small: shown collapsed under the answer. */
export type CoreSummary = {
  depth: ResolvedDepth;
  asked: Depth;
  escalated?: boolean;
  reason: string;
  steps: CoreStep[];
  /** Plan → execute → critique → revise rounds that ran. */
  rounds: number;
  checks: CoreCheck[];
  confidence: Confidence;
  nextSteps?: string[];
  clarify?: string;
  use: CoreBudgetUse;
  stoppedBy: StopReason;
  job?: CoreJobRef;
  /** Long threads / documents: how many earlier passages were pulled back in, and whether a rolling summary was used. */
  grounding?: { passages: number; summarized: boolean };
};
