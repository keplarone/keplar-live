import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { signIn, call, jsonReq } from "./helpers/session";
import { collection } from "@/lib/create/platform/store";
import { noteVisit, flush, resetTrafficState, routeOf, trafficMark, trafficSummary, liveVisitors, rollupTraffic, dayOf, type VisitRow } from "@/lib/traffic/visits";
import { summarizeActivity, ACTIVITY_WINDOW_MS } from "@/lib/admin/live-activity";
import { buildReport, backfillPaymentAmounts, RANGES } from "@/lib/admin/revenue";
import { amountsOf } from "@/lib/billing/sync";
import type { RequestCostRow } from "@/lib/ops/request-cost";

const UA = "Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0 Safari/537.36";
const page = (path: string, ip: string, extra: Record<string, string> = {}, ua = UA) =>
  new Request(`https://keplar.one${path}`, { headers: { "user-agent": ua, "sec-fetch-dest": "document", "x-forwarded-for": ip, ...extra } });
const T = Date.parse("2026-10-04T15:00:00Z");
const visits = () => collection<VisitRow>("traffic_visits");
const clearVisits = async () => { resetTrafficState(); await visits().purgeSystemBefore("day", "9999-99-99", 100_000); await collection("traffic_daily").purgeSystemBefore("day", "9999-99-99", 100_000); };

test("routeOf keeps only the first path segment and skips private/system paths", () => {
  assert.equal(routeOf("/"), "/");
  assert.equal(routeOf("/pricing"), "/pricing");
  assert.equal(routeOf("/blogs/some-long-slug?x=1".split("?")[0]!), "/blogs");
  for (const p of ["/api/keplar", "/admin", "/admin/seo", "/_next/static/a", "/s/token123", "/share/abc", "/reset-password", "/robots.txt", "/logo.png"]) assert.equal(routeOf(p), null, p);
});

test("not counted: bots, Do Not Track, GPC, prefetch, non-document requests, no user agent", async () => {
  resetTrafficState();
  const none = [
    page("/pricing", "1.1.1.1", {}, "Googlebot/2.1"),
    page("/pricing", "1.1.1.2", { dnt: "1" }),
    page("/pricing", "1.1.1.3", { "sec-gpc": "1" }),
    page("/pricing", "1.1.1.4", { "next-router-prefetch": "1" }),
    page("/pricing", "1.1.1.5", { "sec-purpose": "prefetch" }),
    page("/pricing", "1.1.1.6", { "sec-fetch-dest": "image" }),
    page("/pricing", "1.1.1.7", {}, ""),
    new Request("https://keplar.one/pricing", { method: "POST", headers: { "user-agent": UA, "sec-fetch-dest": "document" } }),
  ];
  for (const r of none) assert.equal(noteVisit(r, T), null);
  assert.equal(await flush(T), 0);
});

test("a counted visit stores a daily code, day, first path segment and referrer host only; no IP or user agent", async () => {
  resetTrafficState();
  const p = noteVisit(page("/pricing/extra?email=a@b.c", "203.0.113.9", { referer: "https://www.google.com/search?q=secret+question" }), T);
  assert.ok(p);
  await p;
  const rows = await visits().listSystem();
  assert.equal(rows.length, 1);
  const r = rows[0]!;
  assert.equal(r.route, "/pricing");
  assert.equal(r.ref, "google.com");
  assert.equal(r.day, "2026-10-04");
  const blob = JSON.stringify(rows);
  for (const bad of ["203.0.113.9", "Mozilla", "Chrome", "email", "secret", "search"]) assert.ok(!blob.includes(bad), `row leaks ${bad}`);
  assert.ok(r.id.startsWith("2026-10-04:"));
});

test("the visitor code rotates each day and differs per person", () => {
  assert.notEqual(trafficMark("1.2.3.4", UA, "2026-10-04"), trafficMark("1.2.3.4", UA, "2026-10-05"));
  assert.notEqual(trafficMark("1.2.3.4", UA, "2026-10-04"), trafficMark("1.2.3.5", UA, "2026-10-04"));
  assert.equal(trafficMark("1.2.3.4", UA, "2026-10-04"), trafficMark("1.2.3.4", UA, "2026-10-04"));
});

test("repeat page loads are batched: one row per visitor, hits are summed, no rewrite inside a minute", async () => {
  await clearVisits();
  const a = noteVisit(page("/", "198.51.100.1"), T);
  assert.ok(a);
  assert.equal(noteVisit(page("/pricing", "198.51.100.1"), T + 5_000), null); // same visitor, batch already queued
  assert.equal(noteVisit(page("/pricing", "198.51.100.2"), T + 6_000), null); // different visitor joins the same batch
  await a;
  const rows = (await visits().listSystem()).filter((r) => r.id.startsWith("2026-10-04:"));
  assert.equal(rows.length, 2);
  assert.equal(rows.find((r) => r.route === "/")?.hits, 2);
  // Within a minute of the last write: nothing new to flush.
  assert.equal(noteVisit(page("/", "198.51.100.1"), T + 20_000), null);
  assert.equal(await flush(T + 20_000), 0);
});

test("summary: live (last 5 min), today, 7d, 30d, all time; rollup keeps the all-time sum and purges old rows", async () => {
  await clearVisits();
  const col = visits();
  const row = (day: string, mark: string, last: string, route = "/pricing", ref?: string): VisitRow => ({ id: `${day}:${mark}`, workspaceId: "system", day, first: last, last, hits: 1, route, ...(ref ? { ref } : {}) });
  const now = Date.parse("2026-12-20T12:00:00Z");
  const today = dayOf(now);
  const seed = [
    row(today, "live1", new Date(now - 60_000).toISOString(), "/", "x.com"),
    row(today, "old1", new Date(now - 3_600_000).toISOString()),
    row(dayOf(now - 3 * 864e5), "d3", new Date(now - 3 * 864e5).toISOString()),
    row(dayOf(now - 20 * 864e5), "d20", new Date(now - 20 * 864e5).toISOString()),
    row(dayOf(now - 50 * 864e5), "d50a", new Date(now - 50 * 864e5).toISOString()),
    row(dayOf(now - 50 * 864e5), "d50b", new Date(now - 50 * 864e5).toISOString()),
  ];
  for (const r of seed) await col.insert(r);
  const s = await trafficSummary(now);
  assert.equal(s.live, 1);
  assert.equal(s.today, 2);
  assert.equal(s.last7, 3);
  assert.equal(s.last30, 4);
  assert.equal(s.allTime, 6);
  assert.equal(s.since, dayOf(now - 50 * 864e5));
  assert.equal(await liveVisitors(now), 1);
  // The two 50-day-old rows were folded into one daily total and removed.
  assert.equal((await col.listSystem()).filter((r) => r.day === dayOf(now - 50 * 864e5)).length, 0);
  assert.equal(await rollupTraffic(now), 0);
  const again = await trafficSummary(now);
  assert.equal(again.allTime, 6);
});

// --- live activity feed ---
const rc = (over: Partial<RequestCostRow>): RequestCostRow => ({
  id: "rc_1", workspaceId: "system", at: new Date(T).toISOString(), reqId: "req-SECRET-1", plan: "free", accountId: "acct-PRIVATE-1", kind: "answer",
  modelCalls: 2, failedCalls: 0, distinctModels: 2, usd: 0.01, units: 1, durationMs: 4200, answered: true, degraded: null, maxModels: 3, answeredBy: ["openai/gpt-x", "anthropic/claude-y"], ...over,
});

test("activity summary: counts for 5 minutes and today, models and times, and nothing identifying", () => {
  const now = T + 60_000;
  const iso = (ms: number) => new Date(ms).toISOString();
  const rows = [
    rc({ id: "a", at: iso(now - 30_000), answeredBy: ["m/one", "m/two"] }),
    rc({ id: "b", at: iso(now - ACTIVITY_WINDOW_MS + 1_000), answeredBy: ["m/one"] }),
    rc({ id: "c", at: iso(now - ACTIVITY_WINDOW_MS - 60_000), answeredBy: ["m/old"] }),
    rc({ id: "d", at: iso(now - 10_000), kind: "instant", answered: false, answeredBy: undefined, modelCalls: 0 }),
    rc({ id: "e", at: iso(Date.parse("2026-10-03T23:00:00Z")) }), // yesterday (UTC)
    rc({ id: "f", at: iso(now - 20_000), answeredBy: undefined }), // before models were recorded
  ];
  const out = summarizeActivity(rows, now);
  assert.equal(out.last5m, 4);
  assert.equal(out.today, 5);
  assert.equal(out.modelAnswers5m, 3);
  assert.deepEqual(out.models5m.map((m) => `${m.model}:${m.answers}`).sort(), ["m/one:2", "m/two:1"]);
  assert.equal(out.feed[0]!.at, iso(now - 10_000)); // newest first
  assert.equal(out.feed.find((e) => e.kind === "instant")!.models.length, 0);
  assert.equal(out.feed.find((e) => e.at === iso(now - 20_000))!.modelsRecorded, false);
  for (const e of out.feed) assert.deepEqual(Object.keys(e).sort(), ["answered", "at", "durationMs", "kind", "models", "modelsRecorded", "plan"]);
  const text = JSON.stringify(out);
  for (const bad of ["acct-PRIVATE", "req-SECRET", "accountId", "reqId", "workspaceId", "prompt", "message"]) assert.ok(!text.includes(bad), `activity leaks ${bad}`);
});

test("activity feed is capped", () => {
  const rows = Array.from({ length: 80 }, (_, i) => rc({ id: `r${i}`, at: new Date(T - i * 1000).toISOString() }));
  assert.equal(summarizeActivity(rows, T).feed.length, 25);
});

// --- admin-only access + no leakage over HTTP ---
test("/api/admin/live and /api/admin/fixed-costs are 404 for anonymous and non-admins; admins get counts without text or identity", async () => {
  const plain = await signIn("traffic-plain@example.com", "free");
  const live = await import("@/app/api/admin/live/route");
  const fixed = await import("@/app/api/admin/fixed-costs/route");
  for (const cookie of [null, plain.cookie]) {
    assert.equal((await live.GET(call(cookie, "/api/admin/live"))).status, 404);
    assert.equal((await fixed.GET(call(cookie, "/api/admin/fixed-costs"))).status, 404);
    assert.equal((await fixed.POST(jsonReq(cookie, "/api/admin/fixed-costs", "POST", { label: "Hosting", usdMonthly: 20, from: "2026-01-01" }))).status, 404);
  }
  assert.equal((await collection("ops_fixed_costs").listSystem()).length, 0);

  process.env.KEPLAR_ADMIN_EMAILS = "traffic-admin@example.com";
  const admin = await signIn("traffic-admin@example.com", "free");
  await collection<RequestCostRow>("system_request_costs").insert(rc({ id: "rc_http", at: new Date().toISOString(), accountId: "acct-LEAK-CHECK", reqId: "req-LEAK-CHECK", answeredBy: ["provider/model-a"] }));
  const res = await live.GET(call(admin.cookie, "/api/admin/live"));
  assert.equal(res.status, 200);
  assert.match(res.headers.get("cache-control") ?? "", /no-store/);
  const text = await res.text();
  const j = JSON.parse(text) as { visitors: number | null; activity: { last5m: number; today: number; feed: { models: string[] }[] } };
  assert.ok(j.activity.last5m >= 1 && j.activity.today >= 1);
  assert.deepEqual(j.activity.feed[0]!.models, ["provider/model-a"]);
  for (const bad of ["LEAK-CHECK", "accountId", "reqId", "workspaceId", "traffic-admin", "@example.com"]) assert.ok(!text.includes(bad), `live endpoint leaks ${bad}`);

  const add = await fixed.POST(jsonReq(admin.cookie, "/api/admin/fixed-costs", "POST", { label: "Hosting", usdMonthly: 20, from: "2026-01-01" }));
  assert.equal(add.status, 200);
  const bad = await fixed.POST(jsonReq(admin.cookie, "/api/admin/fixed-costs", "POST", { label: "x", usdMonthly: -1, from: "2026-01-01" }));
  assert.equal(bad.status, 400);
  const list = (await (await fixed.GET(call(admin.cookie, "/api/admin/fixed-costs"))).json()) as { costs: { label: string }[] };
  assert.equal(list.costs.length, 1);
});

// --- revenue ---
test("amountsOf reads USD totals and after-fee amounts, never guesses other currencies", () => {
  assert.deepEqual(amountsOf({ usd_total: 9.5, amount_after_fees: 8.4 }), { amountUsd: 9.5, netUsd: 8.4 });
  assert.deepEqual(amountsOf({ total: 20, currency: "usd" }), { amountUsd: 20, netUsd: null });
  assert.deepEqual(amountsOf({ total: 20, currency: "eur" }), { amountUsd: null, netUsd: null });
  assert.deepEqual(amountsOf({}), { amountUsd: null, netUsd: null });
  assert.equal(amountsOf({ usd_total: 5, amount_after_fees: 9 }).netUsd, null);
});

const NOW = Date.parse("2026-10-04T15:00:00Z");
const base = { now: NOW, payments: [], extensions: [], orders: [], spend: null, adminWorkspaceIds: new Set<string>(), fixedCosts: [], whopConfigured: true, stripeConfigured: false };

test("report: nothing connected shows Not connected and no profit", () => {
  const r = buildReport({ ...base, whopConfigured: false });
  assert.deepEqual(r.sources.map((s) => s.status), ["not_connected", "not_connected", "not_connected"]);
  assert.equal(r.totalUsd.all, 0);
  for (const k of RANGES) assert.equal(r.profit[k].netUsd, null);
});

test("report: recorded revenue by range, refunds excluded, unrecorded amounts counted and only estimated at list price", () => {
  const r = buildReport({
    ...base,
    payments: [
      { id: "p1", plan: "plus", at: "2026-10-04T10:00:00Z", amountUsd: 20, netUsd: 18 },
      { id: "p2", plan: "plus", at: "2026-10-01T10:00:00Z", amountUsd: 20, netUsd: 18 },
      { id: "p3", plan: "pro", at: "2026-09-01T10:00:00Z", amountUsd: 50, refundedAt: "2026-09-02T00:00:00Z" },
      { id: "p4", plan: "plus", at: "2026-10-03T10:00:00Z" }, // no amount stored
    ],
    extensions: [{ paymentId: "e1", pack: "small", grantedAt: "2026-10-04T09:00:00Z", amountUsd: 5, status: "active" }],
  });
  const plans = r.sources[0]!;
  assert.equal(plans.revenueUsd.today, 20);
  assert.equal(plans.revenueUsd.d7, 40);
  assert.equal(plans.revenueUsd.all, 40);
  assert.equal(plans.refundedUsd.all, 50);
  assert.equal(plans.unrecorded.all, 1);
  assert.ok(plans.estimatedUnrecordedUsd.all > 0);
  assert.equal(r.sources[1]!.revenueUsd.all, 5);
  assert.equal(r.totalUsd.all, 45); // recorded only; the estimate is separate
  assert.equal(r.estimatedUnrecordedUsd.all, plans.estimatedUnrecordedUsd.all);
  assert.equal(r.profit.all.complete, false); // an unrecorded payment keeps profit "partial"
});

test("report: contribution subtracts known fees and model spend; team usage is separate; net profit needs fixed costs", () => {
  const input = {
    ...base,
    payments: [{ id: "p1", plan: "plus", at: "2026-10-04T10:00:00Z", amountUsd: 20, netUsd: 18 }],
    spend: [
      { workspaceId: "w_customer", usd: 3, at: "2026-10-04T11:00:00Z" },
      { workspaceId: "w_team", usd: 100, at: "2026-10-04T11:00:00Z" },
    ],
    adminWorkspaceIds: new Set(["w_team"]),
  };
  const r = buildReport(input);
  assert.equal(r.costs.modelSpendUsd!.today, 3);
  assert.equal(r.costs.teamSpendUsd!.today, 100);
  assert.equal(r.costs.whopFeesUsd.today, 2);
  assert.equal(r.profit.today.contributionUsd, 15); // 20 - 2 fee - 3 model
  assert.equal(r.profit.today.complete, true);
  assert.equal(r.profit.today.netUsd, null); // fixed costs not tracked: never invented
  const withFixed = buildReport({ ...input, fixedCosts: [{ label: "Hosting", usdMonthly: 30.4375, from: "2026-01-01" }] });
  assert.equal(withFixed.costs.fixedTracked, true);
  assert.ok(withFixed.profit.today.netUsd !== null && withFixed.profit.today.netUsd < 15);
});

test("report: Stripe Connect shows only Keplar's application fee on paid live USD orders", () => {
  const order = (over: Record<string, unknown>) => ({ status: "paid", paidAt: "2026-10-04T10:00:00Z", applicationFeeAmount: 250, currency: "usd", livemode: true, amount: 5000, refundedAmount: 0, ...over }) as never;
  const r = buildReport({ ...base, stripeConfigured: true, orders: [order({}), order({ livemode: false }), order({ currency: "eur" }), order({ status: "refunded" })] });
  const s = r.sources[2]!;
  assert.equal(s.revenueUsd.today, 2.5);
  assert.equal(s.refundedUsd.today, 2.5);
});

test("backfill fills missing payment amounts from the Whop API", async () => {
  process.env.WHOP_API_KEY = "test-key";
  process.env.WHOP_COMPANY_ID = "biz_test";
  const real = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ data: [{ id: "pay_bf", status: "paid", usd_total: 20, amount_after_fees: 17.5 }] }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
  try {
    const col = collection<{ id: string; workspaceId: string; plan: string; at: string; amountUsd?: number; netUsd?: number }>("whop_payments");
    await col.insert({ id: "pay_bf", workspaceId: "system", plan: "plus", at: "2026-10-01T00:00:00Z" });
    const rows = await col.listSystem();
    const n = await backfillPaymentAmounts(rows as never);
    assert.equal(n, 1);
    assert.equal((await col.get("system", "pay_bf"))?.amountUsd, 20);
    assert.equal((await col.get("system", "pay_bf"))?.netUsd, 17.5);
  } finally {
    globalThis.fetch = real;
    delete process.env.WHOP_API_KEY;
    delete process.env.WHOP_COMPANY_ID;
  }
});
