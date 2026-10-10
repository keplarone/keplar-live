/** One agent's run history, newest first, with each run's steps and the approvals it produced. Owner only; another workspace's id answers 404. */
import { errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { agents, approvals, runs } from "@/lib/business/repo";
import { owner } from "../../../_owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const ws = await owner(req);
    const { id } = await ctx.params;
    if (!(await agents().get(ws.id, id))) throw new HttpError(404, "Agent not found.", "not_found");
    const limit = Math.min(100, Math.max(1, Number(new URL(req.url).searchParams.get("limit")) || 30));
    const [rs, aps] = await Promise.all([runs().list(ws.id, (r) => r.agentId === id), approvals().list(ws.id, (a) => a.agentId === id)]);
    const list = rs.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, limit);
    return json({
      runs: list.map((r) => ({
        id: r.id, trigger: r.trigger, status: r.status, units: r.units, startedAt: r.startedAt, endedAt: r.endedAt, error: r.error, needs: r.needs,
        steps: r.steps.map((s) => ({ at: s.at, text: s.text })),
        approvals: aps.filter((a) => a.runId === r.id).map((a) => ({ id: a.id, type: a.action.type, status: a.status })),
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
