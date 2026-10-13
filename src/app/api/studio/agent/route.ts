import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { EntitlementError } from "@/lib/create/platform/plans";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { CreditLimitError } from "@/lib/create/platform/compute";
import { STUDIO_PLANS } from "@/lib/desktop/studio-bridge";
import { buildTools, runStudioTurn, STUDIO_LIMITS, validateMessages, withKeplarStudioTools } from "@/lib/studio/agent";
import { parseSolarMode, SOLAR_MODE_IDS } from "@/lib/studio/solar-modes";
import { profileForMode } from "@/lib/studio/solar-modes-server";

export const runtime = "nodejs";
export const maxDuration = 300;

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
    const b = await body<{ messages?: unknown; tools?: unknown; mode?: unknown }>(req);
    // Solar mode: optional, strict. Missing means Medium (today's budgets); anything but one of the five ids is a 400.
    const mode = parseSolarMode(b.mode);
    if (!mode) throw new HttpError(400, `Unknown mode. Use one of: ${SOLAR_MODE_IDS.join(", ")}.`, "bad_mode");
    const turn = await runStudioTurn(ws, { messages: validateMessages(b.messages), tools: buildTools(withKeplarStudioTools(b.tools)) }, {}, await profileForMode("studio", mode));
    return json(turn, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof CreditLimitError) return json({ error: e.message, code: "studio_credits" }, { status: 402 });
    return errorResponse(e);
  }
}
