import { body, errorResponse, json } from "@/lib/create/platform/http";
import { runAgent, updateAgent } from "@/lib/business/agents";
import type { Agent } from "@/lib/business/types";
import { owner } from "../../_owner";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const ws = await owner(req);
    const { id } = await ctx.params;
    const b = await body<{ autoSend?: boolean; status?: "active" | "paused" | "killed"; caps?: Partial<Agent["caps"]>; schedule?: { cron?: unknown; tz?: unknown }; monitor?: { url?: unknown; keyword?: unknown }; question?: unknown; rotateHook?: boolean }>(req);
    const a = await updateAgent(ws, id, b);
    const { hookHash: _h, ...agent } = (a ?? {}) as Agent;
    return json({ agent: a ? agent : a });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Run now (manual trigger). Scheduled triggers run through the job queue (Inngest cron in production). */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const ws = await owner(req);
    const { id } = await ctx.params;
    return json({ run: await runAgent(ws, id, "manual") });
  } catch (e) {
    return errorResponse(e);
  }
}
