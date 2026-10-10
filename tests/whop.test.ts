import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "@/app/api/webhooks/whop/route";
import { POST as checkoutPOST } from "@/app/api/billing/checkout/route";
import { checkoutBody, signWebhook, verifyWebhook, whopCheckoutConfigured, whopPurchaseUrl } from "@/lib/billing/whop";
import { claimFromPayment } from "@/lib/billing/sync";
import { workspaceForEmail } from "@/lib/accounts/workspaces";
import { planFromCookie, signPlanCookie, verifyPlanCookie, PLAN_COOKIE } from "@/lib/billing/plan-cookie";
import { isAdminEmail, adminDailyCapUsd } from "@/lib/billing/admin";
import { ENTITLEMENTS } from "@/lib/create/platform/plans";
import { PLAN_ALLOWANCES } from "@/lib/orchestration/plans";
import { PAID_PLANS } from "@/lib/billing/plans";
import { adminCapped, recordAdminSpend } from "@/lib/create/platform/spend";

const SECRET = "whsec_test_secret_for_keplar_whop_0123456789";
const now = () => Math.floor(Date.now() / 1000);

function signed(event: unknown, opts: { id?: string; ts?: number; secret?: string } = {}) {
  const raw = JSON.stringify(event);
  const id = opts.id ?? `msg_${Math.random().toString(36).slice(2)}`;
  const ts = opts.ts ?? now();
  return { raw, headers: { "content-type": "application/json", "webhook-id": id, "webhook-timestamp": String(ts), "webhook-signature": signWebhook(raw, id, ts, opts.secret ?? SECRET) } };
}
const post = (raw: string, headers: Record<string, string>) => POST(new Request("https://keplar.one/api/webhooks/whop", { method: "POST", headers, body: raw }));

test("webhook signature: valid, tampered, stale, wrong secret, missing headers, multiple signatures", () => {
  const raw = '{"type":"payment.succeeded"}';
  const id = "msg_1";
  const ts = now();
  const sig = signWebhook(raw, id, ts, SECRET);
  const h = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });
  const good = { "webhook-id": id, "webhook-timestamp": String(ts), "webhook-signature": sig };
  assert.equal(verifyWebhook(raw, h(good), SECRET), true);
  assert.equal(verifyWebhook(raw + " ", h(good), SECRET), false, "tampered body");
  assert.equal(verifyWebhook(raw, h(good), "other-secret"), false, "wrong secret");
  assert.equal(verifyWebhook(raw, h({ ...good, "webhook-id": "msg_2" }), SECRET), false, "wrong id");
  assert.equal(verifyWebhook(raw, h({ ...good, "webhook-timestamp": String(ts - 3600) }), SECRET), false, "stale / mismatched timestamp");
  const old = ts - 3600;
  assert.equal(verifyWebhook(raw, h({ ...good, "webhook-timestamp": String(old), "webhook-signature": signWebhook(raw, id, old, SECRET) }), SECRET), false, "correctly signed but too old (replay)");
  for (const k of Object.keys(good)) assert.equal(verifyWebhook(raw, h({ ...good, [k]: "" }), SECRET), false, `missing ${k}`);
  assert.equal(verifyWebhook(raw, h({ ...good, "webhook-signature": `v1,AAAA ${sig}` }), SECRET), true, "any matching v1 signature");
  assert.equal(verifyWebhook(raw, h({ ...good, "webhook-signature": sig.replace("v1,", "v2,") }), SECRET), false);
  assert.equal(verifyWebhook(raw, h(good), ""), false, "empty secret never verifies");
});

test("webhook route: 503 without secret, 401 on bad signature, 400 on bad JSON, ignores other events", async () => {
  const ev = { type: "payment.succeeded", data: { id: "pay_x", metadata: { email: "nobody@example.com", plan: "plus" } } };
  let s = signed(ev);
  assert.equal((await post(s.raw, s.headers)).status, 503);
  process.env.WHOP_WEBHOOK_SECRET = SECRET;
  try {
    assert.equal((await post(s.raw, { ...s.headers, "webhook-signature": "v1,AAAA" })).status, 401);
    assert.equal((await post(s.raw, {})).status, 401);
    s = signed(ev, { secret: "wrong" });
    assert.equal((await post(s.raw, s.headers)).status, 401);
    const bad = signed("x");
    assert.equal((await post("not json", { ...bad.headers, "webhook-signature": signWebhook("not json", bad.headers["webhook-id"], Number(bad.headers["webhook-timestamp"]), SECRET) })).status, 400);
    s = signed({ type: "app.installed", data: {} });
    const r = await post(s.raw, s.headers);
    assert.equal(r.status, 200);
    assert.equal(((await r.json()) as { ignored: string }).ignored, "app.installed");
  } finally {
    delete process.env.WHOP_WEBHOOK_SECRET;
  }
});

test("webhook events: payment/membership grant, deactivate/refund/dispute revoke, idempotent", async () => {
  process.env.WHOP_WEBHOOK_SECRET = SECRET;
  try {
    const email = "buyer@example.com";
    const send = async (type: string, data: Record<string, unknown>, id?: string) => {
      const s = signed({ type, data }, { id });
      const res = await post(s.raw, s.headers);
      assert.equal(res.status, 200, type);
      return (await res.json()) as { duplicate?: boolean; result?: string };
    };
    assert.equal((await workspaceForEmail(email))?.plan ?? "free", "free");

    const pay = { id: "pay_1", membership_id: "mem_1", paid_at: new Date().toISOString(), metadata: { email, plan: "plus" } };
    const r1 = await send("payment.succeeded", pay, "evt_1");
    assert.equal(r1.result, "plan=plus");
    const ws = (await workspaceForEmail(email))!;
    assert.equal(ws.plan, "plus");
    assert.equal(ws.billing.status, "active");
    assert.equal(ws.billing.subscriptionId, "mem_1");
    assert.equal((await send("payment.succeeded", pay, "evt_1")).duplicate, true, "same webhook-id is not applied twice");

    await send("membership.activated", { id: "mem_1", created_at: new Date().toISOString(), metadata: { email, plan: "pro" } });
    assert.equal((await workspaceForEmail(email))!.plan, "pro", "upgrade");

    await send("membership.deactivated", { id: "mem_1" });
    assert.equal((await workspaceForEmail(email))!.plan, "free", "deactivated → Free");

    await send("payment.succeeded", { id: "pay_2", membership_id: "mem_2", metadata: { email, plan: "pro" } });
    assert.equal((await workspaceForEmail(email))!.plan, "pro");
    await send("refund.created", { id: "ref_1", payment_id: "pay_2" });
    assert.equal((await workspaceForEmail(email))!.plan, "free", "refund → Free");

    await send("payment.succeeded", { id: "pay_3", membership_id: "mem_3", metadata: { email, plan: "plus" } });
    assert.equal((await workspaceForEmail(email))!.plan, "plus");
    await send("dispute.created", { id: "dsp_1", payment: { id: "pay_3" } });
    assert.equal((await workspaceForEmail(email))!.plan, "free", "dispute → Free");

    assert.equal((await send("payment.succeeded", { id: "pay_4", metadata: {} })).result, "no_workspace", "no email → nothing granted");
    assert.equal((await send("payment.succeeded", { id: "pay_5", metadata: { email: "x@example.com", plan: "business" } })).result, "no_workspace", "only plus/pro can be granted");
  } finally {
    delete process.env.WHOP_WEBHOOK_SECRET;
  }
});

test("checkout: body shape, prices, whop-only purchase URLs, 'opens soon' without keys", async () => {
  assert.equal(PAID_PLANS.plus.usdMonthly, 45);
  assert.equal(PAID_PLANS.pro.usdMonthly, 99);
  assert.equal(whopCheckoutConfigured(), false);
  process.env.WHOP_COMPANY_ID = "biz_test";
  try {
    const b = checkoutBody({ plan: "plus", email: " Me@Example.com ", workspaceId: "ws_1", origin: "https://keplar.one" });
    assert.equal(b.plan.company_id, "biz_test");
    assert.equal(b.plan.renewal_price, 45);
    assert.equal(b.plan.initial_price, 0, "no extra initial fee on top of the first month");
    assert.equal(b.plan.plan_type, "renewal");
    assert.equal(b.plan.billing_period, 30);
    assert.equal(b.metadata.email, "me@example.com");
    assert.equal(b.metadata.plan, "plus");
    assert.match(b.redirect_url, /^https:\/\/keplar\.one\/account\?checkout=success$/);
    assert.equal(checkoutBody({ plan: "pro", email: "a@b.co", workspaceId: "w" }).plan.renewal_price, 99);
  } finally {
    delete process.env.WHOP_COMPANY_ID;
  }
  assert.equal(whopPurchaseUrl("/checkout/ch_123/"), "https://whop.com/checkout/ch_123/");
  assert.equal(whopPurchaseUrl("https://whop.com/checkout/ch_1/"), "https://whop.com/checkout/ch_1/");
  for (const bad of ["https://evil.test/x", "http://whop.com/x", "https://whop.com.evil.test/x", "javascript:alert(1)", "//evil.test", "", null, undefined, 5]) assert.equal(whopPurchaseUrl(bad), null, String(bad));
  const res = await checkoutPOST(new Request("https://keplar.one/api/billing/checkout", { method: "POST", headers: { "content-type": "application/json", origin: "https://keplar.one" }, body: JSON.stringify({ plan: "plus" }) }));
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { configured: false, error: "Checkout opens soon." });
  const cross = await checkoutPOST(new Request("https://keplar.one/api/billing/checkout", { method: "POST", headers: { origin: "https://evil.test" }, body: "{}" }));
  assert.equal(cross.status, 403);
});

test("claimFromPayment only trusts a paid payment whose metadata matches the email", () => {
  const p = { status: "paid", paid_at: new Date().toISOString(), metadata: { email: "a@b.co", plan: "pro" }, membership: { id: "mem_1", status: "active" } };
  assert.equal(claimFromPayment(p, "A@b.co")?.plan, "pro");
  assert.equal(claimFromPayment(p, "other@b.co"), null);
  assert.equal(claimFromPayment({ ...p, status: "open" }, "a@b.co"), null);
  assert.equal(claimFromPayment({ ...p, membership: { id: "m", status: "canceled" } }, "a@b.co"), null);
  assert.equal(claimFromPayment({ ...p, metadata: { email: "a@b.co", plan: "business" } }, "a@b.co"), null);
  assert.equal(claimFromPayment({ ...p, paid_at: "2020-01-01T00:00:00Z" }, "a@b.co"), null, "expired period");
});

test("plan cookie: round trip, tamper, wrong email, expiry, bad plan", () => {
  const claim = { plan: "pro" as const, periodStart: new Date().toISOString(), periodEnd: new Date(Date.now() + 20 * 864e5).toISOString(), manageUrl: "https://whop.com/@me/orders/x/" };
  const { value, maxAgeSec } = signPlanCookie("Me@Example.com", claim);
  assert.ok(maxAgeSec > 20 * 86400 && maxAgeSec <= 40 * 86400);
  assert.equal(verifyPlanCookie(value, "me@example.com")?.plan, "pro");
  assert.equal(verifyPlanCookie(value, "other@example.com"), null, "bound to the email");
  const [body, sig] = value.split(".");
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), p: "business", e: "me@example.com" })).toString("base64url");
  assert.equal(verifyPlanCookie(`${forged}.${sig}`, "me@example.com"), null, "tampered payload");
  assert.equal(verifyPlanCookie(`${body}.${sig.slice(0, -2)}AA`, "me@example.com"), null, "tampered signature");
  assert.equal(verifyPlanCookie(value, "me@example.com", "another-secret"), null, "other key");
  assert.equal(verifyPlanCookie(value, "me@example.com", undefined, Date.now() + 60 * 864e5), null, "expired");
  assert.equal(verifyPlanCookie("", "me@example.com"), null);
  assert.equal(planFromCookie(`a=b; ${PLAN_COOKIE}=${value}`, "me@example.com")?.plan, "pro");
  assert.equal(planFromCookie(`${PLAN_COOKIE}=${value}`, null), null);
  const evil = signPlanCookie("me@example.com", { ...claim, manageUrl: "https://evil.test/x" });
  assert.equal(verifyPlanCookie(evil.value, "me@example.com")?.manageUrl, null, "manage links are Whop-only");
});

test("credits: Free unlimited on free models, Plus 6000, Pro 13500, admin unlimited with a $25/day cap", async () => {
  assert.equal(PLAN_ALLOWANCES.free.monthlyUnits, null);
  assert.equal(PLAN_ALLOWANCES.free.models, "free-only");
  assert.equal(ENTITLEMENTS.free.monthlyUnits, Infinity);
  assert.equal(ENTITLEMENTS.plus.monthlyUnits, 6000);
  assert.equal(ENTITLEMENTS.pro.monthlyUnits, 13500);
  assert.equal(isAdminEmail("team@keplar.one"), true);
  assert.equal(isAdminEmail(" TEAM@keplar.one "), true);
  assert.equal(isAdminEmail("someone@keplar.one"), false);
  assert.equal(isAdminEmail(null), false);
  assert.equal(adminDailyCapUsd(), 25);
  assert.equal(await adminCapped(), false);
  await recordAdminSpend(24.99);
  assert.equal(await adminCapped(), false);
  await recordAdminSpend(0.02);
  assert.equal(await adminCapped(), true);
});

/* ───────────────────────── embedded checkout ───────────────────────── */
import { DEFAULT_WHOP_PLAN_IDS, embedPlanId, planForWhopPlanId } from "@/lib/billing/plans";
import { embedMetadata, signEmbedRef, verifyEmbedRef } from "@/lib/billing/embed";
import { checkoutAvailable } from "@/lib/billing/whop";

test("embedded checkout: default plan ids, env override, bad ids rejected, plan id → tier", () => {
  assert.equal(DEFAULT_WHOP_PLAN_IDS.plus, "plan_wd9Xs4iDlwvDi");
  assert.equal(DEFAULT_WHOP_PLAN_IDS.pro, "plan_M6ztgSJDucMJA");
  assert.equal(embedPlanId("plus"), "plan_wd9Xs4iDlwvDi");
  assert.equal(embedPlanId("pro"), "plan_M6ztgSJDucMJA");
  assert.equal(planForWhopPlanId("plan_wd9xs4iDlwvDi"), "plus");
  assert.equal(planForWhopPlanId("plan_M6ztgSJDucMJA"), "pro");
  assert.equal(planForWhopPlanId("plan_unknown12345"), null);
  assert.equal(planForWhopPlanId(undefined), null);
  assert.equal(checkoutAvailable(), true, "embedded plan ids alone make checkout available");
  process.env.WHOP_PLAN_ID_PRO = "plan_overrideABC123";
  process.env.WHOP_PLAN_ID_PLUS = "not a plan id";
  try {
    assert.equal(embedPlanId("pro"), "plan_overrideABC123");
    assert.equal(planForWhopPlanId("plan_overrideABC123"), "pro");
    assert.equal(planForWhopPlanId("plan_M6ztgSJDucMJA"), null, "the old default no longer maps once overridden");
    assert.equal(embedPlanId("plus"), null, "a malformed id is ignored → hosted fallback");
  } finally {
    delete process.env.WHOP_PLAN_ID_PRO;
    delete process.env.WHOP_PLAN_ID_PLUS;
  }
});

test("embed ref: signed email round-trips, tampering and other formats are rejected", () => {
  const ref = signEmbedRef(" Buyer@Example.com ");
  assert.equal(verifyEmbedRef(ref), "buyer@example.com");
  const [b, sig] = ref.split(".");
  const forged = `${Buffer.from("victim@example.com").toString("base64url")}.${sig}`;
  assert.equal(verifyEmbedRef(forged), null, "swapping the email invalidates the signature");
  assert.equal(verifyEmbedRef(`${b}.AAAA`), null);
  for (const bad of ["", "x", "a.b.c", null, undefined, 5, "x".repeat(500)]) assert.equal(verifyEmbedRef(bad), null, String(bad));
  const md = embedMetadata({ email: "A@B.co", plan: "plus", workspaceId: "ws_1" });
  assert.equal(md.source, "keplar-embed");
  assert.ok(Object.values(md).every((v) => typeof v === "string"), "Whop metadata values are strings");
  assert.equal(verifyEmbedRef(md.keplar_ref), "a@b.co");
});

test("embedded payments: webhook matches the account by signed email, tier from the Whop plan id, idempotent", async () => {
  process.env.WHOP_WEBHOOK_SECRET = SECRET;
  try {
    const send = async (type: string, data: Record<string, unknown>, id?: string) => {
      const s = signed({ type, data }, { id });
      const res = await post(s.raw, s.headers);
      assert.equal(res.status, 200);
      return (await res.json()) as { duplicate?: boolean; result?: string };
    };
    const email = `embed-${Date.now()}@example.com`;
    const md = embedMetadata({ email, plan: "plus", workspaceId: "ws_x" });
    // A buyer who edits the browser-side metadata to ask for Pro still gets what the Whop plan sells.
    const r1 = await send("payment.succeeded", { id: "pay_e1", plan_id: "plan_wd9xs4iDlwvDi", membership_id: "mem_e1", metadata: { ...md, plan: "pro" } }, "msg_embed_1");
    assert.equal(r1.result, "plan=plus");
    assert.equal((await workspaceForEmail(email))!.plan, "plus");
    const dup = await send("payment.succeeded", { id: "pay_e1", plan_id: "plan_wd9xs4iDlwvDi", membership_id: "mem_e1", metadata: md }, "msg_embed_1");
    assert.equal(dup.duplicate, true, "same webhook-id is a no-op");
    // Upgrade to Pro through the embed.
    const r2 = await send("membership.activated", { id: "mem_e2", plan_id: "plan_M6ztgSJDucMJA", metadata: embedMetadata({ email, plan: "pro", workspaceId: "ws_x" }) });
    assert.equal(r2.result, "plan=pro");
    assert.equal((await workspaceForEmail(email))!.plan, "pro");
    // Forged email in the browser metadata (no valid signature) must not upgrade anyone.
    const victim = `victim-${Date.now()}@example.com`;
    const forged = await send("payment.succeeded", { id: "pay_e3", plan_id: "plan_M6ztgSJDucMJA", metadata: { email: victim, plan: "pro", source: "keplar-embed", keplar_ref: "bogus.bogus" } });
    assert.equal(forged.result, "no_workspace");
    assert.equal(await workspaceForEmail(victim), null);
    const unsigned = await send("payment.succeeded", { id: "pay_e4", plan_id: "plan_M6ztgSJDucMJA", metadata: { email: victim, plan: "pro", source: "keplar-embed" } });
    assert.equal(unsigned.result, "no_workspace");
    assert.equal(await workspaceForEmail(victim), null);
    // Without metadata at all, the buyer's own Whop email is the fallback.
    const own = `own-${Date.now()}@example.com`;
    const r5 = await send("payment.succeeded", { id: "pay_e5", plan_id: "plan_wd9xs4iDlwvDi", user: { email: own }, metadata: {} });
    assert.equal(r5.result, "plan=plus");
    assert.equal((await workspaceForEmail(own))!.plan, "plus");
    // Refunds still revoke.
    await send("refund.created", { payment: { id: "pay_e5" } });
    assert.equal((await workspaceForEmail(own))!.plan, "free");
  } finally {
    delete process.env.WHOP_WEBHOOK_SECRET;
  }
});

test("claimFromPayment (Refresh plan) accepts embedded payments by signed email + plan id", () => {
  const email = "claim@example.com";
  const base = { status: "paid", paid_at: new Date().toISOString(), membership: { id: "mem_c", status: "active" } };
  const md = embedMetadata({ email, plan: "plus", workspaceId: "w" });
  assert.equal(claimFromPayment({ ...base, plan: { id: "plan_M6ztgSJDucMJA" }, metadata: md }, email)?.plan, "pro");
  assert.equal(claimFromPayment({ ...base, plan: { id: "plan_wd9xs4iDlwvDi" }, metadata: md }, email)?.plan, "plus");
  assert.equal(claimFromPayment({ ...base, plan: { id: "plan_wd9xs4iDlwvDi" }, metadata: md }, "other@example.com"), null, "someone else's email");
  assert.equal(claimFromPayment({ ...base, plan: { id: "plan_wd9xs4iDlwvDi" }, metadata: { ...md, keplar_ref: "x.y" } }, email), null, "bad signature");
  assert.equal(claimFromPayment({ ...base, plan: { id: "plan_nope0000000" }, metadata: { ...md, plan: "business" } }, email), null, "unknown plan");
});
