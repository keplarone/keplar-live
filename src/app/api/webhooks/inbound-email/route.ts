/**
 * Incoming email for event responders, from the inbound mail provider's webhook (Postmark inbound JSON).
 *   KEPLAR_INBOUND_EMAIL=postmark, KEPLAR_INBOUND_EMAIL_DOMAIN, KEPLAR_INBOUND_EMAIL_SECRET (basic-auth password in the webhook URL)
 * 503 until configured; 401 without the secret. Mail for an unknown address, or from a sender outside the agent's list, is
 * accepted and dropped (200) so the provider doesn't retry it. The same message delivered again (a retry or a replay) is dropped
 * as a duplicate: each email starts its agent once.
 */
import { errorResponse, HttpError, json, readText } from "@/lib/create/platform/http";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { createHash } from "node:crypto";
import { agents, inboundClaims } from "@/lib/business/repo";
import { EVENT_LIMITS, inboundAuthorized, inboundEmailConfig, parsePostmarkInbound, routeFrom, senderAllowed } from "@/lib/business/event-agents";
import { dispatchEvent } from "@/lib/business/event-dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const cfg = inboundEmailConfig();
    if (!cfg) throw new HttpError(503, "Incoming email isn't set up.", "not_configured");
    if (!inboundAuthorized(req.headers.get("authorization"), cfg.secret)) throw new HttpError(401, "Unauthorized.", "unauthenticated");
    await limitRequest(req, "inbound-email", { perIp: 600, windowSec: 60 });
    const raw = await readText(req, EVENT_LIMITS.bodyBytes * 8);
    if (raw === null) return json({ ok: true, dropped: "too_large" });
    let parsed: ReturnType<typeof parsePostmarkInbound> = null;
    try { parsed = parsePostmarkInbound(JSON.parse(raw)); } catch { /* not JSON */ }
    if (!parsed) return json({ ok: true, dropped: "unreadable" });
    const route = routeFrom(parsed.recipients, cfg.domain);
    const agent = route ? await agents().findSystemBy("inboxRoute", route) : null;
    if (!agent || agent.template !== "event-reply" || agent.event?.source !== "email" || agent.status !== "active") return json({ ok: true, dropped: "no_agent" });
    if (!senderAllowed(parsed.payload.from, agent.event.allowFrom)) return json({ ok: true, dropped: "sender" });
    // Replay key: the provider retries a delivery it isn't sure arrived, and a captured request could be sent again. One claim per
    // message (its Message-ID, else the exact body) and agent, taken before the agent runs, so each email starts it once.
    const key = createHash("sha256").update(`${agent.id}\n${parsed.payload.messageId || raw}`).digest("hex").slice(0, 40);
    const claim = await inboundClaims().insertIfAbsent({ id: `inb_${key}`, workspaceId: agent.workspaceId, agentId: agent.id, at: new Date().toISOString() });
    if (!claim.inserted) return json({ ok: true, dropped: "duplicate" });
    await dispatchEvent(agent, "email.received", parsed.payload);
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
