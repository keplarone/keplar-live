import { body, errorResponse, json } from "@/lib/create/platform/http";
import { chatStatus } from "@/lib/mcp/chat";
import { setChatAutoRun } from "@/lib/mcp/gateway";
import { mcpOwner } from "../_ctx";

export const runtime = "nodejs";

/** Which connected apps are active for Ask/chat, and the account's policy. Never includes credentials. */
export async function GET(req: Request) {
  try {
    const ws = await mcpOwner(req);
    return json(await chatStatus(ws), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Account-wide: may Ask run read-only tools (that you also marked auto-run and granted to Ask) without asking? */
export async function PUT(req: Request) {
  try {
    const ws = await mcpOwner(req);
    const b = await body<{ autoRun?: unknown }>(req);
    if (typeof b.autoRun !== "boolean") return json({ error: "autoRun must be true or false.", code: "bad_request" }, { status: 400 });
    await setChatAutoRun(ws, b.autoRun);
    return json(await chatStatus(ws));
  } catch (e) {
    return errorResponse(e);
  }
}
