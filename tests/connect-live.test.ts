import "./setup";
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { testAccount, testWorkspace } from "./helpers/workspace";
import { setStripeClientForTests } from "@/lib/billing/stripe";
import { accountsV2Body, applicationFee, CONNECT_WEBHOOK_EVENTS, connectProblem, createCheckoutSession, ensureAccount, getAccount, missingConnectEnv, onboardingLink, payoutSummary, stripeConfigured, stripeKeyMode, stripeMode } from "@/lib/business/stripe";
import { setControls } from "@/lib/ops/controls";
import Stripe from "stripe";
import { POST as webhookPOST } from "@/app/api/business/stripe/webhook/route";
import { startCheckout } from "@/lib/business/commerce";
import { fetchV2Account, handleConnectEvent, refreshConnectAccount, type ConnectEvent } from "@/lib/business/connect-webhook";
import { dashboard } from "@/lib/business/dashboard";
import { auditLog, connectAccounts, orders } from "@/lib/business/repo";
import { projects } from "@/lib/create/repo";
import { connectEvents } from "@/lib/business/connect-webhook";
import { fixtures } from "./helpers/connect-fixtures";
import { HttpError } from "@/lib/create/platform/http";
import { now } from "@/lib/create/platform/ids";

type Call = { fn: string; params: unknown; opts?: Record<string, unknown> };
let calls: Call[] = [];
let v2State: Record<string, unknown> = {};

function fake() {
  return {
    v2: {
      core: {
        accounts: {
          create: async (params: unknown, opts: Record<string, unknown>) => { calls.push({ fn: "accounts.create", params, opts }); return { id: `acct_fake_${calls.length}${Math.random().toString(36).slice(2, 6)}` }; },
          retrieve: async (id: string) => { calls.push({ fn: "accounts.retrieve", params: id }); return v2State[id] ?? fixtures.v2Account(id); },
        },
        accountLinks: { create: async (params: unknown) => { calls.push({ fn: "accountLinks.create", params }); return { url: "https://connect.stripe.com/setup/e/test", expires_at: "2099-01-01T00:00:00Z" }; } },
      },
    },
    checkout: { sessions: { create: async (params: unknown, opts: Record<string, unknown>) => { calls.push({ fn: "sessions.create", params, opts }); return { id: `cs_test_${calls.length}`, url: "https://checkout.stripe.com/c/pay/cs_test" }; } } },
    balance: { retrieve: async () => ({ available: [{ amount: 1200, currency: "usd" }], pending: [{ amount: 300, currency: "usd" }] }) },
    payouts: { list: async () => ({ data: [{ id: "po_1", amount: 900, currency: "usd", status: "paid", arrival_date: 1_700_000_000 }] }) },
    webhooks: { constructEvent: () => { throw new Error("unused"); } },
  };
}

const KEYS = ["STRIPE_SECRET_KEY", "STRIPE_CONNECT_WEBHOOK_SECRET", "STRIPE_CONNECT_WEBHOOK_SECRET_LIVE", "KEPLAR_STRIPE_MODE", "KEPLAR_PAYMENTS_DISABLED", "KEPLAR_MIN_ORDER_CENTS", "KEPLAR_MAX_ORDER_CENTS", "KEPLAR_APPLICATION_FEE_BPS", "NEXT_PUBLIC_SITE_URL"] as const;
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of KEYS) saved[k] = process.env[k];
  calls = [];
  v2State = {};
  process.env.STRIPE_SECRET_KEY = "sk_test_fake_for_unit_tests";
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET = "whsec_unit";
  for (const k of ["STRIPE_CONNECT_WEBHOOK_SECRET_LIVE", "KEPLAR_STRIPE_MODE", "KEPLAR_PAYMENTS_DISABLED", "KEPLAR_MIN_ORDER_CENTS", "KEPLAR_MAX_ORDER_CENTS", "KEPLAR_APPLICATION_FEE_BPS"]) delete process.env[k];
  setStripeClientForTests(fake());
});
afterEach(async () => {
  setStripeClientForTests(null);
  await setControls({ pausePayments: false }, "test");
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

test("not configured: clear states, nothing is simulated", async () => {
  setStripeClientForTests(null);
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  assert.equal(stripeConfigured(), false);
  assert.deepEqual(missingConnectEnv(), ["STRIPE_SECRET_KEY", "STRIPE_CONNECT_WEBHOOK_SECRET"]);
  const ws = await testWorkspace("nc", "plus");
  await assert.rejects(ensureAccount(ws.id, { email: "a@b.co", businessName: "B" }), (e: unknown) => e instanceof HttpError && e.status === 503 && e.code === "not_configured");
  const dash = await dashboard(ws);
  assert.equal(dash.configured.payments, false);
  assert.equal(dash.payments, null);
});

test("mode gating: KEPLAR_STRIPE_MODE decides, the key and webhook secret must match", async () => {
  assert.equal(stripeMode(), "test", "default is test");
  process.env.KEPLAR_STRIPE_MODE = "bogus";
  assert.equal(stripeMode(), "test", "anything but 'live' is test");
  // test mode + live key → off, with an admin-only reason
  process.env.STRIPE_SECRET_KEY = "sk_live_not_a_real_key";
  delete process.env.KEPLAR_STRIPE_MODE;
  assert.equal(stripeKeyMode(), "live");
  assert.equal(stripeConfigured(), false);
  assert.match(connectProblem()!, /KEPLAR_STRIPE_MODE=test but STRIPE_SECRET_KEY is a live key/);
  const ws = await testWorkspace("liveref", "plus");
  await assert.rejects(ensureAccount(ws.id, { email: "a@b.co", businessName: "B" }), (e: unknown) => e instanceof HttpError && e.code === "not_configured" && e.message === "Seller payments aren't set up yet.");
  assert.equal(calls.length, 0, "no Stripe call was made");
  // live mode + test key → off
  process.env.KEPLAR_STRIPE_MODE = "live";
  process.env.STRIPE_SECRET_KEY = "sk_test_fake_for_unit_tests";
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET_LIVE = "whsec_live_unit";
  assert.equal(stripeConfigured(), false);
  assert.match(connectProblem()!, /KEPLAR_STRIPE_MODE=live but STRIPE_SECRET_KEY is a test key/);
  // live mode + live key but only the TEST webhook secret → off, names the missing var
  process.env.STRIPE_SECRET_KEY = "rk_live_fake_for_unit_tests";
  delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET_LIVE;
  assert.deepEqual(missingConnectEnv(), ["STRIPE_CONNECT_WEBHOOK_SECRET_LIVE"]);
  assert.equal(stripeConfigured(), false);
  // all three agree → on
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET_LIVE = "whsec_live_unit";
  assert.equal(connectProblem(), null);
  assert.equal(stripeConfigured(), true);
  // garbage key
  process.env.STRIPE_SECRET_KEY = "pk_live_publishable";
  assert.match(connectProblem()!, /not a Stripe secret or restricted key/);
});

test("ensureAccount creates an Accounts v2 account once per workspace", async () => {
  const ws = await testWorkspace("acct1", "plus");
  const a = await ensureAccount(ws.id, { email: "owner@example.com", businessName: "Bakery", country: "us" });
  const create = calls.find((c) => c.fn === "accounts.create")!;
  const body = create.params as ReturnType<typeof accountsV2Body>;
  assert.equal(body.dashboard, "full");
  assert.deepEqual(body.defaults.responsibilities, { fees_collector: "stripe", losses_collector: "stripe" });
  assert.equal(body.identity.country, "us");
  assert.deepEqual(body.configuration.merchant.capabilities.card_payments, { requested: true });
  assert.equal(create.opts?.idempotencyKey, `keplar-connect-acct-${ws.id}`);
  assert.equal(a.status, "onboarding");
  assert.equal(a.chargesEnabled, false);
  assert.equal(a.mode, "test");
  const again = await ensureAccount(ws.id, { email: "owner@example.com", businessName: "Bakery" });
  assert.equal(again.stripeAccountId, a.stripeAccountId);
  assert.equal(calls.filter((c) => c.fn === "accounts.create").length, 1, "second call reuses the stored account");
  await assert.rejects(ensureAccount((await testWorkspace("acct2", "plus")).id, { email: "x@y.co", businessName: "X", country: "USA" }), /valid country/);
});

test("hosted onboarding link (v2 account link) and status refresh", async () => {
  const ws = await testWorkspace("onb", "plus");
  const acct = await ensureAccount(ws.id, { email: "o@example.com", businessName: "Shop" });
  const link = await onboardingLink(acct, "https://keplar.one");
  assert.equal(link.url, "https://connect.stripe.com/setup/e/test");
  const p = calls.find((c) => c.fn === "accountLinks.create")!.params as { account: string; use_case: { type: string; account_onboarding: { configurations: string[]; refresh_url: string; return_url: string } } };
  assert.equal(p.account, acct.stripeAccountId);
  assert.equal(p.use_case.type, "account_onboarding");
  assert.deepEqual(p.use_case.account_onboarding.configurations, ["merchant"]);
  assert.equal(p.use_case.account_onboarding.return_url, "https://keplar.one/app?stripe_connect=return");
  assert.equal(p.use_case.account_onboarding.refresh_url, "https://keplar.one/app?stripe_connect=refresh");

  // Not verified yet → stays onboarding; then Stripe says active → charges on, audit written.
  v2State[acct.stripeAccountId] = fixtures.v2Account(acct.stripeAccountId, { card: "pending", payouts: "pending", due: ["Verify your identity"] });
  let r = await refreshConnectAccount(acct, { fetchV2Account });
  assert.equal(r.status, "onboarding");
  assert.deepEqual(r.requirementsDue, ["Verify your identity"]);
  v2State[acct.stripeAccountId] = fixtures.v2Account(acct.stripeAccountId);
  r = await refreshConnectAccount(acct, { fetchV2Account });
  assert.equal(r.status, "active");
  assert.equal(r.chargesEnabled && r.payoutsEnabled, true);
  assert.ok((await auditLog().list(ws.id, (e) => e.action === "stripe.account.updated")).length >= 1);
  const upd = await onboardingLink(r, "https://keplar.one");
  assert.ok(upd.url);
  assert.equal((calls.filter((c) => c.fn === "accountLinks.create").pop()!.params as { use_case: { type: string } }).use_case.type, "account_update");
});

test("application fee is bounded", () => {
  assert.equal(applicationFee(10_000), 0);
  process.env.KEPLAR_APPLICATION_FEE_BPS = "250";
  assert.equal(applicationFee(10_000), 250);
  process.env.KEPLAR_APPLICATION_FEE_BPS = "99999";
  assert.equal(applicationFee(1000), 100, "hard cap of 10% whatever the env says");
  process.env.KEPLAR_APPLICATION_FEE_BPS = "1000";
  assert.equal(applicationFee(1), 0, "never the whole sale");
  process.env.KEPLAR_APPLICATION_FEE_BPS = "abc";
  assert.equal(applicationFee(1000), 0);
});

async function liveStore(label: string) {
  const ws = await testWorkspace(label, "plus");
  const acct = await testAccount(ws.id);
  await connectAccounts().update(ws.id, acct.id, { status: "active", chargesEnabled: true, payoutsEnabled: true });
  const t = now();
  const project = await projects().insert({ id: `prj_${label}`, workspaceId: ws.id, name: "Shop", slug: `${label}-shop`, kind: "site", spec: { products: [{ id: "p1", name: "Mug", price: 2500, currency: "usd", description: "" }] }, draftVersion: 0, files: [], messages: [], liveDeployId: "dep_live", publishedAt: t, scan: null, takenDown: false, createdAt: t, updatedAt: t } as never);
  return { ws, acct: (await getAccount(ws.id))!, project };
}

test("checkout: direct charge on the connected account with application fee, order stored, webhook completes it", async () => {
  process.env.KEPLAR_APPLICATION_FEE_BPS = "300";
  const { ws, acct } = await liveStore("co1");
  const { order, session } = await startCheckout({ projectId: "prj_co1", productId: "p1", returnPath: "/sites/co1-shop/", origin: "https://keplar.one" });
  const call = calls.find((c) => c.fn === "sessions.create")!;
  const p = call.params as Record<string, unknown> & { line_items: { quantity: number; price_data: { currency: string; unit_amount: number } }[]; payment_intent_data: { application_fee_amount: number; metadata: Record<string, string> } };
  assert.equal(p.mode, "payment");
  assert.equal("payment_method_types" in p, false, "dynamic payment methods");
  assert.equal(p.line_items[0].price_data.unit_amount, 2500);
  assert.equal(p.payment_intent_data.application_fee_amount, 75);
  assert.equal(p.payment_intent_data.metadata.keplar_order_id, order.id);
  assert.equal(p.success_url, "https://keplar.one/sites/co1-shop/?checkout=success");
  assert.equal(p.cancel_url, "https://keplar.one/sites/co1-shop/?checkout=cancelled");
  assert.equal(call.opts?.stripeAccount, acct.stripeAccountId);
  assert.equal(call.opts?.idempotencyKey, `keplar-checkout-${order.id}`);
  assert.equal(order.applicationFeeAmount, 75);
  assert.equal(order.status, "pending");
  assert.equal(order.checkoutSessionId, session.id);

  // payment_intent.succeeded records the intent; checkout.session.completed marks it paid (idempotent).
  const pi = "pi_test_co1";
  const piEv: ConnectEvent = { id: "evt_pi_ok", object: "event", type: "payment_intent.succeeded", account: acct.stripeAccountId, livemode: false, data: { object: { id: pi, amount: 2500, currency: "usd", metadata: { keplar_order_id: order.id } } } };
  assert.equal((await handleConnectEvent(piEv, { fetchV2Account })).result, "intent_recorded");
  assert.equal((await orders().get(ws.id, order.id))?.paymentIntentId, pi);
  const done = fixtures.checkoutCompleted(acct.stripeAccountId, fixtures.checkoutSession({ id: session.id, amount_total: 2500, payment_intent: pi }));
  assert.equal((await handleConnectEvent(done, { fetchV2Account })).result, "order_paid");
  assert.equal((await handleConnectEvent(done, { fetchV2Account })).duplicate, true);
  const failEv: ConnectEvent = { id: "evt_pi_fail", object: "event", type: "payment_intent.payment_failed", account: acct.stripeAccountId, livemode: false, data: { object: { id: "pi_other", metadata: { keplar_order_id: order.id }, last_payment_error: { message: "Your card was declined." } } } };
  assert.equal((await handleConnectEvent(failEv, { fetchV2Account })).result, "payment_attempt_failed");
  assert.equal((await orders().get(ws.id, order.id))?.status, "paid", "a failed retry never un-pays an order");
  assert.equal((await connectEvents().list(ws.id)).length, 3);

  // Refund shows up in revenue.
  await handleConnectEvent(fixtures.chargeRefunded(acct.stripeAccountId, { payment_intent: pi, amount: 2500, amount_refunded: 500, refunded: false }), { fetchV2Account });
  const dash = await dashboard(ws);
  assert.equal(dash.revenue.total, 2000);
  assert.equal(dash.revenue.fees, 75);
  assert.equal(dash.revenue.refunded, 500);
  assert.equal(dash.payments?.chargesEnabled, true);
});

test("checkout refuses stores that can't charge or products that can't be priced", async () => {
  const { ws, acct } = await liveStore("co2");
  await connectAccounts().update(ws.id, acct.id, { chargesEnabled: false, status: "onboarding" });
  await assert.rejects(startCheckout({ projectId: "prj_co2", productId: "p1", origin: "https://keplar.one" }), (e: unknown) => e instanceof HttpError && e.code === "payments_not_enabled");
  await connectAccounts().update(ws.id, acct.id, { chargesEnabled: true, status: "active" });
  await assert.rejects(createCheckoutSession({ ...acct, chargesEnabled: true }, { orderId: "ord_x", projectId: "p", productId: "p", productName: "Free", amount: 10, currency: "usd", origin: "https://keplar.one", returnPath: "/sites/x/" }), (e: unknown) => e instanceof HttpError && e.code === "bad_price");
  assert.equal(calls.filter((c) => c.fn === "sessions.create").length, 0);
  await assert.rejects(startCheckout({ projectId: "prj_co2", productId: "nope", origin: "https://keplar.one" }), /Product not found/);
});

test("payout summary reads the connected account's balance and payouts", async () => {
  const { acct } = await liveStore("po1");
  const s = await payoutSummary(acct);
  assert.deepEqual(s?.available, [{ amount: 1200, currency: "usd" }]);
  assert.equal(s?.recent[0].status, "paid");
});

test("webhook endpoint contract lists every event the handler uses", () => {
  for (const t of ["account.updated", "checkout.session.completed", "payment_intent.succeeded", "payment_intent.payment_failed", "charge.refunded"]) assert.ok((CONNECT_WEBHOOK_EVENTS as readonly string[]).includes(t), t);
});

test("payments routes need a signed-in account", async () => {
  for (const [p, methods] of [["payments", ["GET", "POST"]], ["payments/onboarding", ["POST"]], ["payments/refresh", ["POST"]]] as const) {
    const mod = (await import(`@/app/api/business/${p}/route`)) as Record<string, (req: Request) => Promise<Response>>;
    for (const m of methods) {
      const res = await mod[m](new Request(`https://keplar.one/api/business/${p}`, { method: m, headers: { "content-type": "application/json", origin: "https://keplar.one", "x-forwarded-for": "9.9.9.9" }, body: m === "GET" ? undefined : "{}" }));
      assert.equal(res.status, 401, `${m} ${p}`);
    }
  }
});


/* ---------------- Live mode ---------------- */

function goLive() {
  process.env.KEPLAR_STRIPE_MODE = "live";
  process.env.STRIPE_SECRET_KEY = "sk_live_fake_for_unit_tests";
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET_LIVE = "whsec_live_unit";
}

test("live mode: separate live account per workspace, test account untouched", async () => {
  const ws = await testWorkspace("lv1", "plus");
  const t = await ensureAccount(ws.id, { email: "o@example.com", businessName: "Shop" });
  assert.equal(t.mode, "test");
  goLive();
  assert.equal(await getAccount(ws.id), null, "the test account is invisible in live mode");
  const l = await ensureAccount(ws.id, { email: "o@example.com", businessName: "Shop" });
  assert.equal(l.mode, "live");
  assert.notEqual(l.stripeAccountId, t.stripeAccountId);
  const creates = calls.filter((c) => c.fn === "accounts.create");
  assert.equal(creates.length, 2);
  assert.equal(creates[1].opts?.idempotencyKey, `keplar-connect-acct-live-${ws.id}`);
  assert.equal((await ensureAccount(ws.id, { email: "o@example.com", businessName: "Shop" })).id, l.id, "idempotent");
  delete process.env.KEPLAR_STRIPE_MODE;
  process.env.STRIPE_SECRET_KEY = "sk_test_fake_for_unit_tests";
  assert.equal((await getAccount(ws.id))?.id, t.id, "back in test mode the test account returns");
});

test("live mode: orders and revenue are filtered by mode; order limits, currencies, fee cap, kill switch", async () => {
  process.env.KEPLAR_APPLICATION_FEE_BPS = "500";
  const { ws } = await liveStore("lv2"); // a test account + store exists
  const test1 = await startCheckout({ projectId: "prj_lv2", productId: "p1", origin: "https://keplar.one" });
  assert.equal(test1.order.livemode, false);
  goLive();
  const live0 = await testAccount(ws.id, "live");
  await connectAccounts().update(ws.id, live0.id, { status: "active", chargesEnabled: true, payoutsEnabled: true });
  const live = (await getAccount(ws.id))!;
  const { order } = await startCheckout({ projectId: "prj_lv2", productId: "p1", origin: "https://keplar.one" });
  assert.equal(order.livemode, true);
  assert.equal(order.stripeAccountId, live.stripeAccountId);
  assert.equal(calls.filter((c) => c.fn === "sessions.create").pop()?.opts?.stripeAccount, live.stripeAccountId);
  const dash = await dashboard(ws);
  assert.equal(dash.mode, "live");
  assert.equal(dash.orders.pending, 1, "only the live order is counted");
  assert.equal(dash.payments?.mode, "live");
  const { listOrders } = await import("@/lib/business/commerce");
  assert.deepEqual((await listOrders(ws.id)).map((o) => o.id), [order.id]);

  // limits
  const lim = (amount: number, currency = "usd") => createCheckoutSession(live, { orderId: "ord_l", projectId: "p", productId: "p", productName: "X", amount, currency, origin: "https://keplar.one", returnPath: "/sites/x/" });
  await assert.rejects(lim(49), (e: unknown) => e instanceof HttpError && e.code === "bad_price");
  await assert.rejects(lim(200_001), (e: unknown) => e instanceof HttpError && e.code === "bad_price");
  await assert.rejects(lim(1000, "jpy"), (e: unknown) => e instanceof HttpError && e.code === "bad_price");
  process.env.KEPLAR_MAX_ORDER_CENTS = "5000";
  await assert.rejects(lim(5001), (e: unknown) => e instanceof HttpError && e.code === "bad_price");
  assert.ok((await lim(5000)).url);
  // a test-mode account can't be used for live checkout
  await assert.rejects(createCheckoutSession({ ...live, mode: "test" }, { orderId: "ord_m", projectId: "p", productId: "p", productName: "X", amount: 1000, currency: "usd", origin: "https://keplar.one", returnPath: "/sites/x/" }), (e: unknown) => e instanceof HttpError && e.code === "payments_not_enabled");

  // kill switch: env, then admin control; refuses before any Stripe call or order row
  const before = calls.length;
  const ordersBefore = (await orders().list(ws.id)).length;
  process.env.KEPLAR_PAYMENTS_DISABLED = "1";
  await assert.rejects(startCheckout({ projectId: "prj_lv2", productId: "p1", origin: "https://keplar.one" }), (e: unknown) => e instanceof HttpError && e.code === "payments_paused" && e.status === 503);
  assert.equal((await dashboard(ws)).paymentsPaused, true);
  delete process.env.KEPLAR_PAYMENTS_DISABLED;
  await startCheckout({ projectId: "prj_lv2", productId: "p1", origin: "https://keplar.one" });
  await setControls({ pausePayments: true }, "admin@test");
  const mid = calls.length;
  await assert.rejects(startCheckout({ projectId: "prj_lv2", productId: "p1", origin: "https://keplar.one" }), (e: unknown) => e instanceof HttpError && e.code === "payments_paused");
  assert.equal(calls.length, mid, "no Stripe call while paused");
  assert.ok(before > 0 && (await orders().list(ws.id)).length === ordersBefore + 1, "only the unpaused attempt created an order");
});

const signWith = (event: ConnectEvent, secret: string) => {
  const payload = JSON.stringify(event);
  return { payload, header: new Stripe("sk_test_offline").webhooks.generateTestHeaderString({ payload, secret }) };
};
async function post(event: ConnectEvent, secret: string) {
  const { payload, header } = signWith(event, secret);
  const res = await webhookPOST(new Request("https://keplar.one/api/business/stripe/webhook", { method: "POST", headers: { "content-type": "application/json", "stripe-signature": header }, body: payload }));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

test("live mode webhook: live events applied with live secrets only; test events and mismatched accounts never mix", async () => {
  setStripeClientForTests(null); // real (offline) verifier
  goLive();
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET = "whsec_test_unit";
  const ws = await testWorkspace("lv3", "plus");
  const live = await testAccount(ws.id, "live");
  const test = await testAccount(ws.id, "test");
  const liveEv = (ev: ConnectEvent): ConnectEvent => ({ ...ev, livemode: true });

  // not configured for the mode → 503
  delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET_LIVE;
  assert.equal((await post(liveEv(fixtures.accountUpdatedV1(live.stripeAccountId)), "whsec_live_unit")).status, 503);
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET_LIVE = "whsec_live_unit,whsec_live_thin";

  // a live event signed with the TEST secret is forged → 400
  assert.equal((await post(liveEv(fixtures.accountUpdatedV1(live.stripeAccountId)), "whsec_test_unit")).status, 400);
  // account.updated (live) applies to the live account
  const acc = await post(liveEv(fixtures.accountUpdatedV1(live.stripeAccountId)), "whsec_live_unit");
  assert.equal(acc.body.result, "account_active");
  assert.equal((await getAccount(ws.id))?.stripeAccountId, live.stripeAccountId);
  assert.equal((await getAccount(ws.id))?.chargesEnabled, true);
  // duplicate delivery
  const dupe = liveEv(fixtures.accountUpdatedV1(live.stripeAccountId));
  await post(dupe, "whsec_live_unit");
  assert.equal((await post(dupe, "whsec_live_unit")).body.duplicate, true);
  // second (thin) secret also accepted
  assert.equal((await post({ ...fixtures.v2AccountEvent("acct_unknown_thin"), livemode: true }, "whsec_live_thin")).status, 200);

  // a TEST event (even correctly signed) is acknowledged but not applied in live mode
  const t = await post(fixtures.accountUpdatedV1(test.stripeAccountId), "whsec_test_unit");
  assert.equal(t.body.ignored, "test_event_in_live_mode");
  assert.equal((await connectAccounts().get(ws.id, test.id))?.chargesEnabled, false);
  // a live event naming a TEST account is ignored as a mode mismatch
  const mm = await post(liveEv(fixtures.accountUpdatedV1(test.stripeAccountId)), "whsec_live_unit");
  assert.equal(mm.body.result, "mode_mismatch");
  assert.equal((await connectAccounts().get(ws.id, test.id))?.chargesEnabled, false);

  // checkout → paid (live order), payment_intent, refund, dispute
  const project = (await liveStoreFor(ws.id, "lv3p"));
  assert.ok(project);
  const s = fixtures.checkoutSession({ amount_total: 4000, metadata: { keplar_product_name: "Poster" }, livemode: true });
  const paid = await post(liveEv(fixtures.checkoutCompleted(live.stripeAccountId, s)), "whsec_live_unit");
  assert.equal(paid.body.result, "order_paid");
  const o = (await orders().list(ws.id, (x) => x.checkoutSessionId === s.id))[0];
  assert.equal(o.livemode, true);
  assert.equal(o.status, "paid");
  const pi = s.payment_intent as string;
  const failed = await post(liveEv({ id: "evt_live_pif", object: "event", type: "payment_intent.payment_failed", account: live.stripeAccountId, data: { object: { id: "pi_x", last_payment_error: { message: "declined" } } } }), "whsec_live_unit");
  assert.equal(failed.status, 200);
  assert.equal((await post(liveEv(fixtures.chargeRefunded(live.stripeAccountId, { payment_intent: pi, amount: 4000, amount_refunded: 1000, refunded: false })), "whsec_live_unit")).body.result, "order_partially_refunded");
  const disp = await post(liveEv({ id: "evt_live_dp", object: "event", type: "charge.dispute.created", account: live.stripeAccountId, data: { object: { id: "dp_1", payment_intent: pi, amount: 4000, currency: "usd", reason: "fraudulent" } } }), "whsec_live_unit");
  assert.equal(disp.body.result, "dispute_recorded");
  const after = (await orders().get(ws.id, o.id))!;
  assert.equal(after.refundedAmount, 1000);
  assert.ok(after.disputedAt);
  const dash = await dashboard((await testWorkspace("lv3", "plus")));
  assert.equal(dash.revenue.total, 3000);
  assert.equal(dash.revenue.refunded, 1000);
  const rows = await connectEvents().list(ws.id);
  assert.ok(rows.length >= 6 && rows.filter((r) => r.livemode).length >= 6, "live events are stored flagged live");
  assert.equal(rows.filter((r) => r.type === "account.updated" && !r.livemode).length, 0, "the test event was never stored");
});

async function liveStoreFor(workspaceId: string, projectId: string) {
  const t = now();
  return projects().insert({ id: projectId, workspaceId, name: "Shop", slug: projectId, kind: "site", spec: { products: [{ id: "p1", name: "Poster", price: 4000, currency: "usd", description: "" }] }, draftVersion: 0, files: [], messages: [], liveDeployId: "dep_live", publishedAt: t, scan: null, takenDown: false, createdAt: t, updatedAt: t } as never);
}

// AZ-7 (docs/rebirth/AUDIT.md): the public form and checkout endpoints took any project id, published or not.
test("public checkout and contact forms refuse a project whose site isn't published", async () => {
  const { POST: formPOST } = await import("@/app/api/business/forms/[projectId]/route");
  const ws = await testWorkspace("az7", "plus");
  const acct = await testAccount(ws.id);
  await connectAccounts().update(ws.id, acct.id, { status: "active", chargesEnabled: true, payoutsEnabled: true });
  const t = now();
  await projects().insert({ id: "prj_az7", workspaceId: ws.id, name: "Draft shop", slug: "az7-shop", kind: "site", spec: { products: [{ id: "p1", name: "Mug", price: 2500, currency: "usd", description: "" }] }, draftVersion: 1, files: [], messages: [], liveDeployId: null, publishedAt: null, scan: null, takenDown: false, createdAt: t, updatedAt: t } as never);
  await assert.rejects(startCheckout({ projectId: "prj_az7", productId: "p1", origin: "https://keplar.one" }), (e: unknown) => e instanceof HttpError && e.status === 404 && e.code === "not_published");
  const fd = new FormData();
  fd.set("name", "Spam");
  fd.set("email", "spam@example.com");
  fd.set("message", "hello");
  const res = await formPOST(new Request("https://keplar.one/api/business/forms/prj_az7", { method: "POST", body: fd }), { params: Promise.resolve({ projectId: "prj_az7" }) });
  assert.equal(res.status, 404);
  const { contacts } = await import("@/lib/business/repo");
  assert.equal((await contacts().list(ws.id)).length, 0, "nothing reached the owner's CRM");
});
