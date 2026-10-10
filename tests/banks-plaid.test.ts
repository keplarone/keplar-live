import "./setup";
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { testWorkspace } from "./helpers/workspace";
import { completeLinks, listBanks, plaidConfigured, removeBank, startLink } from "../src/lib/business/plaid";
import { bankItems, orders, pageViews } from "../src/lib/business/repo";
import { dashboard } from "../src/lib/business/dashboard";
import { id, now } from "../src/lib/create/platform/ids";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.PLAID_CLIENT_ID;
  delete process.env.PLAID_SECRET;
  delete process.env.PLAID_ENV;
});
type Call = { url: string; body: Record<string, unknown> };
function net(routes: Record<string, (b: Record<string, unknown>) => { status?: number; json: unknown }>) {
  const calls: Call[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    calls.push({ url, body });
    const k = Object.keys(routes).find((x) => url.includes(x));
    const r = k ? routes[k](body) : { status: 404, json: { error_message: "unrouted" } };
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200 });
  }) as typeof fetch;
  return calls;
}
const keys = () => { process.env.PLAID_CLIENT_ID = "cid_123"; process.env.PLAID_SECRET = "plaid-secret-value"; };

test("banks: Not configured without keys; names the env vars; no network call", async () => {
  const ws = await testWorkspace("bank-nc");
  const calls = net({});
  assert.equal(plaidConfigured(), false);
  await assert.rejects(startLink(ws.id), (e: { code?: string; message: string }) => e.code === "not_configured" && /PLAID_CLIENT_ID and PLAID_SECRET/.test(e.message));
  const l = await listBanks(ws.id, true);
  assert.deepEqual([l.configured, l.needsEnv, l.items], [false, ["PLAID_CLIENT_ID", "PLAID_SECRET"], []]);
  assert.equal(calls.length, 0);
});

test("banks: hosted link start -> finish -> encrypted token -> read-only balances and transactions -> disconnect", async () => {
  keys();
  const ws = await testWorkspace("bank-flow");
  let finished = false;
  const calls = net({
    "/link/token/create": () => ({ json: { link_token: "link-sandbox-abc", hosted_link_url: "https://secure.plaid.com/hl/xyz" } }),
    "/link/token/get": () => ({ json: { link_sessions: finished ? [{ results: { item_add_results: [{ public_token: "public-sandbox-1", institution: { name: "First Platypus Bank" } }] } }] : [{}] } }),
    "/item/public_token/exchange": () => ({ json: { access_token: "access-sandbox-SECRET", item_id: "it1" } }),
    "/accounts/balance/get": () => ({ json: { accounts: [{ account_id: "a1", name: "Plaid Checking", mask: "0000", type: "depository", subtype: "checking", balances: { available: 100, current: 110, iso_currency_code: "USD" } }] } }),
    "/transactions/sync": () => ({ json: { added: [{ transaction_id: "t1", account_id: "a1", name: "Coffee", amount: 4.5, iso_currency_code: "USD", date: "2026-10-01", pending: false }, { transaction_id: "t2", account_id: "a1", name: "Payroll", amount: -2000, date: "2026-10-02", pending: false }] } }),
    "/item/remove": () => ({ json: { request_id: "r" } }),
  });
  const { url } = await startLink(ws.id);
  assert.equal(url, "https://secure.plaid.com/hl/xyz");
  assert.match(calls[0].url, /^https:\/\/sandbox\.plaid\.com\//, "sandbox by default");
  assert.equal(calls[0].body.client_id, "cid_123");
  assert.deepEqual(calls[0].body.products, ["transactions"]);
  assert.match(String((calls[0].body.hosted_link as { completion_redirect_uri: string }).completion_redirect_uri), /\/app\?mcp_oauth=bank_done$/);

  assert.deepEqual(await completeLinks(ws.id), { connected: 0, waiting: 1 }, "not finished yet: honest 'waiting', nothing connected");
  finished = true;
  assert.deepEqual(await completeLinks(ws.id), { connected: 1, waiting: 0 });

  const row = (await bankItems().list(ws.id))[0];
  assert.equal(row.status, "connected");
  assert.ok(row.accessEnc && !row.accessEnc.includes("access-sandbox"), "token encrypted at rest");
  assert.equal(row.linkTokenEnc, null);

  const view = await listBanks(ws.id, true);
  assert.equal(view.items[0].institution, "First Platypus Bank");
  assert.equal(view.items[0].accounts[0].available, 100);
  assert.deepEqual(view.items[0].transactions.map((t) => [t.name, t.amount]), [["Payroll", 2000], ["Coffee", -4.5]], "money in is positive");
  assert.equal(JSON.stringify(view).includes("access-sandbox"), false, "no token in the API payload");

  assert.equal(await removeBank(ws.id, row.id), true);
  assert.ok(calls.some((c) => c.url.includes("/item/remove")), "Plaid is told to drop the item");
  assert.deepEqual((await bankItems().list(ws.id)), []);
});

test("banks: a bank whose transactions aren't ready still shows balances, with a plain note; Plaid errors never echo the secret", async () => {
  keys();
  process.env.PLAID_ENV = "production";
  const ws = await testWorkspace("bank-notready");
  const rowId = id("bank");
  const { sealSecret } = await import("../src/lib/mcp/crypto");
  await bankItems().insert({ id: rowId, workspaceId: ws.id, provider: "plaid", status: "connected", institution: "B", linkTokenEnc: null, accessEnc: sealSecret("tok", ws.id, rowId), connectedAt: now(), createdAt: now() });
  const calls = net({
    "/accounts/balance/get": () => ({ json: { accounts: [] } }),
    "/transactions/sync": () => ({ status: 400, json: { error_code: "PRODUCT_NOT_READY", error_message: "not ready plaid-secret-value" } }),
  });
  const v = (await listBanks(ws.id, true)).items[0];
  assert.match(calls[0].url, /^https:\/\/production\.plaid\.com\//);
  assert.match(v.note ?? "", /still loading/);
  net({ "/accounts/balance/get": () => ({ status: 400, json: { error_code: "ITEM_LOGIN_REQUIRED", error_message: "login required plaid-secret-value" } }) });
  const bad = (await listBanks(ws.id, true)).items[0];
  assert.match(bad.note ?? "", /Plaid: login required/);
  assert.equal((bad.note ?? "").includes("plaid-secret-value"), false);
});

test("analytics: conversion is paid orders per view over 14 days, and null (not 0%) with no views", async () => {
  const ws = await testWorkspace("conv");
  assert.equal((await dashboard(ws)).conversion.rate, null);
  const t = now();
  for (let i = 0; i < 40; i++) await pageViews().insert({ id: id("pv"), workspaceId: ws.id, projectId: "p", path: "/", day: t.slice(0, 10), at: t });
  for (let i = 0; i < 2; i++) await orders().insert({ id: id("ord"), workspaceId: ws.id, projectId: "p", status: "paid", paidAt: t, createdAt: t, amount: 1000, currency: "usd", email: "a@b.co", items: [] } as never);
  const c = (await dashboard(ws)).conversion;
  assert.deepEqual([c.orders, c.views, c.rate], [2, 40, 0.05]);
});
