import { body, errorResponse, json } from "@/lib/create/platform/http";
import { requestManualCall } from "@/lib/mcp/gateway";
import { mcpOwner } from "../../../_ctx";

export const runtime = "nodejs";
export const maxDuration = 90;

/**
 * Run a tool by hand. A read-only tool you marked as such runs now; any other tool is queued in Approvals and runs only after you
 * approve it there. The output is untrusted data and is returned fenced.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const ws = await mcpOwner(req);
    const { id } = await ctx.params;
    const b = await body<{ tool?: unknown; args?: unknown; idempotencyKey?: unknown }>(req);
    if (typeof b.tool !== "string") return json({ error: "Pick a tool.", code: "bad_request" }, { status: 400 });
    return json(await requestManualCall(ws, { serverId: id, tool: b.tool, args: b.args ?? {}, idempotencyKey: typeof b.idempotencyKey === "string" ? b.idempotencyKey : undefined }));
  } catch (e) {
    return errorResponse(e);
  }
}
