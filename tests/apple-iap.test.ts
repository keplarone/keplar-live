import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NotificationTypeV2 } from "@apple/app-store-server-library";
import {
  APPLE_PRODUCT_IDS,
  appleIapConfigured,
  appleBundleId,
  decodedFromFixture,
  planForAppleProductId,
  appleProductIdForPlan,
} from "@/lib/billing/apple";
import { POST as appleWebhookPOST, GET as appleWebhookGET } from "@/app/api/webhooks/apple/route";
import { applyDecodedAppleEvent, appAccountTokenForWorkspace } from "@/lib/billing/apple-sync";
import { ensureWorkspaceForUser, getWorkspace } from "@/lib/accounts/workspaces";

test("product ids map Plus $45 / Pro $99 and reject unknown SKUs", () => {
  assert.equal(APPLE_PRODUCT_IDS.plus, "one.keplar.plus.monthly");
  assert.equal(APPLE_PRODUCT_IDS.pro, "one.keplar.pro.monthly");
  assert.equal(planForAppleProductId("one.keplar.plus.monthly"), "plus");
  assert.equal(planForAppleProductId("one.keplar.pro.monthly"), "pro");
  assert.equal(planForAppleProductId("one.keplar.lite.monthly"), null);
  assert.equal(appleProductIdForPlan("plus"), "one.keplar.plus.monthly");
});

test("appleIapConfigured is false until APPLE_BUNDLE_ID / APPLE_IAP_ENABLED", () => {
  delete process.env.APPLE_BUNDLE_ID;
  delete process.env.APPLE_IAP_ENABLED;
  assert.equal(appleIapConfigured(), false);
  assert.equal(appleBundleId(), null);
  process.env.APPLE_IAP_ENABLED = "1";
  assert.equal(appleIapConfigured(), true);
  assert.equal(appleBundleId(), "one.keplar.app");
  delete process.env.APPLE_IAP_ENABLED;
  process.env.APPLE_BUNDLE_ID = "one.keplar.app";
  assert.equal(appleIapConfigured(), true);
  delete process.env.APPLE_BUNDLE_ID;
});

test("ASN endpoint returns 503 when not configured (safe empty deploy)", async () => {
  delete process.env.APPLE_BUNDLE_ID;
  delete process.env.APPLE_IAP_ENABLED;
  const res = await appleWebhookPOST(
    new Request("https://keplar.one/api/webhooks/apple", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signedPayload: "a.b.c" }),
    }),
  );
  assert.equal(res.status, 503);
  const body = (await res.json()) as { code?: string };
  assert.equal(body.code, "apple_iap_not_configured");
  const probe = await appleWebhookGET();
  assert.equal(probe.status, 200);
  assert.equal(((await probe.json()) as { configured: boolean }).configured, false);
});

test("ASN endpoint rejects malformed signedPayload when configured", async () => {
  process.env.APPLE_BUNDLE_ID = "one.keplar.app";
  const res = await appleWebhookPOST(
    new Request("https://keplar.one/api/webhooks/apple", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signedPayload: "not-a-jws" }),
    }),
  );
  assert.equal(res.status, 400);
  delete process.env.APPLE_BUNDLE_ID;
});

test("fixture transaction decodes to Plus and grants via applyDecodedAppleEvent", async () => {
  const fx = JSON.parse(readFileSync(join(process.cwd(), "tests/fixtures/apple/decoded-transaction.json"), "utf8")) as {
    transactionId: string;
    originalTransactionId: string;
    productId: string;
    bundleId: string;
    environment: string;
    purchaseDateMs: number;
  };
  const decoded = decodedFromFixture({ ...fx, expiresDateMs: Date.now() + 30 * 864e5 });
  assert.ok(decoded);
  assert.equal(decoded!.plan, "plus");

  const ws = await ensureWorkspaceForUser({ id: "user_apple_fixture_1", email: "apple-fixture@example.com", name: "Apple" });
  const token = appAccountTokenForWorkspace(ws.id);
  assert.match(token, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

  const r1 = await applyDecodedAppleEvent({
    notificationUUID: "notif_fixture_sub_1",
    type: NotificationTypeV2.SUBSCRIBED,
    workspace: ws,
    decoded: { ...decoded!, appAccountToken: token },
  });
  assert.equal(r1.result, "plan=plus");
  assert.equal((await getWorkspace(ws.id))!.plan, "plus");

  // idempotent
  const r2 = await applyDecodedAppleEvent({
    notificationUUID: "notif_fixture_sub_1",
    type: NotificationTypeV2.SUBSCRIBED,
    workspace: ws,
    decoded: { ...decoded!, appAccountToken: token },
  });
  assert.equal(r2.result, "plan=plus");

  const expired = await applyDecodedAppleEvent({
    notificationUUID: "notif_fixture_exp_1",
    type: NotificationTypeV2.EXPIRED,
    workspace: (await getWorkspace(ws.id))!,
    decoded: { ...decoded!, appAccountToken: token },
  });
  assert.equal(expired.result, "plan=free:expired");
  assert.equal((await getWorkspace(ws.id))!.plan, "free");
});

test("Pro product grant and refund revoke", async () => {
  const decoded = decodedFromFixture({
    transactionId: "2000000999",
    originalTransactionId: "2000000999",
    productId: "one.keplar.pro.monthly",
    purchaseDateMs: Date.now(),
    expiresDateMs: Date.now() + 30 * 864e5,
  });
  assert.equal(decoded!.plan, "pro");
  const ws = await ensureWorkspaceForUser({ id: "user_apple_fixture_pro", email: "apple-pro@example.com" });
  await applyDecodedAppleEvent({
    notificationUUID: "notif_pro_1",
    type: NotificationTypeV2.DID_RENEW,
    workspace: ws,
    decoded: decoded!,
  });
  assert.equal((await getWorkspace(ws.id))!.plan, "pro");
  await applyDecodedAppleEvent({
    notificationUUID: "notif_pro_refund",
    type: NotificationTypeV2.REFUND,
    workspace: (await getWorkspace(ws.id))!,
    decoded: decoded!,
  });
  assert.equal((await getWorkspace(ws.id))!.plan, "free");
  assert.equal((await getWorkspace(ws.id))!.billing.status, "unpaid");
});

test("Apple sandbox purchases never grant a paid plan on the live site, except for listed testers", async () => {
  const { appleEnvironmentAllowed } = await import("../src/lib/billing/apple");
  const live = { VERCEL_ENV: "production", APPLE_SANDBOX_TESTERS: "Review@apple.example, qa@keplar.one" };
  assert.equal(appleEnvironmentAllowed("Production", "a@b.c", live), true);
  assert.equal(appleEnvironmentAllowed("Sandbox", "a@b.c", live), false);
  assert.equal(appleEnvironmentAllowed("Sandbox", "review@apple.example", live), true);
  assert.equal(appleEnvironmentAllowed("Xcode", null, live), false);
  // Previews and local development keep accepting sandbox purchases.
  assert.equal(appleEnvironmentAllowed("Sandbox", "a@b.c", { VERCEL_ENV: "preview" }), true);
  assert.equal(appleEnvironmentAllowed("Sandbox", "a@b.c", {}), true);
});
