/**
 * The two hooks the chat route uses. `traceRouter` notes which question type and panel the router chose for this turn;
 * `learnFromTurn` records how it went, after the answer has been sent. Both are inert when learning is off, and neither can
 * change what the person sees.
 */
import type { Classification, KeplarAnswer, KeplarRequest, Router, RoutingPlan } from "@/lib/orchestration/types";
import { activeVersion, learningOff } from "./active";
import { categoryOf, recordOutcome, saveCase, seatsOf, tierOf } from "./record";
import { turnKey } from "./repo";

export type RouteTrace = { category: string; mode: RoutingPlan["mode"]; panel: string[] };

export function traceRouter(inner: Router): { router: Router; trace: () => RouteTrace | null } {
  let last: RouteTrace | null = null;
  return {
    router: {
      route(c: Classification, req: KeplarRequest) {
        const plan = inner.route(c, req);
        last = { category: categoryOf(c), mode: plan.mode, panel: plan.panel.map((p) => p.model.id) };
        return plan;
      },
    },
    trace: () => last,
  };
}

/** After an answer (or a run where no model responded). `answer` is absent for the no-response case. */
export async function learnFromTurn(i: { workspaceId: string; anonymous?: boolean; answerId: string; plan: string | undefined; trace: RouteTrace | null; answer?: KeplarAnswer; startedAt: number; failedText?: string }): Promise<boolean> {
  if (learningOff() || !i.trace) return false;
  const seats = i.answer ? seatsOf(i.answer) : i.trace.panel.map((id) => ({ id, ok: false }));
  const recorded = await recordOutcome({
    key: turnKey(i.workspaceId, i.answerId),
    tier: tierOf(i.plan),
    category: i.trace.category,
    mode: i.trace.mode,
    seats,
    latencyMs: i.answer?.durationMs ?? Date.now() - i.startedAt,
    units: i.answer?.compute.units ?? 0,
    status: i.answer ? "ok" : "no_response",
    policyVersion: activeVersion(),
  });
  // A run where no model answered is a failure worth testing against later: kept only with the person's consent, redacted.
  if (!i.answer && !i.anonymous) await saveCase({ workspaceId: i.workspaceId, tier: tierOf(i.plan), category: i.trace.category, reason: "no_response", text: i.failedText });
  return recorded;
}
