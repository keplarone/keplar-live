/**
 * An event responder's own webhook (src/lib/business/event-agents.ts). The secret token in the URL is the credential; Keplar
 * stores only its hash. POST any JSON or text (up to 32 KB) -> 202. The agent records it, summarizes it, and drafts anything
 * outbound for the owner's approval.
 */
import { errorResponse, HttpError, json, readText } from "@/lib/create/platform/http";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { agents } from "@/lib/business/repo";
import { EVENT_LIMITS, hashHookToken, validHookToken, webhookPayload } from "@/lib/business/event-agents";
import { dispatchEvent } from "@/lib/business/event-dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ token: string }> };

export async function POST(req: Request, ctx: Ctx) {
  try {
    const { token } = await ctx.params;
    if (!validHookToken(token)) throw new HttpError(404, "Not found.", "not_found");
    const agent = await agents().findSystemBy("hookHash", hashHookToken(token));
    if (!agent || agent.template !== "event-reply" || agent.event?.source !== "webhook" || agent.status === "killed") throw new HttpError(404, "Not found.", "not_found");
    await limitRequest(req, "agent-hook", { perIp: 30, perAccount: 60, accountId: agent.workspaceId, windowSec: 60 });
    if (agent.status !== "active") throw new HttpError(409, "This agent is paused.", "agent_inactive");
    if (Number(req.headers.get("content-length") ?? 0) > EVENT_LIMITS.bodyBytes) throw new HttpError(413, "Send at most 32 KB.", "too_large");
    const text = await readText(req, EVENT_LIMITS.bodyBytes);
    if (text === null) throw new HttpError(413, "Send at most 32 KB.", "too_large");
    await dispatchEvent(agent, "webhook.received", webhookPayload(text, req.headers.get("content-type") ?? ""));
    return json({ accepted: true }, { status: 202 });
  } catch (e) {
    return errorResponse(e);
  }
}
