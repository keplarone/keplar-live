/**
 * Business OS Connect webhook: events from site owners' connected accounts
 * (Accounts v2, direct charges). Keplar's OWN plans are billed through Whop.
 *
 * - Raw body + Stripe-Signature. Secrets are per mode: STRIPE_CONNECT_WEBHOOK_SECRET (test events)
 *   and STRIPE_CONNECT_WEBHOOK_SECRET_LIVE (live events); each may hold several comma-separated
 *   secrets (snapshot "Connected accounts" destination + thin v2 destination). An event is only
 *   verified against the secrets of ITS OWN mode (event.livemode), so a leaked test secret can never
 *   forge a live event. The app's mode (KEPLAR_STRIPE_MODE) must have at least one secret set,
 *   otherwise 503. Missing/invalid signature → 400.
 * - Snapshot events (object "event") use webhooks.constructEvent; thin v2 events
 *   (object "v2.core.event") use parseEventNotification, then the Account is fetched.
 * - Events of the other mode than the app's are acknowledged (200) and not applied
 *   (livemode_not_allowed / test_event_in_live_mode); records of the two modes never mix.
 * - Idempotent on event id (biz_connect_events). Handler errors → 500 so Stripe retries.
 * Logic: src/lib/business/connect-webhook.ts. Fixtures: tests/helpers/connect-fixtures.ts.
 */
import { json } from "@/lib/create/platform/http";
import { connectWebhookSecrets, stripeMode } from "@/lib/business/stripe";
import { webhookVerifier } from "@/lib/billing/stripe";
import { ConnectEventInFlight, fetchV2Account, handleConnectEvent, type ConnectEvent } from "@/lib/business/connect-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const appMode = stripeMode();
  if (!connectWebhookSecrets(appMode).length) return json({ error: "Connect webhook not configured." }, { status: 503 });
  const sig = req.headers.get("stripe-signature");
  if (!sig) return json({ error: "Missing Stripe-Signature." }, { status: 400 });
  const raw = await req.text();
  let parsed: ConnectEvent;
  try {
    parsed = JSON.parse(raw) as ConnectEvent;
  } catch {
    return json({ error: "Invalid payload." }, { status: 400 });
  }
  const eventMode = parsed.livemode ? "live" : "test";
  const secrets = connectWebhookSecrets(eventMode);
  const verifier = webhookVerifier();
  const thin = parsed.object === "v2.core.event";
  const verified = secrets.some((secret) => {
    try {
      if (thin) verifier.parseEventNotification(raw, sig, secret);
      else verifier.webhooks.constructEvent(raw, sig, secret);
      return true;
    } catch {
      return false;
    }
  });
  if (!verified) return json({ error: "Invalid signature." }, { status: 400 });

  if (eventMode !== appMode) {
    return json({ received: true, ignored: eventMode === "live" ? "livemode_not_allowed" : "test_event_in_live_mode" });
  }
  try {
    const out = await handleConnectEvent(parsed, { fetchV2Account });
    return json({ received: true, ...out });
  } catch (e) {
    // Concurrent duplicate delivery: 409 makes Stripe retry later, by which time the first one finished.
    if (e instanceof ConnectEventInFlight) return json({ error: "Event in progress." }, { status: 409 });
    console.error("connect webhook failed", parsed.type, parsed.id, e instanceof Error ? e.message : e);
    return json({ error: "Handler failed." }, { status: 500 });
  }
}
