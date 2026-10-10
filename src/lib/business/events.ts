/** Business events → event-triggered agents. Production: Inngest events (docs/architecture-cloud.md §5). */
import { enqueue } from "@/lib/create/platform/queue";
import { agents } from "./repo";
import "./agents"; // registers the agent.run job handler

export type BizEvent = "form.submitted" | "order.paid";

export async function emit(workspaceId: string, event: BizEvent, payload: Record<string, unknown>) {
  const matching = await agents().list(workspaceId, (a) => a.status === "active" && a.trigger.type === "event" && a.trigger.event === event);
  for (const a of matching) await enqueue("agent.run", { workspaceId, agentId: a.id, trigger: event, ...payload });
}
