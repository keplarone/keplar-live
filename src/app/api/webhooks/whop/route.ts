/**
 * Whop webhook: POST /api/webhooks/whop
 * - Raw body + Standard Webhooks signature (webhook-id / -timestamp / -signature)
 *   verified with WHOP_WEBHOOK_SECRET; 5-minute replay window. Missing secret → 503,
 *   bad or missing signature → 401 (nothing is parsed or applied).
 * - Events: payment.succeeded, membership.activated, membership.deactivated,
 *   payment.failed, membership.cancel_at_period_end_changed, refund.created, dispute.created. Anything else is acknowledged and ignored.
 * - Idempotent by webhook-id. Handler errors → 500 so Whop retries.
 */
import { json } from "@/lib/create/platform/http";
import { handleWhopEvent } from "@/lib/billing/sync";
import { verifyWebhook } from "@/lib/billing/whop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 256 * 1024;
const HANDLED = new Set(["payment.succeeded", "membership.activated", "membership.deactivated", "payment.failed", "membership.cancel_at_period_end_changed", "refund.created", "dispute.created"]);

export async function POST(req: Request) {
  const secret = process.env.WHOP_WEBHOOK_SECRET?.trim();
  if (!secret) return json({ error: "Webhook not configured." }, { status: 503 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return json({ error: "Payload too large." }, { status: 413 });
  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ error: "Payload too large." }, { status: 413 });
  if (!verifyWebhook(raw, req.headers, secret)) return json({ error: "Invalid signature." }, { status: 401 });
  let event: { type?: unknown; data?: unknown };
  try {
    event = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid payload." }, { status: 400 });
  }
  const type = typeof event.type === "string" ? event.type : "";
  if (!HANDLED.has(type)) return json({ received: true, ignored: type || "unknown" });
  try {
    const out = await handleWhopEvent({ type, data: (event.data && typeof event.data === "object" ? event.data : {}) as Record<string, unknown> }, req.headers.get("webhook-id")!);
    return json({ received: true, ...out });
  } catch (e) {
    console.error("[whop webhook] handler failed:", type, e instanceof Error ? e.name : "error");
    return json({ error: "Handler failed." }, { status: 500 });
  }
}
