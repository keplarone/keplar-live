import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("src/styles/lit.css", "utf8");

test("proprietary controls: reduced motion and touch fall back to a plain press, no light, no movement", () => {
  const rm = css.slice(css.indexOf("prefers-reduced-motion"));
  assert.match(rm, /transform: none/);
  assert.match(rm, /\[data-lit\]::before, \[data-lit\]::after \{ display: none; \}/);
  assert.match(css, /@media \(hover: none\), \(pointer: coarse\)/);
});

test("proximity light only runs for a fine pointer without reduced motion", () => {
  const src = readFileSync("src/components/ui/ProximityLight.tsx", "utf8");
  assert.match(src, /hover: hover\) and \(pointer: fine\)/);
  assert.match(src, /prefers-reduced-motion: reduce/);
  assert.match(src, /pointerType !== "mouse"/);
});
