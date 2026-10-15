import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { countersAreAtomicAndSmall, pruneIsBulk, readersMergeLegacyAndCounters } from "./helpers/pageview-counters";
import { countId } from "@/lib/business/traffic";

// PERF-4: page views are per-day counters (one atomic upsert per counter), not one row per view. tests/pageview-counters-neon.test.ts runs
// the same checks against Postgres semantics.
test("file store: 200 concurrent views of one site and day keep exact totals in 4 rows", async () => {
  const r = await countersAreAtomicAndSmall("pvc_file");
  assert.equal(r.rows, 4);
});
test("file store: site stats and the Business dashboard read counters and legacy per-view rows together", () => readersMergeLegacyAndCounters("pvc-merge-file"));
test("file store: retention deletes old views and counters in bulk, recent ones stay", async () => {
  await pruneIsBulk("pvcfile");
});
test("counter ids: stable per site, day, kind and key; keys are hashed (no raw paths or hosts in ids)", () => {
  assert.equal(countId("sit_1", "2026-10-01", "day"), "sit_1:2026-10-01:day");
  assert.equal(countId("sit_1", "2026-10-01", "path", "/a"), countId("sit_1", "2026-10-01", "path", "/a"));
  assert.notEqual(countId("sit_1", "2026-10-01", "path", "/a"), countId("sit_1", "2026-10-01", "path", "/b"));
  assert.doesNotMatch(countId("sit_1", "2026-10-01", "ref", "news.example"), /news/);
});
