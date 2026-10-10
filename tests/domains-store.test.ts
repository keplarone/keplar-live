import "./setup";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { installFakeNeon } from "./helpers/fake-neon";
import type { DomainRow } from "@/lib/domains/store";

/** The Postgres side of custom domains against real Postgres semantics (PGlite): migration, unique hostname, atomic plan limit, jsonb and timestamps. */
let fake: Awaited<ReturnType<typeof installFakeNeon>> = null;
before(async () => {
  fake = await installFakeNeon();
  if (fake) process.env.DATABASE_URL = fake.url;
});
after(() => {
  fake?.restore();
  delete process.env.DATABASE_URL;
});
const skip = false;

const row = (over: Partial<DomainRow> = {}): DomainRow => ({
  id: `dom_${Math.random().toString(36).slice(2, 10)}`,
  userId: "user_1",
  workspaceId: "ws_1",
  siteId: "sit_1",
  hostname: `h${Math.random().toString(36).slice(2, 8)}.example.com`,
  status: "pending",
  ownershipToken: "tok",
  ownershipVerified: false,
  verification: { vercel: { verified: false, challenges: [{ type: "TXT", domain: "_vercel.example.com", value: "vc=1", reason: "r" }], apexName: "example.com" }, reason: "waiting" },
  lastError: null,
  lastCheckedAt: null,
  nextCheckAt: "2026-10-03T01:00:00.000Z",
  verifiedAt: null,
  createdAt: "2026-10-03T00:00:00.000Z",
  updatedAt: "2026-10-03T00:00:00.000Z",
  ...over,
});

test("migration is idempotent and the table has the expected columns and constraints", { skip }, async () => {
  const { ensureDomainsTable, domainStore } = await import("@/lib/domains/store");
  await ensureDomainsTable();
  await ensureDomainsTable();
  const cols = await fake!.db.query<{ column_name: string }>("select column_name from information_schema.columns where table_name = 'keplar_domains' order by ordinal_position");
  assert.deepEqual(cols.rows.map((c) => c.column_name), ["id", "user_id", "workspace_id", "project_id", "hostname", "status", "ownership_token", "ownership_verified", "verification", "last_error", "last_checked_at", "next_check_at", "verified_at", "created_at", "updated_at"]);
  const idx = await fake!.db.query<{ indexname: string; indexdef: string }>("select indexname, indexdef from pg_indexes where tablename = 'keplar_domains'");
  assert.ok(idx.rows.some((i) => i.indexname === "keplar_domains_hostname" && /UNIQUE/.test(i.indexdef)));
  assert.equal(typeof domainStore().insertIfUnderLimit, "function");
  // bad status / upper-case hostname are refused by the database itself
  await assert.rejects(fake!.db.query("insert into keplar_domains (id,user_id,workspace_id,project_id,hostname,status,ownership_token) values ('x','u','w','p','a.example.com','bogus','t')"));
  await assert.rejects(fake!.db.query("insert into keplar_domains (id,user_id,workspace_id,project_id,hostname,status,ownership_token) values ('y','u','w','p','A.example.com','pending','t')"));
});

test("insert/get round trip keeps jsonb, booleans and timestamps; unique hostname; limit is per workspace", { skip }, async () => {
  const { domainStore } = await import("@/lib/domains/store");
  const s = domainStore();
  const a = row({ hostname: "a.round-trip.com", workspaceId: "ws_rt" });
  assert.equal(await s.insertIfUnderLimit(a, 2), "ok");
  const got = (await s.get(a.id))!;
  assert.deepEqual(got, a);
  assert.deepEqual(await s.findByHostname("A.ROUND-TRIP.COM"), a);
  assert.equal(await s.insertIfUnderLimit(row({ hostname: "a.round-trip.com", workspaceId: "ws_other" }), 5), "duplicate", "another workspace can't take it");
  assert.equal(await s.insertIfUnderLimit(row({ hostname: "b.round-trip.com", workspaceId: "ws_rt" }), 2), "ok");
  assert.equal(await s.insertIfUnderLimit(row({ hostname: "c.round-trip.com", workspaceId: "ws_rt" }), 2), "limit");
  assert.equal(await s.insertIfUnderLimit(row({ hostname: "c.round-trip.com", workspaceId: "ws_rt" }), 0), "limit");
  assert.equal((await s.listByWorkspace("ws_rt")).length, 2);
  assert.equal((await s.listByWorkspace("ws_nobody")).length, 0);
  assert.equal((await s.listBySite("ws_rt", "sit_1")).length, 2);
  assert.equal((await s.listBySite("ws_other", "sit_1")).length, 0);

  const up = (await s.update(a.id, { status: "active", ownershipVerified: true, lastCheckedAt: "2026-10-03T00:30:00.000Z", verifiedAt: "2026-10-03T00:30:00.000Z", verification: { reason: "ok" }, lastError: "boom", nextCheckAt: null }))!;
  assert.equal(up.status, "active");
  assert.equal(up.ownershipVerified, true);
  assert.equal(up.lastCheckedAt, "2026-10-03T00:30:00.000Z");
  assert.equal(up.nextCheckAt, null);
  assert.deepEqual(up.verification, { reason: "ok" });
  assert.equal(up.hostname, a.hostname);
  assert.ok(up.updatedAt > a.updatedAt);
  assert.equal(await s.update("dom_missing", { status: "error" }), null);
  assert.equal(await s.remove(a.id), true);
  assert.equal(await s.remove(a.id), false);
  assert.equal(await s.get(a.id), null);
});

test("concurrent inserts: one winner per hostname, and the plan limit holds under a race", { skip }, async () => {
  const { domainStore } = await import("@/lib/domains/store");
  const s = domainStore();
  const same = await Promise.all(Array.from({ length: 6 }, (_, i) => s.insertIfUnderLimit(row({ hostname: "race.same-host.com", workspaceId: `ws_race_${i}` }), 5)));
  assert.equal(same.filter((r) => r === "ok").length, 1);
  assert.equal(same.filter((r) => r === "duplicate").length, 5);
  const limited = await Promise.all(Array.from({ length: 8 }, (_, i) => s.insertIfUnderLimit(row({ hostname: `n${i}.limit-race.com`, workspaceId: "ws_limit_race" }), 3)));
  assert.equal(limited.filter((r) => r === "ok").length, 3, "never more than the limit, even in parallel");
});

test("listDue returns only pending/verifying/active rows whose next check has passed, oldest first", { skip }, async () => {
  const { domainStore } = await import("@/lib/domains/store");
  const s = domainStore();
  const t = (m: number) => new Date(Date.parse("2026-10-03T12:00:00.000Z") + m * 60_000).toISOString();
  const rows = [
    row({ hostname: "late.due-test.com", workspaceId: "ws_due", nextCheckAt: t(-1) }),
    row({ hostname: "early.due-test.com", workspaceId: "ws_due", nextCheckAt: t(-30), status: "active" }),
    row({ hostname: "future.due-test.com", workspaceId: "ws_due", nextCheckAt: t(30) }),
    row({ hostname: "err.due-test.com", workspaceId: "ws_due", nextCheckAt: t(-30), status: "error" }),
    row({ hostname: "none.due-test.com", workspaceId: "ws_due", nextCheckAt: null }),
  ];
  for (const r of rows) assert.equal(await s.insertIfUnderLimit(r, 50), "ok");
  const due = await s.listDue(t(0), 10);
  const mine = due.filter((d) => d.workspaceId === "ws_due").map((d) => d.hostname);
  assert.deepEqual(mine, ["early.due-test.com", "late.due-test.com"]);
  assert.equal((await s.listDue(t(0), 1)).length, 1);
});
