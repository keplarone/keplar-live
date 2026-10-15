/**
 * Live voice (src/lib/voice/realtime.ts).
 *   GET  -> { available, provider?, model?, reason? }          signed in
 *   POST body: the browser's WebRTC SDP offer (application/sdp) -> the provider's SDP answer (application/sdp)
 */
import { personalOwner } from "@/lib/personalize/owner";
import { getFamily } from "@/lib/personalize/family";
import { errorResponse, HttpError, json, readText } from "@/lib/create/platform/http";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { OPENAI_REALTIME_CALLS, REALTIME_LIMITS, realtimeAvailability, realtimeProvider, safetyId, sessionConfig, validOffer } from "@/lib/voice/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ws = await personalOwner(req);
    if ((await getFamily(ws.id))?.enabled) return json({ available: false, reason: "family" });
    return json(realtimeAvailability(ws));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const ws = await personalOwner(req, true);
    if ((await getFamily(ws.id))?.enabled) throw new HttpError(403, "Live voice is off in Family mode.", "family_mode");
    const a = realtimeAvailability(ws);
    if (!a.available) throw new HttpError(a.reason === "plan" ? 402 : 503, a.reason === "plan" ? "Live voice is on paid plans." : "Live voice isn't available right now.", a.reason === "plan" ? "entitlement" : "not_configured");
    await limitRequest(req, "voice-live", { perIp: REALTIME_LIMITS.sessionsPerHour * 2, perAccount: REALTIME_LIMITS.sessionsPerHour, accountId: ws.id, windowSec: 3600 });
    const sdp = (await readText(req, REALTIME_LIMITS.sdpBytes)) ?? "";
    if (!validOffer(sdp)) throw new HttpError(400, "That isn't a voice connection offer.", "invalid");
    const p = realtimeProvider()!;
    const fd = new FormData();
    fd.set("sdp", sdp);
    fd.set("session", sessionConfig(p));
    const r = await fetch(OPENAI_REALTIME_CALLS, { method: "POST", headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "OpenAI-Safety-Identifier": safetyId(ws.userId!) }, body: fd, signal: AbortSignal.timeout(15_000) }).catch(() => null);
    if (!r) throw new HttpError(504, "The voice service didn't answer in time. Try again in a moment.", "upstream_timeout");
    if (!r.ok) throw new HttpError(502, "The voice service didn't accept the connection. Try again in a moment.", "upstream");
    return new Response(await r.text(), { status: 200, headers: { "content-type": "application/sdp", "cache-control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
