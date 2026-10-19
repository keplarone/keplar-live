import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

// Owner bug 2026-10-19: hovering the starter chips under the composer painted a grey rectangle behind the whole row.
// A bare [class*="homeChip"] also matches the row (homeChips) and each label (homeChipLabel), so a hover fill written for one chip
// filled the row's box. Chip-only rules must name the button.
test("starter chip hover rules target the chip button, never the row or its labels", () => {
  for (const f of readdirSync("src/styles").filter((x) => x.endsWith(".css"))) {
    const css = readFileSync(`src/styles/${f}`, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of css.matchAll(/([^{}]*\[class\*="_{0,2}homeChip"\][^{}]*)\{([^}]*)\}/g)) {
      const [selector, body] = [m[1], m[2]];
      if (!/background|border-color/.test(body)) continue; // resets (box-shadow: none, ...) are harmless on the row
      for (const part of selector.split(",")) {
        if (!part.includes('homeChip"]')) continue;
        assert.match(part, /button\[class\*="_{0,2}homeChip"\]/, `${f}: "${part.trim()}" paints the row too; scope it to button[...]`);
      }
    }
  }
});
