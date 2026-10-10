import { errorResponse, json } from "@/lib/create/platform/http";
import { agents, approvals } from "@/lib/business/repo";
import { owner } from "../_owner";

export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const ws = await owner(req);
    const [aps, ags] = await Promise.all([approvals().list(ws.id), agents().list(ws.id)]);
    return json({ approvals: aps.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 60).map((a) => ({ ...a, agentName: ags.find((g) => g.id === a.agentId)?.name ?? (a.agentId === "owner" ? "You" : a.agentId === "chat" ? "Ask" : "Agent") })) });
  } catch (e) {
    return errorResponse(e);
  }
}
