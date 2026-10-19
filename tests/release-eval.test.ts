/**
 * Release eval for Keplar Core's fixed bench. CI scores canned answers with the real
 * checkers in src/lib/core/bench.ts. It also fails when the output quality gate starts
 * rejecting those answers or stops rejecting a known-bad sample, and when a Free route
 * for one of these prompts would call a model that is not a $0 `:free` model.
 *
 * This is not a live-model run. The before/after bench (scripts/core-eval.mts, and the
 * scheduled arm in src/lib/core/selfdev/evals.ts) calls the free roster and needs
 * OPENROUTER_API_KEY plus KEPLAR_LIVE_MODELS=1. CI does not have those keys, so that
 * run stays outside this gate. Do not record a live score here.
 *
 * Threshold: every canned correct answer on these 20 real bench items scores 1, and
 * every canned wrong answer scores below 1. The 20 ids are taken from BENCH; the
 * prompts are not invented.
 */
import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { BENCH, scoreItem } from "@/lib/core/bench";
import { assessOutput } from "@/lib/orchestration/quality-gate";
import { HeuristicClassifier } from "@/lib/orchestration/classifier";
import { isFreeModel } from "@/lib/orchestration/free-guard";
import { freeRoster } from "@/lib/orchestration/live-catalog";
import { CostAwareRouter } from "@/lib/orchestration/router";

/** Mean score required for the canned correct answers. A quality-gate or scorer regression fails CI below this. */
const RELEASE_MIN_SCORE = 1;

const RELEASE_IDS = ["r1", "r2", "r3", "r4", "r5", "m1", "m2", "m3", "c1", "c2", "c3", "f1", "f2", "f3", "f4", "l1", "s1", "s2", "s3", "s4"] as const;

const ROMAN = `function romanToInt(s) {
  const v = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const a = v[s[i]];
    const b = v[s[i + 1]] || 0;
    n += a < b ? -a : a;
  }
  return n;
}`;

const MERGE = `function mergeIntervals(list) {
  const xs = list.slice().sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const pair of xs) {
    const last = out[out.length - 1];
    if (!last || last[1] < pair[0]) out.push([pair[0], pair[1]]);
    else if (pair[1] > last[1]) last[1] = pair[1];
  }
  return out;
}`;

const BRACKETS = `function isValidBrackets(s) {
  const pair = { ")": "(", "]": "[", "}": "{" };
  const st = [];
  for (const c of s) {
    if (c === "(" || c === "[" || c === "{") st.push(c);
    else if (pair[c]) {
      if (st.pop() !== pair[c]) return false;
    }
  }
  return st.length === 0;
}`;

/** An answer the bench item's own checker accepts. Built from the item's check, not from a live model. */
function correctAnswer(id: string): string {
  switch (id) {
    case "r1":
      return "Final answer: 5";
    case "r2":
      return "Final answer: 5";
    case "r3":
      return "Cara is the second shortest.";
    case "r4":
      return "Final answer: 47";
    case "r5":
      return "No. It does not follow, because bloops could be razzies that are not lazzies.";
    case "m1":
      return "Final answer: 233168";
    case "m2":
      return "Final answer: 31";
    case "m3":
      return "Final answer: 14360.17";
    case "c1":
      return "```js\n" + ROMAN + "\n```";
    case "c2":
      return "```js\n" + MERGE + "\n```";
    case "c3":
      return "```js\n" + BRACKETS + "\n```";
    case "f1":
      return "Tungsten";
    case "f2":
      return "Final answer: 1648";
    case "f3":
      return "Ouagadougou";
    case "f4":
      return "Mikhail Bulgakov";
    case "l1":
      return "Final answer: 37";
    case "s1":
      return "Final answer: 456";
    case "s2":
      return "The train arrives at 15:05.";
    case "s3":
      return "1050 grams of flour and 7 eggs.";
    case "s4":
      return "Final answer: 3";
    default:
      throw new Error(`no canned answer for ${id}`);
  }
}

function wrongAnswer(id: string): string {
  if (id === "c1" || id === "c2" || id === "c3") return "```js\nfunction " + (id === "c1" ? "romanToInt" : id === "c2" ? "mergeIntervals" : "isValidBrackets") + "() { return null; }\n```";
  if (id === "r5") return "It remains open.";
  if (id === "r3" || id === "f1" || id === "f3" || id === "f4") return "No matching fact here.";
  if (id === "s2") return "The train arrives at 14:45.";
  return "Final answer: 0";
}

const items = RELEASE_IDS.map((id) => {
  const item = BENCH.find((b) => b.id === id);
  if (!item) throw new Error(`bench item ${id} is missing`);
  return item;
});

test("twenty real bench items score 1 when the answer is right and below 1 when it is wrong", async () => {
  assert.equal(items.length, 20);
  assert.equal(new Set(items.map((i) => i.id)).size, 20);
  const scores: number[] = [];
  for (const item of items) {
    const good = await scoreItem(item, correctAnswer(item.id));
    const bad = await scoreItem(item, wrongAnswer(item.id));
    assert.equal(good.score, 1, `${item.id} correct: ${good.note}`);
    assert.ok(bad.score < 1, `${item.id} wrong scored ${bad.score}, which would hide a scorer that always passes`);
    scores.push(good.score);
  }
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  assert.ok(mean >= RELEASE_MIN_SCORE, `mean ${mean} is below ${RELEASE_MIN_SCORE}`);
});

test("the quality gate accepts these answers and still rejects a known-bad sample", () => {
  for (const item of items) {
    const verdict = assessOutput(correctAnswer(item.id), { prompt: item.prompt });
    assert.equal(verdict.ok, true, `${item.id} ${verdict.ok ? "" : verdict.detail}`);
  }
  const bad = assessOutput("The answer is " + "very ".repeat(10), { prompt: "explain this carefully" });
  assert.equal(bad.ok, false);
  assert.equal(assessOutput("", { prompt: "explain" }).ok, false);
});

test("Free routes for these prompts stay on $0 free models", () => {
  const router = new CostAwareRouter(freeRoster, () => 1);
  const classifier = new HeuristicClassifier();
  for (const item of items) {
    const req = { prompt: item.prompt, plan: "free" as const, at: "2026-10-19T00:00:00.000Z" };
    const plan = router.route(classifier.classify(req), req);
    const seats = [...plan.panel, ...(plan.verifier ? [plan.verifier] : []), ...(plan.judge ? [plan.judge] : [])];
    assert.ok(seats.length > 0, item.id);
    assert.equal(plan.judge, null, `${item.id} free route has a judge`);
    for (const seat of seats) assert.equal(isFreeModel(seat.model), true, `${item.id} ${seat.model.id}`);
  }
});
