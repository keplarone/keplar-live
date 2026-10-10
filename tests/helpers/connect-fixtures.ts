/**
 * Mock-mode fixtures for the Connect webhook: Stripe-shaped events (snapshot and thin v2)
 * plus signing with a test secret. Used by tests/connect-webhook.test.ts and handy for
 * manual replays against a running server (sign with STRIPE_CONNECT_WEBHOOK_SECRET).
 * Test mode with real keys: `stripe listen --forward-connect-to localhost:3001/api/business/stripe/webhook`
 * and `stripe trigger checkout.session.completed --stripe-account acct_…`.
 */
import { randomBytes } from "node:crypto";
import { webhookVerifier } from "@/lib/billing/stripe";
import type { ChargeLike, ConnectEvent, SessionLike, V1AccountLike, V2AccountLike } from "@/lib/business/connect-webhook";

const evtId = (p = "evt") => `${p}_test_${randomBytes(8).toString("hex")}`;
const ts = () => Math.floor(Date.now() / 1000);

function snapshot(type: string, account: string, object: unknown, over: Partial<ConnectEvent> = {}): ConnectEvent {
  return { id: evtId(), object: "event", type, account, livemode: false, created: ts(), data: { object }, ...over };
}

export const fixtures = {
  accountUpdatedV1(account: string, a: Partial<V1AccountLike> = {}) {
    return snapshot("account.updated", account, { id: account, object: "account", charges_enabled: true, payouts_enabled: true, requirements: { currently_due: [], past_due: [], disabled_reason: null }, ...a });
  },
  /** Thin v2 event; pair with setMockV2Account(fixtures.v2Account(...)) in mock mode. */
  v2AccountEvent(account: string, type = "v2.core.account[configuration.merchant].capability_status_updated"): ConnectEvent {
    return { id: evtId("evt"), object: "v2.core.event", type, livemode: false, created: new Date().toISOString(), context: account, related_object: { id: account, type: "v2.core.account", url: `/v2/core/accounts/${account}` } };
  },
  v2Account(account: string, s: { card?: string; payouts?: string; due?: string[]; pastDue?: boolean } = {}): V2AccountLike {
    return {
      id: account,
      configuration: { merchant: { capabilities: { card_payments: { status: s.card ?? "active" }, stripe_balance: { payouts: { status: s.payouts ?? "active" } } } } },
      requirements: {
        entries: (s.due ?? []).map((d) => ({ description: d, minimum_deadline: { status: s.pastDue ? "past_due" : "currently_due" } })),
        summary: s.due?.length ? { minimum_deadline: { status: s.pastDue ? "past_due" : "currently_due" } } : null,
      },
    };
  },
  checkoutSession(over: Partial<SessionLike> = {}): SessionLike {
    return { id: `cs_test_${randomBytes(8).toString("hex")}`, mode: "payment", payment_status: "paid", amount_total: 2500, currency: "usd", customer_details: { email: "buyer@example.com" }, payment_intent: `pi_test_${randomBytes(8).toString("hex")}`, metadata: {}, livemode: false, ...over };
  },
  checkoutCompleted(account: string, session: SessionLike, type = "checkout.session.completed") {
    return snapshot(type, account, { object: "checkout.session", ...session });
  },
  checkoutExpired(account: string, session: SessionLike) {
    return snapshot("checkout.session.expired", account, { object: "checkout.session", ...session, payment_status: "unpaid" });
  },
  chargeRefunded(account: string, c: Partial<ChargeLike> & { payment_intent: string; amount: number }) {
    return snapshot("charge.refunded", account, { id: `ch_test_${randomBytes(8).toString("hex")}`, object: "charge", currency: "usd", amount_refunded: c.amount, refunded: true, ...c });
  },
};

/** Serialize + sign like Stripe does. Returns the raw body and the Stripe-Signature header. */
export function signFixture(event: ConnectEvent, secret: string) {
  const payload = JSON.stringify(event);
  const header = webhookVerifier().webhooks.generateTestHeaderString({ payload, secret });
  return { payload, header };
}
