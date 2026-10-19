import { errorResponse, json } from "@/lib/create/platform/http";
import { agents, approvals } from "@/lib/business/repo";
import { logEvent } from "@/lib/ops/log";
import { owner } from "../_owner";

export const runtime = "nodejs";

/** Newest approvals for the Approvals screen, plus the full pending count for the work page activity center. */
export async function GET(req: Request) {
  try {
    const ws = await owner(req);
    const [aps, ags] = await Promise.all([approvals().list(ws.id), agents().list(ws.id)]);
    const sorted = aps.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const pending = sorted.reduce((n, a) => n + (a.status === "pending" ? 1 : 0), 0);
    // Count only. The line must not carry recipients, subjects, message bodies, or tool arguments.
    logEvent("info", "approvals.activity", { pending }, req);
    const name = (agentId: string) => ags.find((g) => g.id === agentId)?.name ?? (agentId === "owner" ? "You" : agentId === "chat" ? "Ask" : "Agent");
    return json({ pendingCount: pending, approvals: sorted.slice(0, 60).map((a) => ({ ...a, agentName: name(a.agentId) })) });
  } catch (e) {
    return errorResponse(e);
  }
}
