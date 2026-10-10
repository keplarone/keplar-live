/**
 * Scheduled agent runs (Business OS). One implementation, two drivers:
 *   - Production: Inngest. `business-agent-schedule-tick` (cron, every 5 min) calls
 *     findDueRuns() and fans out one `keplar/agent.scheduled` event per due run;
 *     `business-agent-scheduled-run` executes it with retries, an idempotency key
 *     (agent + slot) and a per-workspace concurrency key (src/lib/inngest/functions.ts).
 *   - Mock / local: tick() does the same in-process (with local retries), driven by
 *     POST /api/business/agents/schedule, `npm run agents:tick`, or the optional
 *     in-process interval (KEPLAR_LOCAL_SCHEDULER=1, src/instrumentation.ts).
 *
 * Guarantees:
 *   - Idempotent: a claim row per (agent, slot) in biz_schedule_claims. A slot that
 *     already ran (or was skipped) is never run twice, even if Inngest retries,
 *     two ticks overlap, or the event is re-sent. A crash after the run was written
 *     is detected by the run's trigger (`schedule:<slot>`) and not repeated.
 *   - Outbound actions from scheduled runs always land in the owner-approval queue
 *     (forceApproval), even for agents with auto-send on. There is no override.
 *   - Guardrails stay in runAgent(): halt switch, agent status, caps, allowance.
 *     Those refusals are final (skipped, not retried). Unexpected errors are retried.
 *   - Audit log: agent.schedule.ran / .skipped / .failed (plus the usual agent.run).
 */
import { now } from "@/lib/create/platform/ids";
import { collection } from "@/lib/create/platform/store";
import { HttpError } from "@/lib/create/platform/http";
import { EntitlementError } from "@/lib/create/platform/plans";
import { workspaceById, type Workspace } from "@/lib/create/platform/workspace";
import { SCHEDULED_RUNS_PER_DAY, minIntervalFor } from "./schedule-limits";
import { agents, audit, runs } from "./repo";
import { runAgent } from "./agents";
import { latestSlot, nextSlot } from "./cron";
import type { Agent } from "./types";

export const SCHEDULER_ACTOR = "system:scheduler";
/** How far back a tick looks for a missed slot. The Inngest cron fires every 5 minutes. */
export const DEFAULT_WINDOW_MINUTES = 15;

export type DueRun = { workspaceId: string; agentId: string; slot: string; cron: string };
export type ScheduleOutcome = { outcome: "ran" | "duplicate" | "skipped"; runId?: string; runStatus?: string; reason?: string };

type ClaimStatus = "started" | "done" | "skipped" | "failed";
export type ScheduleClaim = {
  id: string;
  workspaceId: string;
  agentId: string;
  slot: string;
  status: ClaimStatus;
  runId: string | null;
  attempts: number;
  detail?: string;
  createdAt: string;
  updatedAt: string;
};
export const scheduleClaims = () => collection<ScheduleClaim>("biz_schedule_claims");

export const claimId = (d: Pick<DueRun, "agentId" | "slot">) => `${d.agentId}@${d.slot}`;
export const scheduledTrigger = (slot: string) => `schedule:${slot}`;

/** Retriable = anything that is not a deliberate guardrail refusal. */
export class RetriableScheduleError extends Error {}

const FINAL = new Set<ClaimStatus>(["done", "skipped"]);

/** Every active scheduled agent (all tenants) whose latest slot in the window hasn't run yet. */
export async function findDueRuns(at: Date = new Date(), windowMinutes = DEFAULT_WINDOW_MINUTES): Promise<DueRun[]> {
  const scheduled = await agents().listSystem((a) => a.status === "active" && a.trigger.type === "schedule");
  const due: DueRun[] = [];
  for (const a of scheduled) {
    const { cron, tz } = a.trigger as Extract<Agent["trigger"], { type: "schedule" }>;
    let slot: string | null;
    try {
      slot = latestSlot(cron, at, windowMinutes, tz);
    } catch {
      continue; // malformed cron: never runs; surfaced by nextRunFor()
    }
    if (!slot || slot < a.createdAt.slice(0, 16)) continue;
    const claim = await scheduleClaims().get(a.workspaceId, claimId({ agentId: a.id, slot }));
    if (claim && FINAL.has(claim.status)) continue;
    due.push({ workspaceId: a.workspaceId, agentId: a.id, slot, cron });
  }
  return due;
}

// File store has no unique constraint; this stops two in-process executions racing on one slot.
// Postgres: the claim id is the primary key, so the insert itself is the lock.
const inFlight = new Set<string>();

async function saveClaim(workspaceId: string, cid: string, existing: ScheduleClaim | null, patch: Partial<ScheduleClaim>, base: DueRun) {
  if (existing) return scheduleClaims().update(workspaceId, cid, { ...patch, updatedAt: now() });
  return scheduleClaims().insert({ id: cid, workspaceId, agentId: base.agentId, slot: base.slot, status: "started", runId: null, attempts: 0, createdAt: now(), updatedAt: now(), ...patch });
}

/** Why this workspace's plan does not allow a scheduled run right now, or null. */
export async function planLimit(ws: Pick<Workspace, "id" | "plan" | "entitlements" | "admin">, slot: string): Promise<string | null> {
  if (ws.entitlements.agents === 0 || !Number.isFinite(minIntervalFor(ws.plan))) return `Scheduled agents need a plan with agents (${ws.plan} has none).`;
  const day = slot.slice(0, 10);
  const today = await runs().list(ws.id, (r) => r.trigger.startsWith("schedule:") && r.startedAt.startsWith(day));
  const cap = SCHEDULED_RUNS_PER_DAY[ws.plan] ?? 0;
  if (today.length >= cap) return `Reached ${cap} scheduled runs today for the ${ws.plan} plan.`;
  return null;
}

/** Execute one due run exactly once. Throws RetriableScheduleError for transient failures. */
type Runner = typeof runAgent;

export async function runScheduledAgent(due: DueRun, opts: { attempt?: number; runner?: Runner } = {}): Promise<ScheduleOutcome> {
  const cid = claimId(due);
  if (inFlight.has(cid)) return { outcome: "duplicate", reason: "in_flight" };
  inFlight.add(cid);
  try {
    let claim = await scheduleClaims().get(due.workspaceId, cid);
    if (claim && FINAL.has(claim.status)) return { outcome: "duplicate", runId: claim.runId ?? undefined, reason: claim.status };
    const trigger = scheduledTrigger(due.slot);
    // A previous attempt may have written the run and then crashed before marking the claim.
    const prior = (await runs().list(due.workspaceId, (r) => r.agentId === due.agentId && r.trigger === trigger))[0];
    if (prior) {
      await saveClaim(due.workspaceId, cid, claim, { status: "done", runId: prior.id }, due);
      return { outcome: "duplicate", runId: prior.id, reason: "run_exists" };
    }
    claim = await saveClaim(due.workspaceId, cid, claim, { status: "started", attempts: (claim?.attempts ?? 0) + 1 }, due);

    const ws = await workspaceById(due.workspaceId);
    if (!ws) {
      await saveClaim(due.workspaceId, cid, claim, { status: "skipped", detail: "workspace_missing" }, due);
      return { outcome: "skipped", reason: "workspace_missing" };
    }
    // Plan limits at run time too (a plan can change after the schedule was saved). Free and Lite have no agents, so a scheduled run
    // never draws on the shared Free pool; the others stop at their scheduled-runs-per-day cap. Both are final, not retried.
    const planStop = await planLimit(ws, due.slot);
    if (planStop) {
      await saveClaim(due.workspaceId, cid, claim, { status: "skipped", detail: planStop }, due);
      await audit(ws.id, SCHEDULER_ACTOR, "agent.schedule.skipped", due.agentId, `slot ${due.slot}: ${planStop}`);
      return { outcome: "skipped", reason: "plan" };
    }
    try {
      const run = await (opts.runner ?? runAgent)(ws, due.agentId, trigger, { slot: due.slot }, { forceApproval: true });
      await saveClaim(due.workspaceId, cid, claim, { status: "done", runId: run.id }, due);
      await audit(ws.id, SCHEDULER_ACTOR, "agent.schedule.ran", due.agentId, `slot ${due.slot} → ${run.id} (${run.status}), attempt ${opts.attempt ?? 1}`);
      return { outcome: "ran", runId: run.id, runStatus: run.status };
    } catch (err) {
      if (err instanceof HttpError || err instanceof EntitlementError) {
        const reason = err instanceof HttpError ? err.code : "entitlement";
        await saveClaim(due.workspaceId, cid, claim, { status: "skipped", detail: `${reason}: ${err.message}` }, due);
        await audit(ws.id, SCHEDULER_ACTOR, "agent.schedule.skipped", due.agentId, `slot ${due.slot}: ${err.message}`);
        return { outcome: "skipped", reason };
      }
      const msg = err instanceof Error ? err.message : String(err);
      await saveClaim(due.workspaceId, cid, claim, { status: "failed", detail: msg }, due);
      await audit(ws.id, SCHEDULER_ACTOR, "agent.schedule.failed", due.agentId, `slot ${due.slot}, attempt ${opts.attempt ?? 1}: ${msg}`);
      throw new RetriableScheduleError(msg);
    }
  } finally {
    inFlight.delete(cid);
  }
}

export type TickResult = { checkedAt: string; mode: "local"; due: number; /** Due runs left for the next check because the time budget ran out. */ deferred: number; results: (DueRun & ScheduleOutcome & { attempts: number; error?: string })[] };

/**
 * Mock/local driver: find due runs and execute them in-process with retries
 * (the same semantics Inngest provides in production).
 */
export async function tick(at: Date = new Date(), opts: { windowMinutes?: number; maxAttempts?: number; backoffMs?: number; runner?: Runner; /** Stop starting new runs after this epoch ms (serverless time limit). Unstarted runs stay unclaimed for the next check. */ deadline?: number } = {}): Promise<TickResult> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const due = await findDueRuns(at, opts.windowMinutes ?? DEFAULT_WINDOW_MINUTES);
  const results: TickResult["results"] = [];
  let deferred = 0;
  for (const d of due) {
    if (opts.deadline && Date.now() > opts.deadline) {
      deferred += 1;
      continue;
    }
    let attempt = 0;
    for (;;) {
      attempt += 1;
      try {
        results.push({ ...d, ...(await runScheduledAgent(d, { attempt, runner: opts.runner })), attempts: attempt });
        break;
      } catch (err) {
        if (!(err instanceof RetriableScheduleError) || attempt >= maxAttempts) {
          results.push({ ...d, outcome: "skipped", reason: "failed_after_retries", attempts: attempt, error: err instanceof Error ? err.message : String(err) });
          break;
        }
        await new Promise((r) => setTimeout(r, (opts.backoffMs ?? 500) * 2 ** (attempt - 1)));
      }
    }
  }
  return { checkedAt: at.toISOString(), mode: "local", due: due.length, deferred, results };
}

/** Next scheduled run per agent for one workspace (UI / status endpoint). */
export async function nextRunFor(workspaceId: string, from: Date = new Date()) {
  const list = await agents().list(workspaceId, (a) => a.trigger.type === "schedule");
  return list.map((a) => {
    const t = a.trigger as Extract<Agent["trigger"], { type: "schedule" }>;
    let next: string | null = null;
    let error: string | undefined;
    try {
      next = a.status === "active" ? nextSlot(t.cron, from, t.tz) : null;
    } catch (e) {
      error = e instanceof Error ? e.message : "Invalid cron";
    }
    return { agentId: a.id, name: a.name, cron: t.cron, tz: t.tz ?? "UTC", label: t.label, status: a.status, next, error };
  });
}
