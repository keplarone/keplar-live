import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { EntitlementError } from "@/lib/create/platform/plans";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { CreditLimitError } from "@/lib/create/platform/compute";
import { STUDIO_PLANS } from "@/lib/desktop/studio-bridge";
import { buildTools, runStudioTurn, STUDIO_LIMITS, validateMessages } from "@/lib/studio/agent";
import { BLENDER_PROFILE, BLENDER_TOOL_POLICY } from "@/lib/blender/agent";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * One turn of Blender mode (src/lib/blender/agent.ts): the same checks as Roblox Studio mode (signed-in Lite and up, rate
 * limited, credits checked before and charged after). The page runs the returned actions in Blender through the desktop app,
 * after the person's approval.
 */
export async function POST(req: Request) {
  try {
    const len = Number(req.headers.get("content-length") ?? 0);
    if (len > STUDIO_LIMITS.maxBodyBytes) throw new HttpError(413, "That is too much to send at once. Use fewer or smaller reference images.", "too_large");
    const ws = await currentWorkspace(req);
    if (!STUDIO_PLANS.has(ws.plan)) throw new EntitlementError("Blender mode comes with Keplar Lite, Plus and Pro.", "lite");
    await rateLimit(`blender:${ws.id}`, 30, 60, { shared: true });
    const b = await body<{ messages?: unknown; tools?: unknown }>(req);
    const turn = await runStudioTurn(ws, { messages: validateMessages(b.messages), tools: buildTools(b.tools, (n) => BLENDER_TOOL_POLICY[n]) }, {}, BLENDER_PROFILE);
    return json(turn, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof CreditLimitError) return json({ error: e.message, code: "studio_credits" }, { status: 402 });
    return errorResponse(e);
  }
}
