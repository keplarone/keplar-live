/**
 * Locks HeuristicClassifier and CostAwareRouter to a fixed question set.
 * Update tests/fixtures/route-golden.expected.json only when a route change is intentional.
 * The lock uses the static rosters, boost 1, and a pinned date (see route-golden.ts).
 */
import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import expected from "./fixtures/route-golden.expected.json";
import { GOLDEN_CASES, lockRoute, type LockedRoute } from "./fixtures/route-golden";

const locked = expected as Record<string, LockedRoute>;

test("classifier and router stay on the locked routes", () => {
  assert.deepEqual(
    GOLDEN_CASES.map((c) => c.id).sort(),
    Object.keys(locked).sort(),
    "every golden question has one locked route",
  );
  for (const c of GOLDEN_CASES) {
    assert.deepEqual(lockRoute(c), locked[c.id], c.id);
  }
});

test("free questions in the lock stay on a small panel with no judge", () => {
  for (const c of GOLDEN_CASES.filter((x) => x.plan === "free")) {
    const route = locked[c.id]!;
    assert.ok(route.panel.length >= 1 && route.panel.length <= 2, c.id);
    assert.equal(route.judge, null, c.id);
    assert.ok(route.panel.every((id) => id.startsWith("free:")), c.id);
  }
});
