import "./setup";
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { signIn } from "./helpers/session";
import { featureSite, getPage, hidden, postFeature } from "./helpers/feature-site";
import { testAccount } from "./helpers/workspace";
import { setStripeClientForTests } from "@/lib/billing/stripe";
import { updateWorkspace } from "@/lib/accounts/workspaces";
import { connectAccounts, orders } from "@/lib/business/repo";
import { getAccount } from "@/lib/business/stripe";
import { handleConnectEvent, fetchV2Account } from "@/lib/business/connect-webhook";
import { setControls } from "@/lib/ops/controls";
import { currencyOf, parseProducts } from "@/lib/site-builder/features/checkout";
import { listOrders } from "@/lib/business/commerce";
import { issueToken } from "@/lib/site-builder/features/spam";
import { fixtures } from "./helpers/connect-fixtures";

type Call = { params: Record<string, unknown>; opts: Record<string, unknown> };
let calls: Call[] = [];
const fake = () => ({ checkout: { sessions: { create: async (params: Record<string, unknown>, opts: Record<string, unknown>) => { calls.push({ params, opts }); return { id: `cs_test_${calls.length}`, url: "https://checkout.stripe.com/c/pay/cs_test_x" }; } } } });
const KEYS = ["STRIPE_SECRET_KEY", "STRIPE_CONNECT_WEBHOOK_SECRET", "KEPLAR_STRIPE_MODE"] as const;
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of KEYS) saved[k] = process.env[k];
  calls = [];
  process.env.STRIPE_SECRET_KEY = "sk_test_fake_for_unit_tests";
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET = "whsec_unit";
  delete process.env.KEPLAR_STRIPE_MODE;
  setStripeClientForTests(fake());
});
afterEach(async () => {
  setStripeClientForTests(null);
  await setControls({ pausePayments: false }, "test");
  for (const k of KEYS) saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]);
});

const SHOP = '<div data-k-feature="checkout" data-k-id="shop" data-k-title="Our loaves" data-k-currency="usd" data-k-products="Sourdough loaf;7.00;Baked daily|Rye loaf;8.50"></div>';

async function shop(email: string, opts: { plan?: "free" | "plus"; connected?: boolean } = {}) {
  const { cookie, workspaceId } = await signIn(email);
  if (opts.plan !== "free") await updateWorkspace(workspaceId, { plan: "plus", billing: { status: "active", periodEnd: new Date(Date.now() + 20 * 864e5).toISOString() } });
  const acct = await testAccount(workspaceId);
  if (opts.connected !== false) await connectAccounts().update(workspaceId, acct.id, { status: "active", chargesEnabled: true, payoutsEnabled: true });
  const s = await featureSite(cookie, workspaceId, "Mill Lane", { "index.html": `<h1>Shop</h1>${SHOP}` });
  return { workspaceId, cookie, ...s };
}
const draw = async (slug: string) => (await getPage(slug)).text();

test("products parse strictly: prices, ids, limits, bad rows dropped", () => {
  const p = parseProducts("Sourdough loaf;7.00;Baked daily|Rye;8.5|Free thing;0|Cheap;0.10|No price|Sourdough loaf;9");
  assert.deepEqual(p.map((x) => [x.id, x.price]), [["sourdough-loaf", 700], ["rye", 850], ["sourdough-loaf-2", 900]]);
  assert.equal(parseProducts(Array.from({ length: 30 }, (_, i) => `P${i};5`).join("|")).length, 12);
  assert.equal(currencyOf({ currency: "JPY" }), "usd");
  assert.equal(currencyOf({ currency: "eur" }), "eur");
});

test("payments not set up: honest 'not available' buttons and a refused purchase, no Stripe call", async () => {
  const t = await shop("co-off@example.com", { connected: false });
  const html = await draw(t.slug);
  assert.match(html, /Our loaves/);
  assert.match(html, /Sourdough loaf/);
  assert.match(html, /\$7\.00/);
  assert.match(html, /Online ordering isn&#39;t switched on yet/);
  assert.doesNotMatch(html, /_f\/checkout/);
  assert.match(html, /disabled>Not available yet/);
  // a hand-made post with a valid token is still refused
  const r = await postFeature(t.slug, "checkout", { _id: "shop", _t: issueToken(t.id, Date.now() - 5000), product: "rye-loaf", qty: "1" });
  assert.equal(r.status, 409);
  assert.equal(calls.length, 0);
});

test("Free plan never sells, even with a connected account", async () => {
  const t = await shop("co-free@example.com", { plan: "free" });
  assert.doesNotMatch(await draw(t.slug), /_f\/checkout/);
});

test("a purchase: price from the page, direct charge on the owner's account, order pending until Stripe's webhook, then paid in the dashboard", async () => {
  const t = await shop("co-ok@example.com");
  const html = await draw(t.slug);
  assert.match(html, /Test mode: no real money moves/);
  assert.equal(html.match(/action="[^"]*\/_f\/checkout"/g)?.length, 2);
  await new Promise((r) => setTimeout(r, 1700));
  const base = { _id: "shop", _page: "index.html", _t: hidden(html, "_t") };
  // the form can't change the price, the product id must exist, the quantity is capped
  assert.equal((await postFeature(t.slug, "checkout", { ...base, product: "nope", qty: "1" })).status, 404);
  assert.equal((await postFeature(t.slug, "checkout", { ...base, product: "rye-loaf", qty: "11" })).status, 400);
  assert.equal((await postFeature(t.slug, "checkout", { ...base, product: "rye-loaf", qty: "0" })).status, 400);
  assert.equal(calls.length, 0);
  const res = await postFeature(t.slug, "checkout", { ...base, product: "rye-loaf", qty: "3", price: "1" });
  assert.equal(res.status, 200);
  const page = await res.text();
  assert.match(page, /href="https:\/\/checkout\.stripe\.com\/c\/pay\/cs_test_x"/);
  assert.match(res.headers.get("refresh") ?? "", /^0; url=https:\/\/checkout\.stripe\.com/);
  const acct = (await getAccount(t.workspaceId))!;
  assert.equal(calls.length, 1);
  const p = calls[0].params as { line_items: { price_data: { unit_amount: number; currency: string } }[]; success_url: string; cancel_url: string; metadata: Record<string, string> };
  assert.equal(p.line_items[0].price_data.unit_amount, 2550, "8.50 x 3, not the 1 the form sent");
  assert.equal(p.line_items[0].price_data.currency, "usd");
  assert.equal(calls[0].opts.stripeAccount, acct.stripeAccountId);
  assert.equal(p.metadata.keplar_project_id, t.id);
  const [order] = await orders().list(t.workspaceId, (o) => o.projectId === t.id);
  assert.equal(order.status, "pending");
  assert.equal(order.amount, 2550);
  assert.match(order.productName, /Rye loaf × 3 · Mill Lane/);
  assert.match(p.success_url, new RegExp(`/s/${t.slug}/_thanks\\?f=checkout&o=${order.id}&checkout=success$`));

  // coming back from Stripe is not proof of payment
  const q = `?f=checkout&o=${order.id}&checkout=success`;
  assert.match(await (await getPage(t.slug, ["_thanks"], q)).text(), /confirming your payment/);
  assert.match(await (await getPage(t.slug, ["_thanks"], `?f=checkout&o=${order.id}&checkout=cancelled`)).text(), /Nothing was charged/);
  assert.equal((await listOrders(t.workspaceId)).find((o) => o.id === order.id)?.status, "pending");

  // only the signed webhook marks it paid
  const done = fixtures.checkoutCompleted(acct.stripeAccountId, fixtures.checkoutSession({ id: order.checkoutSessionId, amount_total: 2550, payment_intent: "pi_site1" }));
  assert.equal((await handleConnectEvent(done, { fetchV2Account })).result, "order_paid");
  const paid = (await listOrders(t.workspaceId)).find((o) => o.id === order.id)!;
  assert.equal(paid.status, "paid");
  assert.match(await (await getPage(t.slug, ["_thanks"], q)).text(), /Payment received/);

  // the owner sees it in the Features panel, with the honest state
  const route = await import("@/app/api/sites/[id]/features/route");
  const { call } = await import("./helpers/session");
  const view = (await (await route.GET(call(t.cookie, `/api/sites/${t.id}/features`), { params: Promise.resolve({ id: t.id }) })).json()) as { payments: { ready: boolean; mode: string; orders: { status: string; amount: number }[] } };
  assert.deepEqual([view.payments.ready, view.payments.mode], [true, "test"]);
  assert.deepEqual(view.payments.orders.map((o) => [o.status, o.amount]), [["paid", 2550]]);
});

test("kill switch and missing connection stop a purchase; another site's order id says nothing", async () => {
  const a = await shop("co-iso-a@example.com");
  const b = await shop("co-iso-b@example.com");
  const html = await draw(a.slug);
  await new Promise((r) => setTimeout(r, 1700));
  await setControls({ pausePayments: true }, "test");
  assert.match(await draw(a.slug), /paused for a moment/);
  const paused = await postFeature(a.slug, "checkout", { _id: "shop", _t: hidden(html, "_t"), product: "rye-loaf", qty: "1" });
  assert.equal(paused.status, 409);
  assert.equal(calls.length, 0);
  await setControls({ pausePayments: false }, "test");
  // an order of site B, asked for through site A's thanks page, is not shown as paid there
  const hb = await draw(b.slug);
  await new Promise((r) => setTimeout(r, 1700));
  await postFeature(b.slug, "checkout", { _id: "shop", _t: hidden(hb, "_t"), product: "rye-loaf", qty: "1" });
  const [ob] = await orders().list(b.workspaceId, (o) => o.projectId === b.id);
  await orders().update(b.workspaceId, ob.id, { status: "paid" });
  const leak = await (await getPage(a.slug, ["_thanks"], `?f=checkout&o=${ob.id}`)).text();
  assert.doesNotMatch(leak, /Payment received/);
  // and A's dashboard has no orders of B
  assert.equal((await listOrders(a.workspaceId)).some((o) => o.projectId === b.id), false);
});
