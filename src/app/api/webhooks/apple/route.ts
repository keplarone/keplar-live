/**
 * App Store Server Notifications V2: POST /api/webhooks/apple
 * Body: { signedPayload: "<JWS>" }. Verified with Apple Root CAs + APPLE_BUNDLE_ID.
 * Missing config → 503 (safe empty deploy). Bad signature → 401.
 */
import { json } from "@/lib/create/platform/http";
import { appleIapConfigured, AppleIapNotConfiguredError, AppleIapVerifyError, verifySignedNotification } from "@/lib/billing/apple";
import { handleAppleNotification } from "@/lib/billing/apple-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 512 * 1024;

export async function POST(req: Request) {
  if (!appleIapConfigured()) return json({ error: "Apple IAP not configured.", code: "apple_iap_not_configured" }, { status: 503 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return json({ error: "Payload too large." }, { status: 413 });
  let body: { signedPayload?: unknown };
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY) return json({ error: "Payload too large." }, { status: 413 });
    body = JSON.parse(raw) as { signedPayload?: unknown };
  } catch {
    return json({ error: "Invalid payload." }, { status: 400 });
  }
  const signedPayload = typeof body.signedPayload === "string" ? body.signedPayload : "";
  if (!signedPayload) return json({ error: "signedPayload required." }, { status: 400 });
  try {
    const notification = await verifySignedNotification(signedPayload);
    const uuid = typeof notification.notificationUUID === "string" && notification.notificationUUID ? notification.notificationUUID : `apple_${Date.now()}`;
    const out = await handleAppleNotification(notification, uuid);
    return json({ received: true, ...out });
  } catch (e) {
    if (e instanceof AppleIapNotConfiguredError) return json({ error: e.message, code: e.code }, { status: 503 });
    if (e instanceof AppleIapVerifyError) return json({ error: e.message }, { status: e.status });
    console.error("[apple webhook] handler failed:", e instanceof Error ? e.name : "error");
    return json({ error: "Handler failed." }, { status: 500 });
  }
}

/** Health / config probe (no secrets). */
export async function GET() {
  return json({ configured: appleIapConfigured(), endpoint: "/api/webhooks/apple", version: 2 });
}
