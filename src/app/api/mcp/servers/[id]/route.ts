import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { publicServer, removeServer, rotateSecret } from "@/lib/mcp/gateway";
import { agents, mcpGrants, mcpReceipts, mcpServers, mcpTools } from "@/lib/business/repo";
import { mcpOwner } from "../../_ctx";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const ws = await mcpOwner(req);
    const { id } = await ctx.params;
    const s = await mcpServers().get(ws.id, id);
    if (!s) throw new HttpError(404, "Connection not found.");
    const [tools, grants, receipts, ags] = await Promise.all([
      mcpTools().list(ws.id, (t) => t.serverId === id),
      mcpGrants().list(ws.id, (g) => g.serverId === id),
      mcpReceipts().list(ws.id, (r) => r.serverId === id),
      agents().list(ws.id, (a) => a.status !== "killed"),
    ]);
    return json({
      server: publicServer(s),
      tools: tools.sort((a, b) => a.name.localeCompare(b.name)),
      grants,
      // "chat" is Ask's own principal: the owner grants it tools and budgets exactly like an agent.
      agents: [{ id: "chat", name: "Ask (chat)", status: "built-in" }, ...ags.map((a) => ({ id: a.id, name: a.name, status: a.status }))],
      receipts: receipts.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 20).map((r) => ({ ...r, argsHash: undefined })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const ws = await mcpOwner(req);
    const { id } = await ctx.params;
    const b = await body<{ name?: unknown; secret?: unknown; headerName?: unknown }>(req);
    return json({ server: await rotateSecret(ws, id, b) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const ws = await mcpOwner(req);
    const { id } = await ctx.params;
    return json({ removed: await removeServer(ws, id) });
  } catch (e) {
    return errorResponse(e);
  }
}
