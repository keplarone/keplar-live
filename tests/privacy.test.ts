import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { collection } from "../src/lib/create/platform/store";
import { activeSubscription, deleteWorkspaceData, exportChunks, isRetained, redact, USER_COLLECTIONS } from "../src/lib/privacy/account-data";

const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });

test("every collection in the code is classified as user data or retained (so none is silently kept or exported)", () => {
  const names = new Set<string>();
  for (const f of walk("src").filter((x) => /\.tsx?$/.test(x))) {
    for (const m of readFileSync(f, "utf8").matchAll(/collection(?:<[^>]*>)?\(\s*"([a-z_0-9]+)"\s*\)/g)) names.add(m[1]);
  }
  names.add("chat_digests"); // defined via a COLLECTION constant in memory/digest.ts
  const unclassified = [...names].filter((n) => !isRetained(n) && !(USER_COLLECTIONS as readonly string[]).includes(n));
  assert.deepEqual(unclassified, [], "classify new collections in src/lib/privacy/account-data.ts");
});

test("redact hides secret-looking fields at any depth", () => {
  const r = redact({ a: 1, accessToken: "t", nested: { api_key: "k", ok: "x", list: [{ password: "p", fine: 2 }] } }) as Record<string, unknown>;
  assert.equal(r.accessToken, "[redacted]");
  assert.equal((r.nested as Record<string, unknown>).api_key, "[redacted]");
  assert.equal(JSON.stringify(r).includes('"t"'), false);
  assert.equal(JSON.stringify(r).includes('"p"'), false);
  assert.equal(r.a, 1);
});

test("export contains the account's rows and none of another account's; delete removes user data but keeps payment/usage records", async () => {
  const mine = "ws_privacy_a";
  const other = "ws_privacy_b";
  await collection<{ id: string; workspaceId: string; title: string }>("chat_threads").insert({ id: "t1", workspaceId: mine, title: "my private chat" });
  await collection<{ id: string; workspaceId: string; title: string }>("chat_threads").insert({ id: "t2", workspaceId: other, title: "someone else" });
  await collection<{ id: string; workspaceId: string; accessToken: string }>("biz_connections").insert({ id: "c1", workspaceId: mine, accessToken: "SECRET-TOKEN" });
  await collection<{ id: string; workspaceId: string; usd: number }>("whop_payments").insert({ id: "p1", workspaceId: mine, usd: 20 });

  let text = "";
  for await (const piece of exportChunks(mine, { id: "u1", email: "a@example.com", name: "A" })) text += piece;
  const data = JSON.parse(text) as { collections: Record<string, unknown[]>; account: { email: string } };
  assert.equal(data.account.email, "a@example.com");
  assert.ok(JSON.stringify(data).includes("my private chat"));
  assert.equal(JSON.stringify(data).includes("someone else"), false);
  assert.equal(JSON.stringify(data).includes("SECRET-TOKEN"), false);

  const res = await deleteWorkspaceData(mine);
  assert.ok(res.deleted >= 2);
  assert.equal((await collection<{ id: string; workspaceId: string }>("chat_threads").list(mine)).length, 0);
  assert.equal((await collection<{ id: string; workspaceId: string }>("biz_connections").list(mine)).length, 0);
  assert.equal((await collection<{ id: string; workspaceId: string }>("chat_threads").list(other)).length, 1, "other account untouched");
  assert.equal((await collection<{ id: string; workspaceId: string }>("whop_payments").list(mine)).length, 1, "payment record retained");
});

test("an active paid subscription blocks deletion until cancelled; one ending at period end does not", () => {
  assert.equal(activeSubscription({ status: "active", subscriptionId: "mem_1", cancelAtPeriodEnd: false }), true);
  assert.equal(activeSubscription({ status: "past_due", subscriptionId: "mem_1", cancelAtPeriodEnd: false }), true);
  assert.equal(activeSubscription({ status: "active", subscriptionId: "mem_1", cancelAtPeriodEnd: true }), false);
  assert.equal(activeSubscription({ status: "canceled", subscriptionId: "mem_1", cancelAtPeriodEnd: false }), false);
  assert.equal(activeSubscription({ status: "none", subscriptionId: null, cancelAtPeriodEnd: false }), false);
});

test("Business content is exported and deleted only for the owning workspace", async () => {
  const names = ["business_accounts", "business_reports", "business_layouts", "business_tasks", "business_summaries"];
  for (const name of names) {
    const rows = collection<{ id: string; workspaceId: string; title: string }>(name);
    await rows.insert({ id: "mine", workspaceId: "business_owner", title: "My business data" });
    await rows.insert({ id: "other", workspaceId: "business_other", title: "Private to another business" });
  }
  let text = "";
  for await (const part of exportChunks("business_owner", { id: "owner", email: "owner@example.com", name: "Owner" })) text += part;
  const data = JSON.parse(text) as { collections: Record<string, { id: string }[]> };
  for (const name of names) assert.deepEqual(data.collections[name].map((row) => row.id), ["mine"]);
  await deleteWorkspaceData("business_owner");
  for (const name of names) {
    const rows = collection<{ id: string; workspaceId: string }>(name);
    assert.deepEqual(await rows.list("business_owner"), []);
    assert.equal((await rows.list("business_other")).length, 1);
  }
});

test("delete route is guarded: same-origin, typed email, admin and subscription refusals", () => {
  const src = readFileSync("src/app/api/account/delete/route.ts", "utf8");
  for (const needle of ["assertSameOrigin", "requireAccount", "confirm_mismatch", "admin_protected", "subscription_active", "limitRequest"]) assert.ok(src.includes(needle), needle);
});
