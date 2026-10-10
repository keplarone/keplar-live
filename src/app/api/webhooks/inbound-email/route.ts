/**
 * Incoming email for event responders, from the inbound mail provider's webhook (Postmark inbound JSON).
 *   KEPLAR_INBOUND_EMAIL=postmark, KEPLAR_INBOUND_EMAIL_DOMAIN, KEPLAR_INBOUND_EMAIL_SECRET (basic-auth password in the webhook URL)
 * 503 until configured; 401 without the secret. Mail for an unknown address, or from a sender outside the agent's list, is
 * accepted and dropped (200) so the provider doesn't retry it.
 */
import { errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { agents } from "@/lib/business/repo";
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
    const raw = await req.text();
    if (raw.length > EVENT_LIMITS.bodyBytes * 8) return json({ ok: true, dropped: "too_large" });
    let parsed: ReturnType<typeof parsePostmarkInbound> = null;
    try { parsed = parsePostmarkInbound(JSON.parse(raw)); } catch { /* not JSON */ }
    if (!parsed) return json({ ok: true, dropped: "unreadable" });
    const route = routeFrom(parsed.recipients, cfg.domain);
    const agent = route ? await agents().findSystemBy("inboxRoute", route) : null;
    if (!agent || agent.template !== "event-reply" || agent.event?.source !== "email" || agent.status !== "active") return json({ ok: true, dropped: "no_agent" });
    if (!senderAllowed(parsed.payload.from, agent.event.allowFrom)) return json({ ok: true, dropped: "sender" });
    await dispatchEvent(agent, "email.received", parsed.payload);
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
