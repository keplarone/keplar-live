import { test } from "node:test";
import assert from "node:assert/strict";
import { diffFiles, hunks, lineDiff } from "../src/lib/site-builder/diff";

test("lineDiff: counts only the changed lines", () => {
  const ops = lineDiff("a\nb\nc\nd", "a\nB\nc\nd\ne");
  assert.deepEqual(ops.filter((o) => o.t !== " ").map((o) => o.t + o.s), ["-b", "+B", "+e"]);
  assert.equal(lineDiff("same\ntext", "same\ntext").every((o) => o.t === " "), true);
});
test("lineDiff: empty sides and huge middles don't throw", () => {
  assert.deepEqual(lineDiff("", "x").map((o) => o.t), ["+"]);
  assert.deepEqual(lineDiff("x", "").map((o) => o.t), ["-"]);
  const big = Array.from({ length: 3000 }, (_, i) => `l${i}`).join("\n");
  const ops = lineDiff(big, big.replace("l1500", "zz") + "\nextra");
  assert.ok(ops.some((o) => o.t === "+") && ops.some((o) => o.t === "-"));
});
test("diffFiles: added, removed, changed, same, index first", () => {
  const d = diffFiles({ "index.html": "a\nb", "old.html": "x\ny", "keep.css": "k" }, { "index.html": "a\nc", "new.html": "n", "keep.css": "k" });
  assert.deepEqual(d.map((f) => [f.path, f.status, f.plus, f.minus]), [["index.html", "changed", 1, 1], ["keep.css", "same", 0, 0], ["new.html", "added", 1, 0], ["old.html", "removed", 0, 2]]);
});
test("hunks: context around changes, gap marker, truncation flag", () => {
  const a = Array.from({ length: 40 }, (_, i) => `l${i}`).join("\n");
  const b = a.replace("l5", "X").replace("l30", "Y");
  const h = hunks(lineDiff(a, b), 1);
  assert.equal(h.rows.filter((r) => r.t === "…").length, 1);
  assert.equal(h.truncated, false);
  assert.equal(hunks(lineDiff(a, a.split("\n").map((l) => l + "!").join("\n")), 1, 10).truncated, true);
});
