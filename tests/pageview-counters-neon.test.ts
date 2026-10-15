import "./setup";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { installFakeNeon } from "./helpers/fake-neon";
import { countersAreAtomicAndSmall, pruneIsBulk, readersMergeLegacyAndCounters } from "./helpers/pageview-counters";
import { pageViews } from "@/lib/business/repo";

// The same checks as tests/pageview-counters.test.ts, against real Postgres semantics (PGlite behind a fake Neon endpoint).
let fake: Awaited<ReturnType<typeof installFakeNeon>> = null;
before(async () => {
  fake = await installFakeNeon("ep-pageviews.us-east-2.aws.neon.tech");
  if (fake) process.env.DATABASE_URL = fake.url;
});
after(() => fake?.restore());
const skip = "@electric-sql/pglite is not installed";

test("postgres: 200 concurrent views keep exact totals in 4 rows (INSERT ... ON CONFLICT DO UPDATE)", async (t) => {
  if (!fake) return t.skip(skip);
  const r = await countersAreAtomicAndSmall("pvc_pg");
  assert.equal(r.rows, 4);
  console.log(`[measure] rows stored for ${r.views} views of one site and day: before ${r.views} (one per view), after ${r.rows}`);
});
test("postgres: readers merge counters and legacy rows", async (t) => (fake ? readersMergeLegacyAndCounters("pvc-merge-pg") : t.skip(skip)));
test("postgres: retention is one DELETE per collection (was a list plus one DELETE per view)", async (t) => {
  if (!fake) return t.skip(skip);
  const f = fake;
  const r = await pruneIsBulk("pvcpg", () => f.calls.n);
  assert.equal(r.statements, 2, `statements: ${r.statements}`);
  // The old per-site loop on the same kind of data: list the site's views, then delete each old one by itself.
  const n = 100;
  for (let i = 0; i < n; i++) await pageViews().insert({ id: `pv_loop_${i}`, workspaceId: "ws_loop", projectId: "sit_loop", path: "/", day: "2020-01-01", at: "2020-01-01T00:00:00.000Z" });
  const before = f.calls.n;
  for (const v of await pageViews().list("ws_loop", (x) => x.projectId === "sit_loop" && x.day < "2026-01-01")) await pageViews().remove("ws_loop", v.id);
  const loop = f.calls.n - before;
  console.log(`[measure] prune statements: before ${loop} for ${n} old views of one site (and again per site); after ${r.statements} for ${r.legacyDeleted} legacy views + ${r.countersDeleted} counters across all sites`);
  assert.equal(loop, n + 1);
});
