import assert from "node:assert/strict";
import { test } from "node:test";
import { PHRASES, glyphPoints, targetsFor } from "../src/field/words/glyphs";

test("particle words include what Keplar is, and letters become points", () => {
  assert.deepEqual(PHRASES[0], "KEPLAR");
  assert.ok(PHRASES.includes("ONE ANSWER") && PHRASES.includes("MANY MODELS"));
  const keplar = glyphPoints("KEPLAR");
  const ask = glyphPoints("ASK");
  assert.ok(keplar.length > ask.length && ask.length > 10);
  for (const p of keplar) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
  assert.equal(glyphPoints("").length, 0);
  const laid = targetsFor("ASK", 100, 12);
  assert.equal(laid.length, 100);
  assert.equal(laid.filter((p) => p.aura).length, 12);
  assert.ok(laid.some((p) => !p.aura));
});
