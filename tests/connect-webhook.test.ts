import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "@/app/api/business/stripe/webhook/route";
import { testAccount, testWorkspace } from "./helpers/workspace";
import { getAccount } from "@/lib/business/stripe";
import { auditLog, connectAccounts, contacts, inbox, orders } from "@/lib/business/repo";
import { connectEventClaims, connectEvents, ConnectEventInFlight, handleConnectEvent, setMockV2Account, type ConnectEvent } from "@/lib/business/connect-webhook";
import { fixtures, signFixture } from "./helpers/connect-fixtures";
import { id, now } from "@/lib/create/platform/ids";

const SECRET = "whsec_test_connect_fixture";
const SECRET_THIN = "whsec_test_connect_thin";

async function send(event: ConnectEvent, secret = SECRET, headerOverride?: string | null) {
  const { payload, header } = signFixture(event, secret);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (headerOverride !== null) headers["stripe-signature"] = headerOverride ?? header;
  const res = await POST(new Request("http://localhost/api/business/stripe/webhook", { method: "POST", headers, body: payload }));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function setup() {
  const ws = await testWorkspace("connect", "plus");
  const acct = await testAccount(ws.id);
  return { ws, acct };
}

test("signature verification and configuration", async () => {
  const { acct } = await setup();
  delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  assert.equal((await send(fixtures.accountUpdatedV1(acct.stripeAccountId))).status, 503);
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET = `${SECRET}, ${SECRET_THIN}`;
  assert.equal((await send(fixtures.accountUpdatedV1(acct.stripeAccountId), SECRET, null)).status, 400, "missing signature");
  assert.equal((await send(fixtures.accountUpdatedV1(acct.stripeAccountId), "whsec_wrong")).status, 400, "wrong secret");
  assert.equal((await send(fixtures.accountUpdatedV1(acct.stripeAccountId), SECRET, "t=1,v1=deadbeef")).status, 400, "forged signature");
  // Test mode: a live-mode event signed with the TEST secret is not a valid live event.
  assert.equal((await send({ ...fixtures.accountUpdatedV1(acct.stripeAccountId), livemode: true })).status, 400, "live event needs the live secret");
  // Signed with the live secret it is genuine but not applied while the app is in test mode.
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET_LIVE = "whsec_live_connect_fixture";
  const live = await send({ ...fixtures.accountUpdatedV1(acct.stripeAccountId), livemode: true }, "whsec_live_connect_fixture");
  assert.equal(live.body.ignored, "livemode_not_allowed");
  assert.equal((await getAccount(acct.workspaceId))?.chargesEnabled, false, "nothing was applied");
  delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET_LIVE;
});

test("account status updates (v1 snapshot + v2 thin events), idempotent", async () => {
  const { ws, acct } = await setup();
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET = `${SECRET},${SECRET_THIN}`;
  assert.equal(acct.status, "onboarding");
  const ev = fixtures.accountUpdatedV1(acct.stripeAccountId);
  const r1 = await send(ev);
  assert.equal(r1.status, 200);
  assert.equal(r1.body.result, "account_active");
  assert.equal((await getAccount(ws.id))?.chargesEnabled, true);
  const replay = await send(ev);
  assert.equal(replay.body.duplicate, true);

  await setMockV2Account(fixtures.v2Account(acct.stripeAccountId, { card: "restricted", payouts: "restricted", due: ["Provide a bank account"], pastDue: true }));
  const thin = await send(fixtures.v2AccountEvent(acct.stripeAccountId, "v2.core.account[requirements].updated"), SECRET_THIN);
  assert.equal(thin.body.result, "account_restricted");
  const a = await getAccount(ws.id);
  assert.equal(a?.status, "restricted");
  assert.equal(a?.chargesEnabled, false);
  assert.deepEqual(a?.requirementsDue, ["Provide a bank account"]);

  await setMockV2Account(fixtures.v2Account(acct.stripeAccountId));
  assert.equal((await send(fixtures.v2AccountEvent(acct.stripeAccountId), SECRET_THIN)).body.result, "account_active");
  assert.ok((await auditLog().list(ws.id, (e) => e.action === "stripe.account.updated")).length >= 3);

  const unknown = await send(fixtures.accountUpdatedV1("acct_unknown"));
  assert.equal(unknown.body.status, "ignored");
  assert.equal(unknown.body.result, "unknown_account");
});

test("checkout events create orders in Business OS; refunds; expiry", async () => {
  const { ws, acct } = await setup();
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET = SECRET;
  const acctId = acct.stripeAccountId;

  // Session that did not start in Keplar (e.g. a Payment Link) → new paid order.
  const s1 = fixtures.checkoutSession({ amount_total: 4200, customer_details: { email: "Buyer@Example.com" }, metadata: { keplar_product_name: "Print" } });
  const e1 = fixtures.checkoutCompleted(acctId, s1);
  const r1 = await send(e1);
  assert.equal(r1.body.result, "order_paid");
  let o1 = (await orders().list(ws.id, (o) => o.checkoutSessionId === s1.id))[0];
  assert.equal(o1.status, "paid");
  assert.equal(o1.amount, 4200);
  assert.equal(o1.source, "stripe");
  assert.equal(o1.paymentIntentId, s1.payment_intent);
  assert.equal(o1.customerEmail, "buyer@example.com");
  assert.ok((await contacts().list(ws.id, (c) => c.email === "buyer@example.com")).length === 1);
  assert.ok((await inbox().list(ws.id, (m) => m.subject === "New order: Print")).length === 1);
  assert.equal((await send(e1)).body.duplicate, true);
  assert.equal((await orders().list(ws.id, (o) => o.checkoutSessionId === s1.id)).length, 1, "replay creates no second order");

  // Order started by Keplar's own checkout → marked paid.
  const s2 = fixtures.checkoutSession({ amount_total: 1500 });
  await orders().insert({ id: id("ord"), workspaceId: ws.id, projectId: "prj_x", productId: "p1", productName: "Mug", amount: 1500, currency: "usd", applicationFeeAmount: 0, status: "pending", checkoutSessionId: s2.id, customerEmail: null, contactId: null, returnPath: "/sites/x/", createdAt: now(), paidAt: null });
  assert.equal((await send(fixtures.checkoutCompleted(acctId, { ...s2, payment_status: "unpaid" }))).body.result, "awaiting_async_payment");
  assert.equal((await send(fixtures.checkoutCompleted(acctId, s2, "checkout.session.async_payment_succeeded"))).body.result, "order_paid");
  const o2 = (await orders().list(ws.id, (o) => o.checkoutSessionId === s2.id))[0];
  assert.equal(o2.status, "paid");
  assert.equal(o2.stripeAccountId, acctId);

  // Refunds: partial then full, matched on the PaymentIntent, cumulative + idempotent.
  const pi = s1.payment_intent as string;
  assert.equal((await send(fixtures.chargeRefunded(acctId, { payment_intent: pi, amount: 4200, amount_refunded: 1000, refunded: false }))).body.result, "order_partially_refunded");
  o1 = (await orders().get(ws.id, o1.id))!;
  assert.equal(o1.status, "paid");
  assert.equal(o1.refundedAmount, 1000);
  assert.equal((await send(fixtures.chargeRefunded(acctId, { payment_intent: pi, amount: 4200, amount_refunded: 1000, refunded: false }))).body.result, "refund_unchanged");
  assert.equal((await send(fixtures.chargeRefunded(acctId, { payment_intent: pi, amount: 4200 }))).body.result, "order_refunded");
  o1 = (await orders().get(ws.id, o1.id))!;
  assert.equal(o1.status, "refunded");
  assert.equal(o1.refundedAmount, 4200);
  assert.ok((await auditLog().list(ws.id, (e) => e.action === "order.refunded" && e.target === o1.id)).length === 1);

  // Expiry cancels a pending order.
  const s3 = fixtures.checkoutSession();
  await orders().insert({ id: id("ord"), workspaceId: ws.id, projectId: "prj_x", productId: "p1", productName: "Mug", amount: 1500, currency: "usd", applicationFeeAmount: 0, status: "pending", checkoutSessionId: s3.id, customerEmail: null, contactId: null, returnPath: "/sites/x/", createdAt: now(), paidAt: null });
  assert.equal((await send(fixtures.checkoutExpired(acctId, s3))).body.result, "order_cancelled");

  // A session belonging to another workspace's order is never applied via this account.
  const s4 = fixtures.checkoutSession();
  await orders().insert({ id: id("ord"), workspaceId: "ws_other", projectId: "p", productId: "p", productName: "X", amount: 100, currency: "usd", applicationFeeAmount: 0, status: "pending", checkoutSessionId: s4.id, customerEmail: null, contactId: null, returnPath: "/", createdAt: now(), paidAt: null });
  const foreign = await send(fixtures.checkoutCompleted(acctId, s4));
  assert.equal(foreign.body.result, "ignored_foreign_order");
  assert.equal((await orders().list("ws_other"))[0].status, "pending");

  // Every event id was stored once.
  const rows = await connectEvents().list(ws.id);
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
});

test("handler failures are stored as failed and re-processed on Stripe's retry", async () => {
  const { acct } = await setup();
  const ev = fixtures.v2AccountEvent(acct.stripeAccountId);
  let calls = 0;
  const ctx = { fetchV2Account: async () => { calls += 1; if (calls === 1) throw new Error("Stripe API 503"); return fixtures.v2Account(acct.stripeAccountId); } };
  await assert.rejects(handleConnectEvent(ev, ctx), /503/);
  assert.equal((await connectEvents().findSystem((r) => r.id === ev.id))?.status, "failed");
  const ok = await handleConnectEvent(ev, ctx);
  assert.equal(ok.status, "processed");
  const row = await connectEvents().findSystem((r) => r.id === ev.id);
  assert.equal(row?.attempts, 2);
  assert.equal((await connectAccounts().list(acct.workspaceId)).length, 1);
});

test("dedupe across instances: an attempt claimed elsewhere is refused (409 path), a stale 'processing' attempt is taken over", async () => {
  const { acct } = await setup();
  const ctx = { fetchV2Account: async () => fixtures.v2Account(acct.stripeAccountId) };

  // Another instance claimed the first attempt of this event a moment ago (its row isn't written yet): this delivery must not process it too.
  const ev = fixtures.v2AccountEvent(acct.stripeAccountId);
  assert.equal((await connectEventClaims().insertIfAbsent({ id: `${ev.id}#1`, workspaceId: "system", eventId: ev.id, at: now() })).inserted, true);
  await assert.rejects(handleConnectEvent(ev, ctx), ConnectEventInFlight);
  assert.equal(await connectEvents().findSystemBy("id", ev.id), null, "nothing was processed or recorded");

  // A fresh "processing" row (another instance is working on it right now) is refused too.
  const ev2 = fixtures.v2AccountEvent(acct.stripeAccountId);
  const row = { id: ev2.id, workspaceId: acct.workspaceId, type: ev2.type, account: acct.stripeAccountId, livemode: false, status: "processing" as const, attempts: 1, receivedAt: now(), claimedAt: now(), processedAt: null };
  await connectEvents().insert(row);
  await assert.rejects(handleConnectEvent(ev2, ctx), ConnectEventInFlight);

  // ...but once it is older than the stale window (the instance died), Stripe's retry takes it over as attempt 2.
  const old = new Date(Date.now() - 11 * 60_000).toISOString();
  await connectEvents().update(acct.workspaceId, ev2.id, { receivedAt: old, claimedAt: old });
  const out = await handleConnectEvent(ev2, ctx);
  assert.equal(out.status, "processed");
  assert.equal((await connectEvents().findSystemBy("id", ev2.id))?.attempts, 2);
  // A replay after that is a duplicate, never a second run.
  assert.equal((await handleConnectEvent(ev2, ctx)).duplicate, true);
});
