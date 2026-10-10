/**
 * Inngest client (durable jobs + cron, docs/architecture-cloud.md §4).
 * Live when INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY are set (the SDK reads them
 * from the environment). INNGEST_DEV=1 targets the local Inngest Dev Server
 * (`npx inngest-cli@latest dev -u http://localhost:3001/api/inngest`), no keys needed.
 * Without either, everything runs in mock mode in-process (src/lib/business/scheduler.ts).
 */
import { Inngest } from "inngest";
import { isLive } from "@/lib/create/platform/config";

export const inngest = new Inngest({ id: "keplar-one" });

export const EVENTS = {
  /** One scheduled agent run (fanned out by the cron tick). data: DueRun */
  agentScheduled: "keplar/agent.scheduled",
  /** Event-triggered agent run (form.submitted, order.paid). data: { workspaceId, agentId, trigger, ... } */
  agentRun: "keplar/agent.run",
} as const;

/** Job names from platform/queue.ts that have an Inngest function. Others stay in-process. */
export const INNGEST_JOBS: Record<string, string> = { "agent.run": EVENTS.agentRun };

export const inngestDev = () => process.env.INNGEST_DEV === "1";
/** Serve /api/inngest and send events through Inngest (cloud keys or the local Dev Server). */
export const inngestEnabled = () => isLive("queue") || inngestDev();
