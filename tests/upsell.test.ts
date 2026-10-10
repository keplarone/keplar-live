import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { dismissUpsell, DISMISS_MS, emptyUpsell, isComplexAnswer, nextUpsell } from "@/lib/upsell";

const T0 = 1_800_000_000_000;
const H = 3_600_000;

function run(n: number, complexAt: number[] = [], start = emptyUpsell(), gapMs = 2 * H) {
  let state = start;
  const shown: { i: number; why: string }[] = [];
  for (let i = 1; i <= n; i++) {
    const r = nextUpsell(state, { complex: complexAt.includes(i), now: T0 + i * gapMs });
    state = r.state;
    if (r.show) shown.push({ i, why: r.show });
  }
  return { state, shown };
}

test("upsell: after the 5th answer, then every 10th; not before, not in between", () => {
  const { shown } = run(40);
  assert.deepEqual(shown.map((s) => s.i), [5, 15, 25, 35]);
});

test("upsell: a complex answer can trigger it, at most once a day", () => {
  const { shown } = run(4, [2, 3], emptyUpsell(), 2 * H);
  assert.deepEqual(shown, [{ i: 2, why: "complex" }]);
  assert.equal(isComplexAnswer({ consensus: { level: "partial", disagree: 1 }, disagreements: [] }), true);
  assert.equal(isComplexAnswer({ consensus: { level: "consensus", disagree: 0 }, disagreements: [] }), false);
  assert.equal(isComplexAnswer({ consensus: { level: "single", disagree: 0 }, disagreements: [] }), false);
});

test("upsell: never twice within an hour, never right after dismissal, returns after 7 days", () => {
  const first = nextUpsell({ ...emptyUpsell(), answers: 4 }, { complex: false, now: T0 });
  assert.equal(first.show, "milestone");
  const soon = nextUpsell({ ...first.state, answers: 14 }, { complex: true, now: T0 + 10 * 60_000 });
  assert.equal(soon.show, null, "within the hour");
  const dismissed = dismissUpsell(first.state, T0);
  assert.equal(nextUpsell({ ...dismissed, answers: 14, lastShownAt: 0 }, { complex: false, now: T0 + 3 * H }).show, null);
  assert.equal(nextUpsell({ ...dismissed, answers: 14, lastShownAt: 0 }, { complex: false, now: T0 + DISMISS_MS + H }).show, "milestone");
});

test("upsell: corrupt or hostile storage values count as zero", async () => {
  const mod = await import("@/lib/upsell");
  assert.deepEqual(mod.emptyUpsell(), { answers: 0, lastShownAt: 0, lastComplexAt: 0, dismissedUntil: 0 });
});
