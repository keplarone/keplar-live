import type { CoreBudgetUse, CoreEvent, CoreJobRef, CoreStep, ResolvedDepth, StopReason } from "@/lib/core/types";

/** Keplar Core while an answer is being worked on (the finished answer carries `answer.core`). */
export type LiveCore = {
  depth?: ResolvedDepth;
  reason?: string;
  escalated?: boolean;
  steps: CoreStep[];
  round: number;
  verifying?: { status: "active" | "done"; detail?: string; round?: number };
  use?: CoreBudgetUse;
  stoppedBy?: StopReason;
  job?: CoreJobRef;
  nextSteps?: string[];
  clarify?: string;
};

export function applyCore(live: LiveCore | undefined, e: CoreEvent): LiveCore {
  const c: LiveCore = live ?? { steps: [], round: 0 };
  switch (e.phase) {
    case "route":
      return { ...c, depth: e.depth, reason: e.reason, escalated: e.escalated };
    case "plan": {
      const known = new Map(c.steps.map((s) => [s.id, s]));
      return { ...c, round: e.round, steps: e.steps.map((s) => known.get(s.id) ?? { ...s, status: "pending", attempts: 0 }) };
    }
    case "step":
      return { ...c, steps: c.steps.some((s) => s.id === e.step.id) ? c.steps.map((s) => (s.id === e.step.id ? e.step : s)) : [...c.steps, e.step] };
    case "verify":
      return { ...c, verifying: { status: e.status, detail: e.detail, round: e.round ?? c.verifying?.round } };
    case "budget":
      return { ...c, use: e.use, stoppedBy: e.stoppedBy, job: e.job ?? c.job };
    case "insight":
      return { ...c, nextSteps: e.nextSteps, clarify: e.clarify };
  }
}
