import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { EntitlementError } from "@/lib/create/platform/plans";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { STUDIO_PLANS } from "@/lib/desktop/studio-bridge";
import { buildTools, runStudioTurn, STUDIO_LIMITS, validateMessages } from "@/lib/studio/agent";

export const runtime = "nodejs";
export const maxDuration = 150;

/**
 * One turn of Roblox Studio mode (src/lib/studio/agent.ts): signed-in Lite and up only, rate limited, credits checked before
 * and charged after. The page runs the returned actions in Studio through the desktop app, after the person's approval.
 */
export async function POST(req: Request) {
  try {
    const len = Number(req.headers.get("content-length") ?? 0);
    if (len > STUDIO_LIMITS.maxBodyBytes) throw new HttpError(413, "That is too much to send at once. Use fewer or smaller reference images.", "too_large");
    const ws = await currentWorkspace(req);
    if (!STUDIO_PLANS.has(ws.plan)) throw new EntitlementError("Roblox Studio mode comes with Keplar Lite, Plus and Pro.", "lite");
    await rateLimit(`studio:${ws.id}`, 30, 60, { shared: true });
    const b = await body<{ messages?: unknown; tools?: unknown }>(req);
    const turn = await runStudioTurn(ws, { messages: validateMessages(b.messages), tools: buildTools(b.tools) });
    return json(turn, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
