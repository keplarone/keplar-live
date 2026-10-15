/**
 * Inngest functions for Business OS agents. Served at /api/inngest.
 *
 * - business-agent-schedule-tick: cron every 5 minutes. Finds due scheduled runs
 *   across workspaces and fans out one event per run. The event id is the claim id
 *   (agent@slot), so Inngest drops re-sends for 24h.
 * - business-agent-scheduled-run: executes one scheduled run server-side. Retries 3x
 *   on transient errors; idempotency key agent@slot; at most 2 concurrent runs per
 *   workspace so one tenant can't starve others. Guardrail refusals (halted, paused,
 *   caps) are final. Outbound actions always go to the owner-approval queue.
 * - business-agent-event-run: event-triggered agents (form.submitted, order.paid)
 *   sent through platform/queue.ts enqueue("agent.run") when Inngest is enabled.
 */
import { NonRetriableError } from "inngest";
import { HttpError } from "@/lib/create/platform/http";
import { EntitlementError } from "@/lib/create/platform/plans";
import { workspaceById } from "@/lib/create/platform/workspace";
import { runAgent } from "@/lib/business/agents";
import { DEFAULT_WINDOW_MINUTES, claimId, findDueRuns, runScheduledAgent, type DueRun } from "@/lib/business/scheduler";
import { audit } from "@/lib/business/repo";
import { pruneTelemetry } from "@/lib/ops/retention";
import { EVENTS, inngest } from "./client";

export const agentScheduleTick = inngest.createFunction(
  { id: "business-agent-schedule-tick", name: "Business OS: dispatch due agent schedules", triggers: [{ cron: "*/5 * * * *" }], retries: 2, concurrency: { limit: 1 } },
  async ({ step }) => {
    const due = await step.run("find-due-runs", () => findDueRuns(new Date(), DEFAULT_WINDOW_MINUTES));
    if (due.length) {
      await step.sendEvent("dispatch-due-runs", due.map((d) => ({ name: EVENTS.agentScheduled, id: claimId(d), data: d })));
    }
    return { due: due.length };
  },
);

export const agentScheduledRun = inngest.createFunction(
  {
    id: "business-agent-scheduled-run",
    name: "Business OS: run a scheduled agent",
    triggers: [{ event: EVENTS.agentScheduled }],
    retries: 3,
    idempotency: "event.data.agentId + '@' + event.data.slot",
    concurrency: { key: "event.data.workspaceId", limit: 2 },
  },
  async ({ event, step, attempt }) => {
    const due = event.data as DueRun;
    if (!due?.workspaceId || !due.agentId || !due.slot) throw new NonRetriableError("Malformed agent.scheduled event");
    // runScheduledAgent is itself idempotent (claim per agent@slot), so a retried step never double-runs.
    return step.run("run-agent", () => runScheduledAgent(due, { attempt: attempt + 1 }));
  },
);

export const agentEventRun = inngest.createFunction(
  {
    id: "business-agent-event-run",
    name: "Business OS: run an event-triggered agent",
    triggers: [{ event: EVENTS.agentRun }],
    retries: 3,
    concurrency: { key: "event.data.workspaceId", limit: 2 },
  },
  async ({ event, step }) => {
    const { workspaceId, agentId, trigger, ...rest } = event.data as { workspaceId: string; agentId: string; trigger: string } & Record<string, unknown>;
    return step.run("run-agent", async () => {
      const ws = await workspaceById(workspaceId);
      if (!ws) return { skipped: "workspace_missing" };
      try {
        // Event-triggered: outbound actions always wait for the owner's approval.
        const run = await runAgent(ws, agentId, trigger, rest, { forceApproval: true });
        return { runId: run.id, status: run.status };
      } catch (err) {
        if (err instanceof HttpError || err instanceof EntitlementError) {
          await audit(workspaceId, "system:inngest", "agent.event.skipped", agentId, `${trigger}: ${err.message}`);
          return { skipped: err.message };
        }
        throw err;
      }
    });
  },
);

export const telemetryRetention = inngest.createFunction(
  { id: "ops-telemetry-retention", name: "Ops: prune model_calls and per-minute/hour counters", triggers: [{ cron: "17 * * * *" }], retries: 1, concurrency: { limit: 1 } },
  async ({ step }) => step.run("prune", () => pruneTelemetry()),
);

export const modelObservatory = inngest.createFunction(
  { id: "ops-model-observatory", name: "Ops: model drift and feature regressions (alert only)", triggers: [{ cron: "53 * * * *" }], retries: 1, concurrency: { limit: 1 } },
  async ({ step }) => step.run("observe", async () => {
    const { runObservatory } = await import("@/lib/ops/observatory");
    const r = await runObservatory();
    return { drift: r.drift.length, alerted: r.alerted, regressions: r.regressions };
  }),
);

export const functions = [agentScheduleTick, agentScheduledRun, agentEventRun, telemetryRetention, modelObservatory];
