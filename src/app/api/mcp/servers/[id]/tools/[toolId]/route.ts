import { body, errorResponse, json } from "@/lib/create/platform/http";
import { updateTool } from "@/lib/mcp/gateway";
import { mcpOwner } from "../../../../_ctx";

export const runtime = "nodejs";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; toolId: string }> }) {
  try {
    const ws = await mcpOwner(req);
    const { id, toolId } = await ctx.params;
    const b = await body<{ enabled?: unknown; risk?: unknown; autoRun?: unknown }>(req);
    return json({ tool: await updateTool(ws, id, toolId, b) });
  } catch (e) {
    return errorResponse(e);
  }
}
