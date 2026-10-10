import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// QA 2026-10-05 14:20: at 320px the /app top bar squeezed the thread title to 17px ("D…").
test("app top bar: the thread title is hidden (kept as spacer) below 360px", () => {
  const css = readFileSync(new URL("../src/components/app-ui/App.module.css", import.meta.url), "utf8");
  const block = css.match(/@media \(max-width: 359px\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(block, /\.topTitle\s*\{\s*visibility:\s*hidden;?\s*\}/);
  // still the flex spacer, so the meter and buttons stay right-aligned
  assert.match(css.match(/\n\.topTitle\s*\{([^}]*)\}/)?.[1] ?? "", /flex:\s*1/);
});
