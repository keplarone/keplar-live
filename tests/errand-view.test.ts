import { test } from "node:test";
import assert from "node:assert/strict";
import { ERRAND_PLAN, errandStages, handoverUrl, type ErrandTask } from "@/lib/browser/errand-view";

const step = (n: number, url: string, note = `step ${n}`) => ({ n, note, url, title: "" });

test("errand view: stages come only from the task's real steps and status", () => {
  const running: ErrandTask = { id: "bt1", goal: "order a pizza", status: "running", steps: [] };
  assert.deepEqual(errandStages(running).map((s) => [s.label, s.status]), [["Opening Keplar's browser", "running"]]);

  const mid: ErrandTask = { ...running, steps: [step(0, "https://www.dominos.com/", "Opened Domino's")] };
  assert.deepEqual(errandStages(mid).map((s) => s.status), ["done", "running"]);
  assert.equal(errandStages(mid)[0].detail, "dominos.com");

  const handover: ErrandTask = { ...mid, status: "needs_you", reason: "Checkout needs your payment details." };
  const last = errandStages(handover).at(-1)!;
  assert.equal(last.status, "needs_you");
  assert.equal(last.detail, "Checkout needs your payment details.");
  assert.equal(handoverUrl(handover), "https://www.dominos.com/");

  assert.equal(errandStages({ ...mid, status: "failed" }).at(-1)!.detail, "Nothing was bought, sent or changed.");
  assert.equal(errandStages({ ...mid, status: "stopped" }).at(-1)!.status, "canceled");
  assert.equal(errandStages({ ...mid, status: "done", answer: "Ordered." }).at(-1)!.detail, "Ordered.");
});

test("errand view: only https pages are offered to take over, and every kind says where it hands over", () => {
  assert.equal(handoverUrl({ id: "b", goal: "g", status: "needs_you", steps: [step(0, "javascript:alert(1)")] }), null);
  assert.equal(handoverUrl({ id: "b", goal: "g", status: "needs_you", steps: [] }), null);
  for (const p of Object.values(ERRAND_PLAN)) assert.ok(p.handsOver.length > 10);
});
