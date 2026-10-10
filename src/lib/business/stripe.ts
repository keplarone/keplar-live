/**
 * Stripe Connect adapter for seller payments (stores built in Create).
 *
 * Mode is explicit: KEPLAR_STRIPE_MODE=test (default) or live. The key must match the mode
 * (sk_/rk_test_ in test, sk_/rk_live_ in live) or payments stay off ("Not configured" for
 * sellers; the exact problem is shown to admins only). Test and live never mix: connected
 * accounts, orders, webhook events and revenue each carry their mode, and every view filters
 * by the current mode.
 *
 * Webhook secrets are per mode: STRIPE_CONNECT_WEBHOOK_SECRET (test) and
 * STRIPE_CONNECT_WEBHOOK_SECRET_LIVE (live); each may hold several comma-separated secrets
 * (snapshot + thin destinations). Live events are only verified against the live secrets.
 *
 * Integration (Stripe's connect-recommend guidance, Accounts v2):
 *   - Accounts v2 (POST /v2/core/accounts) with dashboard: "full",
 *     defaults.responsibilities.fees_collector: "stripe", losses_collector: "stripe":
 *     the connected business is merchant of record, pays Stripe's fees, and Stripe
 *     owns negative-balance liability. Keplar is not the merchant of record.
 *   - Stripe-hosted onboarding via a v2 Account Link (use_case account_onboarding,
 *     merchant configuration); status comes back through webhooks and a refresh.
 *   - Direct charges: Checkout Sessions created ON the connected account
 *     (Stripe-Account header) with application_fee_amount for Keplar's fee.
 *   - Never pass payment_method_types (dynamic payment methods).
 *
 * Safety rails for real money: kill switch (KEPLAR_PAYMENTS_DISABLED=1 or the admin
 * "Pause payments" control), order min/max, currency allow-list, hard cap on Keplar's fee.
 */
import { HttpError } from "@/lib/create/platform/http";
import { stripe as stripeClient } from "@/lib/billing/stripe";
import { now } from "@/lib/create/platform/ids";
import { opsControls } from "@/lib/ops/controls";
import { connectAccounts } from "./repo";
import type { ConnectAccount } from "./types";

export const STRIPE_API_VERSION = "2026-08-26.dahlia";

export type StripeMode = "test" | "live";
/** KEPLAR_STRIPE_MODE=live switches to live; anything else is test. Never inferred from the key. */
export const stripeMode = (): StripeMode => (process.env.KEPLAR_STRIPE_MODE?.trim().toLowerCase() === "live" ? "live" : "test");

export const WEBHOOK_SECRET_ENV: Record<StripeMode, string> = { test: "STRIPE_CONNECT_WEBHOOK_SECRET", live: "STRIPE_CONNECT_WEBHOOK_SECRET_LIVE" };
/** Signing secrets for one mode (comma-separated list allowed). */
export function connectWebhookSecrets(mode: StripeMode): string[] {
  return (process.env[WEBHOOK_SECRET_ENV[mode]] ?? "").split(",").map((x) => x.trim()).filter(Boolean);
}

export const CONNECT_WEBHOOK_PATH = "/api/business/stripe/webhook";
/** Events the Connect webhook endpoint must be subscribed to (connected accounts' events). */
export const CONNECT_WEBHOOK_EVENTS = [
  "account.updated",
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "charge.refunded",
  "charge.dispute.created",
] as const;
/** Thin-event destination for Accounts v2 (Developers → Event destinations → "Connected accounts", payload: thin). */
export const CONNECT_WEBHOOK_V2_EVENTS = [
  "v2.core.account.updated",
  "v2.core.account.closed",
  "v2.core.account[requirements].updated",
  "v2.core.account[configuration.merchant].updated",
  "v2.core.account[configuration.merchant].capability_status_updated",
] as const;

export type StripeKeyMode = "test" | "live" | "unknown" | null;
export function stripeKeyMode(): StripeKeyMode {
  const k = process.env.STRIPE_SECRET_KEY?.trim();
  if (!k) return null;
  if (/^(sk|rk)_test_/.test(k)) return "test";
  if (/^(sk|rk)_live_/.test(k)) return "live";
  return "unknown";
}

/** Env vars still missing for the current mode (names only). */
export function missingConnectEnv(): string[] {
  const out: string[] = [];
  if (!process.env.STRIPE_SECRET_KEY?.trim()) out.push("STRIPE_SECRET_KEY");
  if (!connectWebhookSecrets(stripeMode()).length) out.push(WEBHOOK_SECRET_ENV[stripeMode()]);
  return out;
}

/** Why payments are off, in words for the operator. Never shown to sellers. Null when everything matches. */
export function connectProblem(): string | null {
  const mode = stripeMode();
  const missing = missingConnectEnv();
  if (missing.length) return `Missing in Vercel: ${missing.join(", ")} (KEPLAR_STRIPE_MODE=${mode}).`;
  const key = stripeKeyMode();
  if (key === "unknown") return "STRIPE_SECRET_KEY is not a Stripe secret or restricted key (expected sk_/rk_ + test_/live_).";
  if (key !== mode) return `KEPLAR_STRIPE_MODE=${mode} but STRIPE_SECRET_KEY is a ${key} key. Set a ${mode} key or change the mode. Payments stay off until they match.`;
  return null;
}

/** True when the key, mode and webhook secret all agree. */
export const stripeConfigured = () => connectProblem() === null;

export const NOT_SET_UP = "Seller payments aren't set up yet.";

function client() {
  const s = stripeClient();
  if (!s || connectProblem()) throw new HttpError(503, NOT_SET_UP, "not_configured");
  return s;
}

/** Orders of the current Stripe mode only: test and live orders are never mixed. Rows without the flag are test. */
export const inCurrentMode = (o: { livemode?: boolean }) => Boolean(o.livemode) === (stripeMode() === "live");

/* ---------------- Safety rails ---------------- */

export const PAUSED_MESSAGE = "Payments are paused for a moment. Nothing was charged. Please try again shortly.";
/** Kill switch: KEPLAR_PAYMENTS_DISABLED=1 (works even if the database is down) or the admin "Pause payments" control. */
export async function paymentsPaused(): Promise<boolean> {
  if (/^(1|true|yes)$/i.test(process.env.KEPLAR_PAYMENTS_DISABLED?.trim() ?? "")) return true;
  return (await opsControls()).pausePayments === true;
}

/** Hard ceiling for Keplar's fee, whatever the env says: 10%. */
export const MAX_FEE_BPS = 1000;
export const ALLOWED_CURRENCIES = ["usd", "eur", "gbp", "cad", "aud"] as const;
const envInt = (k: string, d: number) => {
  const n = Number(process.env[k]);
  return Number.isInteger(n) && n > 0 ? n : d;
};
/** Order size limits in minor units. Stripe's own floor is 50. Defaults: $0.50 .. $2,000. */
export const orderLimits = () => ({ min: Math.max(50, envInt("KEPLAR_MIN_ORDER_CENTS", 50)), max: envInt("KEPLAR_MAX_ORDER_CENTS", 200_000) });

/** Accounts v2 request body we send to Stripe. */
export function accountsV2Body(input: { email: string; businessName: string; country: string; workspaceId?: string }) {
  return {
    contact_email: input.email || undefined,
    display_name: input.businessName,
    identity: { country: input.country.toLowerCase() },
    dashboard: "full" as const,
    defaults: { responsibilities: { fees_collector: "stripe" as const, losses_collector: "stripe" as const } },
    configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
    include: ["configuration.merchant" as const, "requirements" as const],
    ...(input.workspaceId ? { metadata: { app: "keplar", keplar_workspace_id: input.workspaceId } } : {}),
  };
}

/** The workspace's connected account for the CURRENT mode (test and live accounts never mix). */
export async function getAccount(workspaceId: string, mode: StripeMode = stripeMode()) {
  return (await connectAccounts().list(workspaceId, (a) => (a.mode ?? "test") === mode))[0] ?? null;
}

/** Create (or return) the workspace's connected account. Idempotent per workspace. */
export async function ensureAccount(workspaceId: string, input: { email: string; businessName: string; country?: string }): Promise<ConnectAccount> {
  const mode = stripeMode();
  const existing = await getAccount(workspaceId, mode);
  if (existing) return existing;
  const s = client();
  const country = (input.country ?? "US").toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) throw new HttpError(400, "Pick a valid country.");
  const created = await s.v2.core.accounts.create(accountsV2Body({ ...input, country, workspaceId }), { idempotencyKey: `keplar-connect-acct-${mode === "live" ? "live-" : ""}${workspaceId}` });
  const row: ConnectAccount = {
    id: mode === "live" ? `ca_${workspaceId}_live` : `ca_${workspaceId}`,
    workspaceId,
    stripeAccountId: created.id,
    mode,
    config: { dashboard: "full", fees_collector: "stripe", losses_collector: "stripe", charge_type: "direct" },
    status: "onboarding",
    chargesEnabled: false,
    payoutsEnabled: false,
    country,
    createdAt: now(),
  };
  const { row: stored } = await connectAccounts().insertIfAbsent(row);
  return stored;
}

/** Stripe-hosted onboarding / update link (single use, short lived). */
export async function onboardingLink(acct: ConnectAccount, origin: string): Promise<{ url: string; expiresAt: string }> {
  const s = client();
  const base = `${origin}/app?stripe_connect=`;
  const link = await s.v2.core.accountLinks.create({
    account: acct.stripeAccountId,
    use_case: acct.chargesEnabled
      ? { type: "account_update", account_update: { configurations: ["merchant"], refresh_url: `${base}refresh`, return_url: `${base}return` } }
      : { type: "account_onboarding", account_onboarding: { configurations: ["merchant"], refresh_url: `${base}refresh`, return_url: `${base}return` } },
  });
  return { url: link.url, expiresAt: link.expires_at };
}

export type CheckoutSession = { id: string; url: string };
export type CheckoutInput = { orderId: string; projectId: string; productId: string; productName: string; amount: number; currency: string; origin: string; returnPath: string };

/** Optional Keplar fee on direct charges. 0 until the founder sets KEPLAR_APPLICATION_FEE_BPS. Capped at MAX_FEE_BPS (10%) and never more than the sale. */
export function applicationFee(amount: number) {
  const bps = Number(process.env.KEPLAR_APPLICATION_FEE_BPS ?? 0);
  if (!Number.isFinite(bps) || bps <= 0) return 0;
  return Math.min(Math.max(amount - 1, 0), Math.round((amount * Math.min(bps, MAX_FEE_BPS)) / 10_000));
}

/** Direct-charge Checkout Session on the connected account, with Keplar's application fee. */
export async function createCheckoutSession(acct: ConnectAccount, input: CheckoutInput): Promise<CheckoutSession> {
  if (await paymentsPaused()) throw new HttpError(503, PAUSED_MESSAGE, "payments_paused");
  if (!acct.chargesEnabled || (acct.mode ?? "test") !== stripeMode()) throw new HttpError(409, "This store isn't accepting payments yet.", "payments_not_enabled");
  const lim = orderLimits();
  if (!Number.isInteger(input.amount) || input.amount < lim.min || input.amount > lim.max) throw new HttpError(400, "This product's price is outside what can be charged online.", "bad_price");
  if (!(ALLOWED_CURRENCIES as readonly string[]).includes(input.currency.toLowerCase())) throw new HttpError(400, "This product's currency can't be charged.", "bad_price");
  const s = client();
  const fee = applicationFee(input.amount);
  const meta = {
    keplar_order_id: input.orderId,
    keplar_project_id: input.projectId,
    keplar_product_id: input.productId,
    keplar_product_name: input.productName.slice(0, 160),
  };
  const sep = input.returnPath.includes("?") ? "&" : "?";
  const session = await s.checkout.sessions.create(
    {
      mode: "payment",
      client_reference_id: input.orderId,
      line_items: [{ quantity: 1, price_data: { currency: input.currency.toLowerCase(), unit_amount: input.amount, product_data: { name: input.productName.slice(0, 160) } } }],
      payment_intent_data: { ...(fee > 0 ? { application_fee_amount: fee } : {}), metadata: meta },
      metadata: meta,
      success_url: `${input.origin}${input.returnPath}${sep}checkout=success`,
      cancel_url: `${input.origin}${input.returnPath}${sep}checkout=cancelled`,
    },
    { stripeAccount: acct.stripeAccountId, idempotencyKey: `keplar-checkout-${input.orderId}` },
  );
  if (!session.url) throw new HttpError(502, "Checkout could not start. Try again.", "stripe_no_url");
  return { id: session.id, url: session.url };
}

export type PayoutSummary = { available: { amount: number; currency: string }[]; pending: { amount: number; currency: string }[]; recent: { id: string; amount: number; currency: string; status: string; arrivalDate: string }[] };

/** Balance + latest payouts of the connected account. Null when Stripe isn't configured. */
export async function payoutSummary(acct: ConnectAccount): Promise<PayoutSummary | null> {
  if (!stripeConfigured()) return null;
  const s = client();
  const opts = { stripeAccount: acct.stripeAccountId };
  const [bal, pay] = await Promise.all([s.balance.retrieve({}, opts), s.payouts.list({ limit: 5 }, opts)]);
  const m = (l: { amount: number; currency: string }[]) => l.map((x) => ({ amount: x.amount, currency: x.currency }));
  return {
    available: m(bal.available),
    pending: m(bal.pending),
    recent: pay.data.map((p) => ({ id: p.id, amount: p.amount, currency: p.currency, status: p.status, arrivalDate: new Date(p.arrival_date * 1000).toISOString() })),
  };
}
