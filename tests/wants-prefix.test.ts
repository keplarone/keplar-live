import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptChange, clampSel, onKey, P, PREFIX, replaceSel, userText } from "@/components/app-ui/wants/prefix-input";

const k = (key: string, m: Partial<{ ctrl: boolean; alt: boolean; meta: boolean; shift: boolean }> = {}) => ({ key, ctrl: false, alt: false, meta: false, shift: false, ...m });
const v = `${PREFIX}a coffee`;

test("selection can never start inside the prefix", () => {
  assert.deepEqual(clampSel({ start: 0, end: v.length }), { start: P, end: v.length }); // Ctrl/Cmd+A
  assert.deepEqual(clampSel({ start: 2, end: 3 }), { start: P, end: P });
  assert.deepEqual(clampSel({ start: 9, end: 4 }), { start: P, end: 9 }); // backward drag
});

test("Backspace at the boundary, and over a selection that reaches into the prefix, never removes it", () => {
  assert.deepEqual(onKey(v, { start: P, end: P }, k("Backspace")), { prevent: true });
  assert.deepEqual(onKey(PREFIX, { start: P, end: P }, k("Backspace")), { prevent: true });
  const r = onKey(v, { start: 0, end: v.length }, k("Backspace"));
  assert.ok(r.prevent && r.value === PREFIX);
  assert.deepEqual(onKey(v, { start: v.length, end: v.length }, k("Backspace")), { prevent: false }); // normal delete
});

test("word and line delete stop at the prefix", () => {
  const w = onKey(v, { start: v.length, end: v.length }, k("Backspace", { ctrl: true }));
  assert.ok(w.prevent && w.value === `${PREFIX}a `);
  const w2 = onKey(`${PREFIX}a`, { start: P + 1, end: P + 1 }, k("Backspace", { alt: true }));
  assert.ok(w2.prevent && w2.value === PREFIX);
  const line = onKey(v, { start: v.length, end: v.length }, k("Backspace", { meta: true }));
  assert.ok(line.prevent && line.value === PREFIX);
});

test("Delete inside the prefix and Home are trapped", () => {
  assert.equal(onKey(v, { start: 2, end: 2 }, k("Delete")).prevent, true);
  const h = onKey(v, { start: v.length, end: v.length }, k("Home"));
  assert.ok(h.prevent && h.caret === P);
  const left = onKey(v, { start: P, end: P }, k("ArrowLeft"));
  assert.ok(left.prevent && left.caret === P);
  assert.equal(onKey(v, { start: v.length, end: v.length }, k("ArrowLeft")).prevent, false);
});

test("paste over everything replaces only the user's text, and a pasted 'I want' isn't doubled", () => {
  const r = replaceSel(v, { start: 0, end: v.length }, "I want a pizza");
  assert.equal(r.value, `${PREFIX}a pizza`);
  assert.equal(replaceSel(PREFIX, { start: P, end: P }, "tea").value, `${PREFIX}tea`);
});

test("a change that lost the prefix is rejected", () => {
  assert.equal(acceptChange(v, "I wan a coffee"), v);
  assert.equal(acceptChange(v, "a coffee"), v);
  assert.equal(acceptChange(v, `${PREFIX}a coffees`), `${PREFIX}a coffees`);
  assert.equal(acceptChange("", "x"), PREFIX);
});

test("userText is what follows the prefix", () => {
  assert.equal(userText(`${PREFIX}a car`), "a car");
  assert.equal(userText(`${PREFIX}I want a car`), "a car");
});
