import { errorResponse, json } from "@/lib/create/platform/http";
import { startOAuth } from "@/lib/mcp/gateway";
import { mcpOwner } from "../../../_ctx";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Start (or restart) OAuth sign-in (BETA) for a connection. Returns the address to send the browser to. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const ws = await mcpOwner(req);
    const { id } = await ctx.params;
    return json(await startOAuth(ws, id));
  } catch (e) {
    return errorResponse(e);
  }
}
