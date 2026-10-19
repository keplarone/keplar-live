import assert from "node:assert/strict";
import { test } from "node:test";
import { parse } from "../src/components/app-ui/markdown-parse";

test("numbered steps separated by blank lines stay one list (no 1, 1, 1)", () => {
  const b = parse("Steps:\n\n1. Open the app\n\n2. Sign in\n\n3. Pick a plan\n\nDone.");
  assert.deepEqual(b.map((x) => x.t), ["p", "ol", "p"]);
  const ol = b[1];
  assert.ok(ol.t === "ol");
  assert.deepEqual(ol.items.map((i) => i.text), ["Open the app", "Sign in", "Pick a plan"]);
  assert.equal(ol.start, undefined);
});

test("a list that starts at another number keeps it", () => {
  const ol = parse("4. Fourth\n5. Fifth")[0];
  assert.ok(ol.t === "ol");
  assert.equal(ol.start, 4);
});

test("indented bullets become the item's sub-list, indented text continues the item", () => {
  const ol = parse("1. Prepare\n   - flour\n   - water\n2. Bake\n   for 20 minutes")[0];
  assert.ok(ol.t === "ol");
  assert.equal(ol.items.length, 2);
  assert.deepEqual(ol.items[0].sub, { ordered: false, items: ["flour", "water"] });
  assert.equal(ol.items[1].text, "Bake for 20 minutes");
});

test("a bullet list followed by a numbered list stays two lists", () => {
  assert.deepEqual(parse("- a\n- b\n\n1. one\n2. two").map((x) => x.t), ["ul", "ol"]);
});

test("~~~ fences and longer backtick fences are code; a shorter fence inside stays code", () => {
  const t = parse("~~~python\nprint(1)\n~~~");
  assert.deepEqual(t, [{ t: "code", lang: "python", code: "print(1)", open: false }]);
  const nested = parse("````md\n```js\nx()\n```\n````");
  assert.equal(nested.length, 1);
  assert.ok(nested[0].t === "code");
  assert.equal(nested[0].code, "```js\nx()\n```");
});

test("an unclosed fence while streaming is an open code block", () => {
  const b = parse("```ts\nconst a = 1");
  assert.ok(b[0].t === "code");
  assert.equal(b[0].open, true);
});

test("tables with or without the outer pipes", () => {
  const withPipes = parse("| A | B |\n|---|:-:|\n| 1 | 2 |");
  const bare = parse("A | B\n--- | :-:\n1 | 2\n\nAfter");
  for (const b of [withPipes, bare]) {
    const t = b[0];
    assert.ok(t.t === "table");
    assert.deepEqual(t.head, ["A", "B"]);
    assert.deepEqual(t.align, [null, "center"]);
    assert.deepEqual(t.rows, [["1", "2"]]);
  }
  assert.equal(bare[1].t, "p");
  // a sentence with a pipe in it is not a table
  assert.deepEqual(parse("Use a | b to pipe.").map((x) => x.t), ["p"]);
});
