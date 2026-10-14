import { errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { limitRequest, rateLimit } from "@/lib/create/platform/ratelimit";
import { BEACON_LIMITS, beaconOwner, ingest, validateEvents } from "@/lib/space-studio/beacon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sales beacon (called by the experience's Roblox game servers, no session).
 * POST, Authorization: Bearer <beacon token>, { events: [{ id, kind: "product"|"gamepass", itemId, robux, at }] } (max 50, body < 32 KB)
 * -> { accepted, duplicates }. 401 invalid_token, 400 invalid_event, 413 too_large, 429 rate_limited (120 per minute per token).
 */
export async function POST(req: Request) {
  try {
    // Many games share Roblox's server IPs, so the per-IP limit is generous; the real limit is per token below.
    await limitRequest(req, "space-beacon", { perIp: 1200 });
    if (Number(req.headers.get("content-length") ?? 0) >= BEACON_LIMITS.maxBytes) throw new HttpError(413, "That request is too large.", "too_large");
    const exp = await beaconOwner(req.headers.get("authorization"));
    if (!exp) throw new HttpError(401, "Unknown beacon token. Copy the current script from Space Studio.", "invalid_token");
    await rateLimit(`space-beacon:${exp.beaconHash.slice(0, 32)}`, BEACON_LIMITS.perTokenPerMinute, 60, { shared: true });
    const text = await req.text();
    if (Buffer.byteLength(text) >= BEACON_LIMITS.maxBytes) throw new HttpError(413, "That request is too large.", "too_large");
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new HttpError(400, "Expected a JSON body.", "invalid_event");
    }
    const now = Date.now();
    const events = validateEvents(raw, now / 1000);
    return json(await ingest(exp, events, now));
  } catch (e) {
    return errorResponse(e);
  }
}
