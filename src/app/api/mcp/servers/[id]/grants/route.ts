import { body, errorResponse, json } from "@/lib/create/platform/http";
import { setGrant } from "@/lib/mcp/gateway";
import { mcpOwner } from "../../../_ctx";

export const runtime = "nodejs";

/** Set what one agent may do with this connection: which tools, how many calls a day, how many credits a month. */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const ws = await mcpOwner(req);
    const { id } = await ctx.params;
    const b = await body<{ agentId?: unknown; tools?: unknown; maxCallsPerDay?: unknown; maxUnitsPerMonth?: unknown }>(req);
    if (typeof b.agentId !== "string") return json({ error: "Pick an agent.", code: "bad_request" }, { status: 400 });
    return json({ grant: await setGrant(ws, id, b.agentId, b) });
  } catch (e) {
    return errorResponse(e);
  }
}
