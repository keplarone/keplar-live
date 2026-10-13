import { limitRequest } from "@/lib/create/platform/ratelimit";
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { loadIdentities, loadSubscription } from "@/lib/space-studio/store";
import { robloxOAuthConfigured, spaceOwner } from "@/lib/space-studio/account";
import { runSpaceChat, validateChatBody } from "@/lib/space-studio/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Nova's budget allows up to 280 s per call. */
export const maxDuration = 300;

/**
 * POST { model, messages, workspace, allowEscalation? } -> { text, served, requested, escalation, usage }
 * 401 signed out; 402 plan_required / out of credits; 403 roblox_link_required; 503 model unavailable (never a silent substitute).
 */
export async function POST(req: Request) {
  try {
    await limitRequest(req, "space-chat", { perIp: 30 });
    if (Number(req.headers.get("content-length") ?? 0) > 1_200_000) throw new HttpError(413, "That request is too large.", "too_large");
    const ws = await spaceOwner(req, true, 30);
    const b = validateChatBody(await body<unknown>(req));
    const robloxRequired = robloxOAuthConfigured();
    const [sub, ids] = await Promise.all([loadSubscription(ws.id), robloxRequired ? loadIdentities(ws.id) : Promise.resolve([])]);
    const out = await runSpaceChat(ws, b, { sub, robloxRequired, robloxLinked: ids.some((i) => i.provider === "roblox") });
    return json(out);
  } catch (e) {
    return errorResponse(e);
  }
}
