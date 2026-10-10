import "./setup";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { installFakeNeon } from "./helpers/fake-neon";
import { collection, storeDurable } from "@/lib/create/platform/store";
import { databaseUrl, neonConfigured, neonQuery, DatabaseError } from "@/lib/create/platform/neon";
import { ensureWorkspaceForUser, workspaceForEmail, workspaceForUser, updateWorkspace, getWorkspace } from "@/lib/accounts/workspaces";
import { chargeUnits, usedThisPeriod } from "@/lib/create/platform/compute";
import { workspaceById } from "@/lib/create/platform/workspace";
import { handleWhopEvent } from "@/lib/billing/sync";
import { recordFormSubmission } from "@/lib/business/crm";
import { contacts, inbox, deals } from "@/lib/business/repo";
import { projects } from "@/lib/create/repo";
import { rateLimit, RateLimitError, rateLimitBackend } from "@/lib/create/platform/ratelimit";
import { recordSpend, spendToday, recordAdminSpend, adminSpendToday } from "@/lib/create/platform/spend";
import { DailySpendGuard } from "@/lib/orchestration/live-budget";

// Runs the real Postgres store adapter against an in-process Postgres (PGlite) behind a fake Neon HTTP endpoint.
// (The store reads DATABASE_URL on every call, so setting it in `before` is early enough.)
let fake: Awaited<ReturnType<typeof installFakeNeon>> = null;
before(async () => {
  fake = await installFakeNeon();
  if (fake) process.env.DATABASE_URL = fake.url;
});
after(() => fake?.restore());
const skip = false as const;

type Doc = { id: string; workspaceId: string; n?: number; tag?: string | null; nested?: { k: string } };

test("config: DATABASE_URL wins, POSTGRES_URL is the fallback, junk is ignored", { skip }, (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  assert.equal(neonConfigured(), true);
  assert.equal(storeDurable(), true);
  const keep = { d: process.env.DATABASE_URL, p: process.env.POSTGRES_URL };
  try {
    delete process.env.DATABASE_URL;
    assert.equal(databaseUrl(), "");
    assert.equal(neonConfigured(), false);
    process.env.POSTGRES_URL = "not a url";
    assert.equal(neonConfigured(), false);
    process.env.POSTGRES_URL = keep.d!;
    assert.equal(databaseUrl(), keep.d);
    process.env.DATABASE_URL = "postgres://other@h/db";
    assert.equal(databaseUrl(), "postgres://other@h/db");
  } finally {
    process.env.DATABASE_URL = keep.d!;
    if (keep.p === undefined) delete process.env.POSTGRES_URL;
    else process.env.POSTGRES_URL = keep.p;
  }
});

test("neon: schema is created once; SQL errors never leak the connection string", { skip }, async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const c = collection<Doc>("t_basic");
  await c.insert({ id: "a", workspaceId: "w1" });
  const reg = await neonQuery("SELECT to_regclass('keplar_rows')::text AS t");
  assert.equal(reg[0].t, "keplar_rows");
  const logs: string[] = [];
  const orig = console.error;
  console.error = (...a: unknown[]) => void logs.push(a.join(" "));
  try {
    await assert.rejects(neonQuery("SELECT * FROM no_such_table"), (e: unknown) => e instanceof DatabaseError && e.code === "42P01" && !/secret-pass/.test(e.message));
  } finally {
    console.error = orig;
  }
  assert.ok(logs.every((l) => !l.includes("secret-pass")));
});

test("neon: a transient 5xx is retried once", { skip }, async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  fake!.calls.failNext = 1;
  const r = await neonQuery("SELECT 1::text AS x");
  assert.equal(r[0].x, "1");
});

test("collection: insert / get / list / update (merge) / remove, tenant-scoped", { skip }, async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const c = collection<Doc>("t_crud");
  await c.insert({ id: "x1", workspaceId: "w1", n: 1, tag: "a", nested: { k: "v" } });
  await c.insert({ id: "x1", workspaceId: "w2", n: 99 });
  assert.equal((await c.get("w1", "x1"))?.n, 1);
  assert.equal((await c.get("w2", "x1"))?.n, 99);
  assert.equal(await c.get("w3", "x1"), null);
  assert.equal((await c.list("w1")).length, 1);
  assert.equal((await c.list("w1", (r) => r.n === 2)).length, 0);
  const up = await c.update("w1", "x1", { n: 2, id: "hijack", workspaceId: "w9" } as Partial<Doc>);
  assert.deepEqual(up, { id: "x1", workspaceId: "w1", n: 2, tag: "a", nested: { k: "v" } });
  const cleared = await c.update("w1", "x1", { tag: undefined });
  assert.equal("tag" in cleared!, false);
  assert.equal(await c.update("w1", "missing", { n: 1 }), null);
  assert.equal(await c.remove("w1", "x1"), true);
  assert.equal(await c.remove("w1", "x1"), false);
  assert.equal((await c.get("w2", "x1"))?.n, 99, "other tenant untouched");
  // insert on an existing key replaces it (file store pushes a duplicate; Postgres has a primary key)
  await c.insert({ id: "dup", workspaceId: "w1", n: 1 });
  await c.insert({ id: "dup", workspaceId: "w1", n: 2 });
  assert.equal((await c.list("w1", (r) => r.id === "dup")).length, 1);
});

test("collection: concurrent updates to different fields both land", { skip }, async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const c = collection<Doc>("t_merge");
  await c.insert({ id: "m", workspaceId: "w", n: 0, tag: "t" });
  await Promise.all([c.update("w", "m", { n: 5 }), c.update("w", "m", { tag: "u" })]);
  const r = await c.get("w", "m");
  assert.equal(r?.n, 5);
  assert.equal(r?.tag, "u");
});

test("collection: findSystemBy (indexed), case-insensitive, dotted paths, no injection", { skip }, async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const c = collection<Doc & { email?: string; billing?: { sub: string | null } }>("t_find");
  await c.insert({ id: "f1", workspaceId: "w1", email: "Ann@Example.com", billing: { sub: "mem_1" } });
  await c.insert({ id: "f2", workspaceId: "w2", email: "bob@example.com", billing: { sub: null } });
  assert.equal((await c.findSystemBy("email", "ann@example.COM", { ci: true }))?.id, "f1");
  assert.equal(await c.findSystemBy("email", "ann@example.com"), null, "case-sensitive by default");
  assert.equal((await c.findSystemBy("billing.sub", "mem_1"))?.id, "f1");
  assert.equal(await c.findSystemBy("billing.sub", "mem_404"), null);
  assert.equal((await c.findSystemBy("id", "f2"))?.workspaceId, "w2");
  await assert.rejects(c.findSystemBy("email') OR 1=1 --", "x"), /Invalid field/);
});

test("collection: increment is atomic across concurrent callers", { skip }, async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const c = collection<{ id: string; workspaceId: string; usd: number; calls: number; updatedAt: string }>("t_inc");
  const init = { id: "d", workspaceId: "system", usd: 0, calls: 0, updatedAt: "x" };
  await Promise.all(Array.from({ length: 20 }, () => c.increment("system", "d", { usd: 0.25, calls: 1 }, init)));
  const r = await c.get("system", "d");
  assert.equal(r?.usd, 5);
  assert.equal(r?.calls, 20);
});

test("collection: insertIfAbsent lets exactly one concurrent writer win", { skip }, async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const c = collection<Doc>("t_once");
  const out = await Promise.all(Array.from({ length: 8 }, (_, i) => c.insertIfAbsent({ id: "k", workspaceId: "w", n: i })));
  assert.equal(out.filter((o) => o.inserted).length, 1);
  assert.equal(new Set(out.map((o) => o.row.n)).size, 1, "everyone sees the winner's row");
});

test("collection: sum over a time range", { skip }, async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const c = collection<{ id: string; workspaceId: string; units: number; at: string }>("t_sum");
  await c.insert({ id: "1", workspaceId: "w", units: 5, at: "2026-10-01T00:00:00.000Z" });
  await c.insert({ id: "2", workspaceId: "w", units: 7, at: "2026-10-15T10:00:00.000Z" });
  await c.insert({ id: "3", workspaceId: "w", units: 11, at: "2026-11-01T00:00:00.000Z" });
  await c.insert({ id: "4", workspaceId: "other", units: 1000, at: "2026-10-15T10:00:00.000Z" });
  assert.equal(await c.sum("w", "units"), 23);
  assert.equal(await c.sum("w", "units", { field: "at", gte: "2026-10-01T00:00:00.000Z", lt: "2026-11-01T00:00:00.000Z" }), 12);
  assert.equal(await c.sum("w", "units", { field: "at", gte: "2026-10-02T00:00:00.000Z" }), 18);
  assert.equal(await c.sum("nobody", "units"), 0);
});

test("accounts: workspace per user is created once, found by user and email, and updates keep billing", { skip }, async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const u = { id: "user_neon_1", email: "Neon.User@Example.com", name: "Neon" };
  const [a, b] = await Promise.all([ensureWorkspaceForUser(u), ensureWorkspaceForUser(u)]);
  assert.equal(a.id, b.id);
  assert.equal((await workspaceForUser(u.id))?.id, a.id);
  assert.equal((await workspaceForEmail("neon.user@example.com"))?.id, a.id);
  assert.equal((await getWorkspace(a.id))?.ownerUserId, u.id);
  await updateWorkspace(a.id, { plan: "plus", billing: { status: "active", subscriptionId: "mem_neon" } });
  // a second sign-in must not reset the plan
  assert.equal((await ensureWorkspaceForUser(u)).plan, "plus");
  const w = await getWorkspace(a.id);
  assert.equal(w?.billing.subscriptionId, "mem_neon");
  assert.equal(w?.billing.status, "active");
  assert.equal(w?.billing.customerId, null, "untouched billing fields are kept");
});

test("credits: ledger deduction is summed per period and per tenant", { skip }, async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const row = await ensureWorkspaceForUser({ id: "user_neon_credits", email: "credits@example.com" });
  const ws = (await workspaceById(row.id, "plus"))!;
  assert.equal(await usedThisPeriod(ws), 0);
  await Promise.all([chargeUnits(ws, "answer", 40, 0.08), chargeUnits(ws, "answer", 60, 0.12)]);
  assert.equal(await usedThisPeriod(ws), 100);
  const other = (await workspaceById((await ensureWorkspaceForUser({ id: "user_neon_other", email: "other@example.com" })).id, "plus"))!;
  assert.equal(await usedThisPeriod(other), 0);
  assert.ok(ws.entitlements.monthlyUnits - (await usedThisPeriod(ws)) > 0);
});

test("whop webhook: idempotent by webhook-id, plan is stored in Postgres", { skip }, async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const ev = { type: "membership.activated", data: { id: "mem_idem", metadata: { email: "idem@example.com", plan: "pro" }, created_at: "2026-10-01T00:00:00.000Z" } };
  const first = await handleWhopEvent(ev, "msg_idem_1");
  assert.equal(first.duplicate, false);
  assert.equal(first.result, "plan=pro");
  assert.equal((await workspaceForEmail("idem@example.com"))?.plan, "pro");
  // downgrade out of band, then replay the same webhook-id: must be ignored
  const w = (await workspaceForEmail("idem@example.com"))!;
  await updateWorkspace(w.id, { plan: "free" });
  const again = await handleWhopEvent(ev, "msg_idem_1");
  assert.equal(again.duplicate, true);
  assert.equal((await workspaceForEmail("idem@example.com"))?.plan, "free", "replay did not re-grant");
  assert.equal((await collection<{ id: string; workspaceId: string }>("billing_events").list("system", (e) => e.id === "msg_idem_1")).length, 1);
  // cancel by membership id (indexed lookup)
  await handleWhopEvent({ type: "membership.activated", data: { id: "mem_idem", metadata: { email: "idem@example.com", plan: "plus" } } }, "msg_idem_2");
  const off = await handleWhopEvent({ type: "membership.deactivated", data: { id: "mem_idem" } }, "msg_idem_3");
  assert.equal(off.result, "plan=free");
  assert.equal((await workspaceForEmail("idem@example.com"))?.billing.status, "canceled");
});

test("forms + projects: a site's contact form writes contact, inbox and deal; slug lookup works", { skip }, async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const ws = "ws_form_neon";
  await projects().insert({ id: "prj_neon", workspaceId: ws, slug: "neon-site", name: "Neon Site" } as never);
  assert.equal((await projects().findSystemBy("slug", "neon-site"))?.id, "prj_neon");
  const c = await recordFormSubmission(ws, "prj_neon", "Neon Site", { name: "Pat", email: "Pat@Example.com", message: "Hello" });
  await recordFormSubmission(ws, "prj_neon", "Neon Site", { name: "Pat", email: "pat@example.com", message: "Again" });
  assert.equal((await contacts().list(ws)).length, 1, "same email = one contact");
  assert.equal((await inbox().list(ws)).length, 2);
  assert.equal((await deals().list(ws)).length, 1, "one open deal per contact");
  assert.equal(c.email, "pat@example.com");
});

test("rate limit: shared window in Postgres, resets after the window", { skip }, async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  assert.equal(rateLimitBackend(), "postgres");
  const key = `neon-test:${Math.random()}`;
  for (let i = 0; i < 3; i++) await rateLimit(key, 3, 60, { shared: true });
  await assert.rejects(rateLimit(key, 3, 60, { shared: true }), RateLimitError);
  // window expiry
  await fake!.db.query("UPDATE keplar_ratelimit SET window_start = now() - interval '2 minutes' WHERE key = $1", [key]);
  await rateLimit(key, 3, 60, { shared: true });
  // concurrent hits are counted exactly
  const k2 = `neon-test:${Math.random()}`;
  const res = await Promise.allSettled(Array.from({ length: 10 }, () => rateLimit(k2, 6, 60, { shared: true })));
  assert.equal(res.filter((r) => r.status === "fulfilled").length, 6);
  // per-instance (edge) limiter stays in memory: no table writes for it
  const before = (await fake!.db.query("SELECT count(*)::int AS n FROM keplar_ratelimit")).rows[0] as { n: number };
  await rateLimit(`mem:${Math.random()}`, 5);
  assert.equal(((await fake!.db.query("SELECT count(*)::int AS n FROM keplar_ratelimit")).rows[0] as { n: number }).n, before.n);
});

test("spend guards: concurrent spend adds up exactly", { skip }, async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const b = await spendToday(); // earlier tests already charged some plus-plan spend today
  const ba = await adminSpendToday();
  await Promise.all(Array.from({ length: 10 }, () => recordSpend(0.1, "free")));
  const d = await spendToday();
  assert.ok(Math.abs(d.totalUsd - b.totalUsd - 1) < 1e-9);
  assert.ok(Math.abs(d.freeUsd - b.freeUsd - 1) < 1e-9);
  await Promise.all(Array.from({ length: 5 }, () => recordAdminSpend(0.2)));
  assert.ok(Math.abs((await adminSpendToday()) - ba - 1) < 1e-9);
  const g = new DailySpendGuard(100);
  const h = await g.reserve(1);
  h!(0.5);
  await new Promise((r) => setTimeout(r, 200));
  const row = await collection<{ id: string; workspaceId: string; usd: number; calls: number }>("live_model_spend").list("system");
  assert.equal(row[0].usd, 0.5);
  assert.equal(row[0].calls, 1);
});

test("usage windows: counters live in Postgres, so a second 'instance' (fresh collection cache) sees them", { skip }, async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const { windowMeters, recordWindowUsage, windowRoom } = await import("@/lib/create/platform/windows");
  const { ENTITLEMENTS } = await import("@/lib/create/platform/plans");
  const w = { id: `ws_win_${Date.now()}`, name: "T", plan: "plus", verified: true, entitlements: ENTITLEMENTS.plus, anonymous: false, admin: false, userId: "u", email: "u@example.com", period: { start: new Date(Date.now() - 864e5).toISOString(), end: new Date(Date.now() + 864e5).toISOString() } } as const;
  await Promise.all(Array.from({ length: 5 }, () => recordWindowUsage(w, 200)));
  assert.deepEqual((await windowMeters(w))!.map((m) => m.used), [1000, 1000]);
  assert.equal((await windowRoom(w, 1)).blocked?.id, "fiveHour");
});
