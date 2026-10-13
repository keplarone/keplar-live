import { limitRequest } from "@/lib/create/platform/ratelimit";
import { errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { workspaceById } from "@/lib/create/platform/workspace";
import { parseBillingEvent, verifySpaceSignature, webhookSecret } from "@/lib/space-studio/billing";
import { applyEventTo } from "@/lib/space-studio/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Space Studio billing events (src/lib/space-studio/billing.ts). The HMAC signature over `${timestamp}.${raw body}` is the
 * credential; 503 until SPACE_STUDIO_BILLING_WEBHOOK_SECRET is set. Idempotent by event id; older events never override newer.
 */
export async function POST(req: Request) {
  try {
    await limitRequest(req, "space-billing-webhook", { perIp: 120 });
    const secret = webhookSecret();
    if (!secret) throw new HttpError(503, "Space Studio billing isn't set up yet.", "billing_unconfigured");
    if (Number(req.headers.get("content-length") ?? 0) > 64_000) throw new HttpError(413, "That request is too large.", "too_large");
    const raw = await req.text();
    if (raw.length > 64_000) throw new HttpError(413, "That request is too large.", "too_large");
    if (!verifySpaceSignature(raw, req.headers, secret)) throw new HttpError(401, "Invalid signature.", "bad_signature");
    const parsed = parseBillingEvent(raw);
    if (!parsed) throw new HttpError(400, "Malformed billing event.", "bad_event");
    if (!(await workspaceById(parsed.workspaceId))) throw new HttpError(404, "Unknown account.", "unknown_workspace");
    const out = await applyEventTo(parsed.workspaceId, parsed.event, "webhook");
    if (out.status === "busy") throw new HttpError(503, "Busy; retry.", "busy");
    return json({ ok: true, status: out.status });
  } catch (e) {
    return errorResponse(e);
  }
}
