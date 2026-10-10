import { test } from "node:test";
import assert from "node:assert/strict";
import { pickChoices } from "../src/components/create/workspace/understand";
import type { Direction } from "../src/components/create/workspace/flow";

const d = (id: string, mode: string, display: string): Direction => ({ id, name: id, tagline: "", swatch: ["#111"], mode, display, body: "x", effect: "none" });
const all = [d("a", "light", "Serif"), d("b", "light", "Serif"), d("c", "dark", "Grotesk"), d("e", "light", "Mono")];

test("understand: three distinct directions, suggested first, one in the other mode", () => {
  const r = pickChoices(all, "a");
  assert.deepEqual(r.map((x) => x.id), ["a", "c", "e"]);
  assert.equal(new Set(r.map((x) => x.id)).size, 3);
});
test("understand: fewer directions than three, or an unknown suggestion, never throws or repeats", () => {
  assert.deepEqual(pickChoices([d("a", "light", "S")], "a").map((x) => x.id), ["a"]);
  assert.deepEqual(pickChoices([], "a"), []);
  const r = pickChoices(all, "zzz");
  assert.equal(r[0].id, "a");
  assert.equal(new Set(r.map((x) => x.id)).size, r.length);
});
