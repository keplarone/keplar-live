/**
 * Stripe client for seller payments (Business OS Connect) and read-only bank linking
 * (Financial Connections). Keplar's own plans are billed through Whop (see ./whop.ts).
 * Null without STRIPE_SECRET_KEY.
 * Keys are never logged.
 */
import Stripe from "stripe";

export const STRIPE_API_VERSION: Stripe.LatestApiVersion = "2026-08-26.dahlia";

let client: Stripe | null = null;
let override: Stripe | null = null;

/** Tests inject a fake client; pass null to restore. Never call from app code. */
export function setStripeClientForTests(fake: unknown) {
  override = (fake as Stripe | null) ?? null;
}

export function stripe(): Stripe | null {
  if (override) return override;
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  client ??= new Stripe(key, { apiVersion: STRIPE_API_VERSION, appInfo: { name: "keplar-web", url: "https://keplar.one" }, maxNetworkRetries: 2 });
  return client;
}

/** Offline signature verification works without an API key. */
export function webhookVerifier(): Stripe {
  return stripe() ?? new Stripe("sk_test_offline_verifier_only", { apiVersion: STRIPE_API_VERSION });
}
