import { errorResponse, json } from "@/lib/create/platform/http";
import { refreshServer } from "@/lib/mcp/gateway";
import { mcpOwner } from "../../../_ctx";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Test the connection: handshake + tool discovery. Always answers with the real state (connected or failed with a reason). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const ws = await mcpOwner(req);
    const { id } = await ctx.params;
    return json({ server: await refreshServer(ws, id) });
  } catch (e) {
    return errorResponse(e);
  }
}
