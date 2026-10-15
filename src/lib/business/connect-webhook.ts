/**
 * Stripe Connect webhooks for connected accounts (Accounts v2, direct charges).
 * Endpoint: POST /api/business/stripe/webhook, verified with STRIPE_CONNECT_WEBHOOK_SECRET
 * (separate from Keplar's own billing webhook). The route verifies; this module
 * applies the event, so mock fixtures and real Stripe events share one code path.
 *
 * Handled:
 *   Accounts  v2.core.account.updated, v2.core.account[requirements].updated,
 *             v2.core.account[configuration.merchant].updated / .capability_status_updated,
 *             v2.core.account.closed (thin events → the Account is re-fetched), and
 *             v1 account.updated (snapshot fallback) → ConnectAccount status/charges/payouts.
 *   Payments  checkout.session.completed / .async_payment_succeeded → order paid (an order is
 *             created if the session didn't start in Keplar, e.g. a Payment Link), contact,
 *             inbox, audit, `order.paid` event for agents.
 *             checkout.session.async_payment_failed / .expired → pending order cancelled.
 *   Intents   payment_intent.succeeded → PaymentIntent id stored on the order; payment_intent.payment_failed → audit.
 *   Refunds   charge.refunded → refundedAmount (cumulative, absolute), "refunded" when full.
 *   Disputes  charge.dispute.created → audit + inbox (no status change).
 *
 * Idempotency: every event id is stored in biz_connect_events. processed/ignored
 * events are skipped on replay; a failed event is re-processed when Stripe retries
 * (the route returns 500). Order and refund updates are also state-idempotent.
 * Events are scoped by `account` (snapshot) or `context` (thin) and must match the
 * workspace that owns the connected account; anything else is ignored.
 */
import { id, now } from "@/lib/create/platform/ids";
import { collection } from "@/lib/create/platform/store";
import { audit, connectAccounts, inbox, logActivity, orders } from "./repo";
import { completeCheckout } from "./commerce";
import { stripe } from "@/lib/billing/stripe";
import type { ConnectAccount, Order } from "./types";

export type ConnectEvent = {
  id: string;
  object?: string; // "event" (snapshot) | "v2.core.event" (thin)
  type: string;
  livemode?: boolean;
  created?: number | string;
  /** Snapshot events from connected accounts. */
  account?: string | null;
  /** Thin events: the connected account the event happened on. */
  context?: string | null;
  data?: { object: unknown };
  related_object?: { id: string; type: string; url?: string } | null;
};

type EventStatus = "processing" | "processed" | "ignored" | "failed";
export type ConnectEventRow = {
  id: string;
  workspaceId: string;
  type: string;
  account: string | null;
  livemode: boolean;
  status: EventStatus;
  result?: string;
  attempts: number;
  receivedAt: string;
  /** When the current (or last) processing attempt started. Rows written before this field existed fall back to receivedAt. */
  claimedAt?: string;
  processedAt: string | null;
};
export const connectEvents = () => collection<ConnectEventRow>("biz_connect_events");
const SYSTEM_WS = "system";

/** Minimal shapes read from Stripe objects. */
export type V1AccountLike = { id: string; charges_enabled?: boolean; payouts_enabled?: boolean; requirements?: { currently_due?: string[] | null; past_due?: string[] | null; disabled_reason?: string | null } | null };
type CapStatus = "active" | "pending" | "restricted" | "unsupported" | string;
export type V2AccountLike = {
  id: string;
  closed?: boolean | null;
  configuration?: { merchant?: { capabilities?: { card_payments?: { status: CapStatus } | null; stripe_balance?: { payouts?: { status: CapStatus } | null } | null } | null } | null } | null;
  requirements?: { entries?: { description?: string; minimum_deadline?: { status: string } }[] | null; summary?: { minimum_deadline?: { status: string } | null } | null } | null;
};
export type SessionLike = {
  id: string;
  mode?: string | null;
  payment_status?: string | null;
  amount_total?: number | null;
  currency?: string | null;
  customer_email?: string | null;
  customer_details?: { email?: string | null; name?: string | null } | null;
  payment_intent?: string | { id: string } | null;
  metadata?: Record<string, string> | null;
  livemode?: boolean;
};
export type ChargeLike = { id: string; payment_intent?: string | { id: string } | null; amount: number; amount_refunded: number; refunded: boolean; currency: string };
export type PaymentIntentLike = { id: string; amount?: number; currency?: string; metadata?: Record<string, string> | null; last_payment_error?: { message?: string; code?: string } | null };
export type DisputeLike = { id: string; charge?: string | { id: string } | null; payment_intent?: string | { id: string } | null; amount: number; currency: string; reason?: string };

export type ConnectContext = {
  /** Thin v2 account events carry no snapshot; fetch the Account (live: Stripe API, mock: fixture store). */
  fetchV2Account: (accountId: string) => Promise<V2AccountLike | null>;
};

const idOf = (v: string | { id: string } | null | undefined) => (v == null ? null : typeof v === "string" ? v : v.id);
const fmt = (amount: number, currency: string) => `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`;

/* ---------------- Mock adapter: v2 Account snapshots for thin events ---------------- */

type MockV2Account = { id: string; workspaceId: string; account: V2AccountLike };
const mockV2Accounts = () => collection<MockV2Account>("biz_mock_v2_accounts");
export async function setMockV2Account(account: V2AccountLike) {
  const existing = await mockV2Accounts().get(SYSTEM_WS, account.id);
  if (existing) await mockV2Accounts().update(SYSTEM_WS, account.id, { account });
  else await mockV2Accounts().insert({ id: account.id, workspaceId: SYSTEM_WS, account });
}
export async function getMockV2Account(accountId: string) {
  return (await mockV2Accounts().get(SYSTEM_WS, accountId))?.account ?? null;
}

/** Live: the Stripe API (with a key); otherwise the mock fixture store. */
export async function fetchV2Account(accountId: string): Promise<V2AccountLike | null> {
  const s = stripe();
  if (!s) return getMockV2Account(accountId);
  const a = await s.v2.core.accounts.retrieve(accountId, { include: ["configuration.merchant", "requirements"] });
  return a as unknown as V2AccountLike;
}

/* ---------------- Account status ---------------- */

type AccountState = Pick<ConnectAccount, "status" | "chargesEnabled" | "payoutsEnabled"> & { requirementsDue: string[] };

export function stateFromV1(a: V1AccountLike): AccountState {
  const chargesEnabled = Boolean(a.charges_enabled);
  const due = [...(a.requirements?.past_due ?? []), ...(a.requirements?.currently_due ?? [])];
  return {
    chargesEnabled,
    payoutsEnabled: Boolean(a.payouts_enabled),
    status: chargesEnabled ? "active" : a.requirements?.disabled_reason ? "restricted" : "onboarding",
    requirementsDue: [...new Set(due)],
  };
}

export function stateFromV2(a: V2AccountLike): AccountState {
  const caps = a.configuration?.merchant?.capabilities;
  const card = caps?.card_payments?.status;
  const payouts = caps?.stripe_balance?.payouts?.status;
  const entries = a.requirements?.entries ?? [];
  const due = entries.filter((e) => ["currently_due", "past_due"].includes(e.minimum_deadline?.status ?? "")).map((e) => e.description ?? "requirement");
  const pastDue = a.requirements?.summary?.minimum_deadline?.status === "past_due";
  const chargesEnabled = !a.closed && card === "active";
  return {
    chargesEnabled,
    payoutsEnabled: !a.closed && payouts === "active",
    status: chargesEnabled ? "active" : a.closed || card === "restricted" || card === "unsupported" || pastDue ? "restricted" : "onboarding",
    requirementsDue: due,
  };
}

async function applyAccountState(acct: ConnectAccount, next: AccountState, eventId?: string) {
  const changed = acct.status !== next.status || acct.chargesEnabled !== next.chargesEnabled || acct.payoutsEnabled !== next.payoutsEnabled;
  await connectAccounts().update(acct.workspaceId, acct.id, { ...next, ...(eventId ? { lastEventId: eventId } : {}), updatedAt: now() });
  if (changed) {
    await audit(acct.workspaceId, "stripe", "stripe.account.updated", acct.stripeAccountId, `${acct.status} → ${next.status}; charges ${next.chargesEnabled ? "on" : "off"}, payouts ${next.payoutsEnabled ? "on" : "off"}${next.requirementsDue.length ? `; due: ${next.requirementsDue.join(", ")}` : ""}`);
  }
  return changed ? `account_${next.status}` : "account_unchanged";
}

/** Pull the account's current state from Stripe (after returning from onboarding, or on demand). Same code path as the webhook. */
export async function refreshConnectAccount(acct: ConnectAccount, ctx: ConnectContext): Promise<ConnectAccount> {
  const a = await ctx.fetchV2Account(acct.stripeAccountId);
  if (!a) return acct;
  await applyAccountState(acct, stateFromV2(a));
  return (await connectAccounts().get(acct.workspaceId, acct.id)) ?? acct;
}

/* ---------------- Checkout → orders ---------------- */

async function onCheckoutPaid(acct: ConnectAccount, s: SessionLike, livemode: boolean): Promise<string> {
  if (s.payment_status && !["paid", "no_payment_required"].includes(s.payment_status)) return "awaiting_async_payment";
  const email = (s.customer_details?.email ?? s.customer_email ?? "").trim().toLowerCase() || undefined;
  const pi = idOf(s.payment_intent);
  let order = await orders().findSystemBy("checkoutSessionId", s.id);
  if (order && order.workspaceId !== acct.workspaceId) return "ignored_foreign_order";
  if (!order) {
    const amount = s.amount_total ?? 0;
    const md = s.metadata ?? {};
    const created: Order = {
      id: id("ord"),
      workspaceId: acct.workspaceId,
      projectId: md.keplar_project_id ?? "",
      productId: md.keplar_product_id ?? "stripe",
      productName: (md.keplar_product_name ?? "Stripe payment").slice(0, 160),
      amount,
      currency: (s.currency ?? "usd").toLowerCase(),
      applicationFeeAmount: 0,
      status: "pending",
      checkoutSessionId: s.id,
      customerEmail: null,
      contactId: null,
      returnPath: "/",
      createdAt: now(),
      paidAt: null,
      source: "stripe",
      stripeAccountId: acct.stripeAccountId,
      paymentIntentId: pi,
      refundedAmount: 0,
      livemode,
    };
    order = await orders().insert(created);
    await audit(acct.workspaceId, "stripe", "order.created", order.id, `from ${s.id}`);
  }
  if (order.status !== "pending") {
    if (pi && !order.paymentIntentId) await orders().update(order.workspaceId, order.id, { paymentIntentId: pi });
    return `order_already_${order.status}`;
  }
  await completeCheckout(s.id, "paid", email, { livemode, paymentIntentId: pi, stripeAccountId: acct.stripeAccountId });
  return "order_paid";
}

async function onCheckoutClosed(acct: ConnectAccount, s: SessionLike, reason: "expired" | "payment_failed"): Promise<string> {
  const order = await orders().findSystemBy("checkoutSessionId", s.id);
  if (!order) return "no_order";
  if (order.workspaceId !== acct.workspaceId) return "ignored_foreign_order";
  if (order.status !== "pending") return `order_already_${order.status}`;
  await completeCheckout(s.id, "cancelled");
  await audit(acct.workspaceId, "stripe", reason === "expired" ? "order.checkout_expired" : "order.payment_failed", order.id, s.id);
  return "order_cancelled";
}

/* ---------------- Refunds + disputes ---------------- */

async function orderForPayment(acct: ConnectAccount, pi: string | null) {
  if (!pi) return null;
  return orders().findSystemBy("paymentIntentId", pi, { workspaceId: acct.workspaceId });
}

async function onRefund(acct: ConnectAccount, c: ChargeLike): Promise<string> {
  const order = await orderForPayment(acct, idOf(c.payment_intent));
  if (!order) return "no_order";
  const refunded = Math.min(c.amount_refunded, order.amount);
  if ((order.refundedAmount ?? 0) >= refunded && (order.status === "refunded" || !c.refunded)) return "refund_unchanged";
  const full = c.refunded || refunded >= order.amount;
  await orders().update(order.workspaceId, order.id, { refundedAmount: refunded, refundedAt: now(), ...(full ? { status: "refunded" as const } : {}) });
  const text = `${full ? "Refunded" : "Partially refunded"} ${fmt(refunded, order.currency)} of ${order.productName}`;
  await logActivity(order.workspaceId, order.contactId, "order_refunded", text, order.id);
  await inbox().insert({ id: id("msg"), workspaceId: order.workspaceId, channel: "order", direction: "in", from: "Stripe", to: "Store", subject: `Refund: ${order.productName}`, body: `${text}.`, contactId: order.contactId, read: false, mock: false, at: now() });
  await audit(order.workspaceId, "stripe", full ? "order.refunded" : "order.partially_refunded", order.id, fmt(refunded, order.currency));
  return full ? "order_refunded" : "order_partially_refunded";
}

async function onDispute(acct: ConnectAccount, d: DisputeLike): Promise<string> {
  const order = await orderForPayment(acct, idOf(d.payment_intent));
  await inbox().insert({ id: id("msg"), workspaceId: acct.workspaceId, channel: "order", direction: "in", from: "Stripe", to: "Store", subject: "A payment was disputed", body: `Dispute ${d.id} for ${fmt(d.amount, d.currency)}${order ? ` (${order.productName})` : ""}. Respond in your Stripe Dashboard.`, contactId: order?.contactId ?? null, read: false, mock: false, at: now() });
  if (order && !order.disputedAt) await orders().update(order.workspaceId, order.id, { disputedAt: now() });
  await audit(acct.workspaceId, "stripe", "order.disputed", order?.id ?? d.id, d.reason);
  return "dispute_recorded";
}

/* ---------------- PaymentIntents (direct charges made through Keplar's Checkout) ---------------- */

async function orderForIntent(acct: ConnectAccount, pi: PaymentIntentLike) {
  const orderId = pi.metadata?.keplar_order_id;
  const byId = orderId ? await orders().get(acct.workspaceId, orderId) : null;
  return byId ?? (await orderForPayment(acct, pi.id));
}

/** Records the PaymentIntent on the order (so refunds can be matched). The order becomes "paid" on checkout.session.completed. */
async function onIntentSucceeded(acct: ConnectAccount, pi: PaymentIntentLike): Promise<string> {
  const order = await orderForIntent(acct, pi);
  if (!order) return "no_order";
  if (order.paymentIntentId === pi.id) return "intent_unchanged";
  await orders().update(order.workspaceId, order.id, { paymentIntentId: pi.id, stripeAccountId: acct.stripeAccountId });
  return "intent_recorded";
}

/** A failed attempt is shown to the owner; the order stays pending because the customer can retry in the same Checkout. */
async function onIntentFailed(acct: ConnectAccount, pi: PaymentIntentLike): Promise<string> {
  const order = await orderForIntent(acct, pi);
  const why = pi.last_payment_error?.message ?? pi.last_payment_error?.code ?? "declined";
  await audit(acct.workspaceId, "stripe", "order.payment_attempt_failed", order?.id ?? pi.id, String(why).slice(0, 200));
  return order ? "payment_attempt_failed" : "no_order";
}

/* ---------------- Dispatcher ---------------- */

const V2_ACCOUNT_EVENTS = new Set([
  "v2.core.account.updated",
  "v2.core.account.closed",
  "v2.core.account[requirements].updated",
  "v2.core.account[configuration.merchant].updated",
  "v2.core.account[configuration.merchant].capability_status_updated",
]);

export function accountIdOf(e: ConnectEvent): string | null {
  if (e.account) return e.account;
  if (e.context) return e.context;
  if (e.type.startsWith("v2.core.account") && e.related_object?.type === "v2.core.account") return e.related_object.id;
  if (e.type === "account.updated") return (e.data?.object as V1AccountLike | undefined)?.id ?? null;
  return null;
}

async function dispatch(e: ConnectEvent, acct: ConnectAccount, ctx: ConnectContext): Promise<{ status: "processed" | "ignored"; result: string }> {
  const obj = e.data?.object;
  const livemode = Boolean(e.livemode);
  if (V2_ACCOUNT_EVENTS.has(e.type)) {
    const a = await ctx.fetchV2Account(e.related_object?.id ?? acct.stripeAccountId);
    if (!a) return { status: "ignored", result: "account_not_fetched" };
    return { status: "processed", result: await applyAccountState(acct, stateFromV2(e.type === "v2.core.account.closed" ? { ...a, closed: true } : a), e.id) };
  }
  switch (e.type) {
    case "account.updated":
      return { status: "processed", result: await applyAccountState(acct, stateFromV1(obj as V1AccountLike), e.id) };
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const s = obj as SessionLike;
      if (s.mode && s.mode !== "payment") return { status: "ignored", result: `mode_${s.mode}` };
      const r = await onCheckoutPaid(acct, s, livemode);
      return { status: r.startsWith("ignored") ? "ignored" : "processed", result: r };
    }
    case "checkout.session.async_payment_failed":
      return { status: "processed", result: await onCheckoutClosed(acct, obj as SessionLike, "payment_failed") };
    case "checkout.session.expired":
      return { status: "processed", result: await onCheckoutClosed(acct, obj as SessionLike, "expired") };
    case "payment_intent.succeeded":
      return { status: "processed", result: await onIntentSucceeded(acct, obj as PaymentIntentLike) };
    case "payment_intent.payment_failed":
      return { status: "processed", result: await onIntentFailed(acct, obj as PaymentIntentLike) };
    case "charge.refunded":
      return { status: "processed", result: await onRefund(acct, obj as ChargeLike) };
    case "charge.dispute.created":
      return { status: "processed", result: await onDispute(acct, obj as DisputeLike) };
    default:
      return { status: "ignored", result: "unhandled_type" };
  }
}

export type ConnectResult = { duplicate?: boolean; status: EventStatus; result: string; workspaceId: string };

// A fast path for two deliveries of one event in the same instance. Across instances, the claim below is the lock.
const inFlight = new Set<string>();

export class ConnectEventInFlight extends Error {}

/**
 * One row per processing attempt of an event, keyed `<event id>#<attempt>` in the system workspace. insertIfAbsent is atomic
 * (Postgres: INSERT ... ON CONFLICT DO NOTHING on the primary key; file store: under the file lock), so of two deliveries that
 * read the same prior state, exactly one wins the claim and the other gets a 409 (Stripe retries it later).
 */
export type ConnectEventClaim = { id: string; workspaceId: string; eventId: string; at: string };
export const connectEventClaims = () => collection<ConnectEventClaim>("biz_connect_event_claims");

/** A "processing" attempt older than this is treated as abandoned (the instance died) and may be taken over by a retry. */
const STALE_PROCESSING_MS = 10 * 60_000;

async function claim(eventId: string, attempt: number): Promise<boolean> {
  const { inserted } = await connectEventClaims().insertIfAbsent({ id: `${eventId}#${attempt}`, workspaceId: SYSTEM_WS, eventId, at: now() });
  return inserted;
}

export async function handleConnectEvent(e: ConnectEvent, ctx: ConnectContext): Promise<ConnectResult> {
  if (!e?.id || !e.type) throw new Error("Malformed event");
  if (inFlight.has(e.id)) throw new ConnectEventInFlight(`Event ${e.id} is already being processed`);
  inFlight.add(e.id);
  try {
    return await handleOnce(e, ctx);
  } finally {
    inFlight.delete(e.id);
  }
}

async function handleOnce(e: ConnectEvent, ctx: ConnectContext): Promise<ConnectResult> {
  const prior = await connectEvents().findSystemBy("id", e.id);
  const done = (p: ConnectEventRow): ConnectResult => ({ duplicate: true, status: p.status, result: p.result ?? "", workspaceId: p.workspaceId });
  if (prior && (prior.status === "processed" || prior.status === "ignored")) return done(prior);
  if (prior?.status === "processing" && Date.now() - Date.parse(prior.claimedAt ?? prior.receivedAt) < STALE_PROCESSING_MS) {
    throw new ConnectEventInFlight(`Event ${e.id} is already being processed`);
  }
  const attempts = (prior?.attempts ?? 0) + 1;
  if (!(await claim(e.id, attempts))) {
    // Another delivery claimed this attempt first. If it has already finished, answer like any duplicate.
    const latest = await connectEvents().findSystemBy("id", e.id);
    if (latest && (latest.status === "processed" || latest.status === "ignored")) return done(latest);
    throw new ConnectEventInFlight(`Event ${e.id} is already being processed`);
  }
  const accountId = accountIdOf(e);
  const acct = accountId ? await connectAccounts().findSystemBy("stripeAccountId", accountId) : null;
  const workspaceId = acct?.workspaceId ?? SYSTEM_WS;
  const claimedAt = now();
  const row: ConnectEventRow = prior
    ? { ...prior, workspaceId, status: "processing", attempts, claimedAt }
    : { id: e.id, workspaceId, type: e.type, account: accountId, livemode: Boolean(e.livemode), status: "processing", attempts, receivedAt: claimedAt, claimedAt, processedAt: null };
  if (prior) {
    // workspaceId can change if the account was linked after the first attempt; re-key the row.
    await connectEvents().remove(prior.workspaceId, prior.id);
  }
  await connectEvents().insert(row);

  const finish = async (status: EventStatus, result: string) => {
    await connectEvents().update(workspaceId, e.id, { status, result, processedAt: now() });
    return { status, result, workspaceId };
  };
  if (!acct) return finish("ignored", accountId ? "unknown_account" : "no_account");
  // Test and live never mix: an event only applies to a connected account of the same mode.
  if ((acct.mode ?? "test") !== (e.livemode ? "live" : "test")) return finish("ignored", "mode_mismatch");
  try {
    const out = await dispatch(e, acct, ctx);
    return finish(out.status, out.result);
  } catch (err) {
    await finish("failed", err instanceof Error ? err.message : String(err));
    throw err;
  }
}
