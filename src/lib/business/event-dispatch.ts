/** Starts an event responder for one arrival: through Inngest when it's on, otherwise after the response in this function. */
import { after } from "next/server";
import { enqueue } from "@/lib/create/platform/queue";
import { inngestEnabled } from "@/lib/inngest/client";
import { workspaceById } from "@/lib/create/platform/workspace";
import { runAgent } from "./agents";
import { audit } from "./repo";
import type { Agent } from "./types";
import type { EventPayload } from "./event-agents";

export async function dispatchEvent(agent: Pick<Agent, "id" | "workspaceId">, trigger: "email.received" | "webhook.received", event: EventPayload) {
  await audit(agent.workspaceId, "public", "agent.event.received", agent.id, trigger);
  if (inngestEnabled()) return enqueue("agent.run", { workspaceId: agent.workspaceId, agentId: agent.id, trigger, event });
  const p = (async () => {
    const ws = await workspaceById(agent.workspaceId);
    if (ws) await runAgent(ws, agent.id, trigger, { event }, { forceApproval: true });
  })().catch(async (e) => { await audit(agent.workspaceId, "system", "agent.event.skipped", agent.id, `${trigger}: ${e instanceof Error ? e.message : "failed"}`).catch(() => undefined); });
  try { after(p); } catch { /* outside a request scope: the promise still runs */ }
}
