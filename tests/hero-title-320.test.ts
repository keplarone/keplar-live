import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// QA 2026-10-05: at 320 the shared page-hero title (42px floor) broke "What is superintelligenc / e?" on /superintelligence and
// /ai-vs-agi-vs-superintelligence. The floor now scales with the screen below ~380px; 390 and up are unchanged (42px).
test("page hero title: the 42px floor becomes 11vw on narrow phones so long words fit 320", () => {
  const css = readFileSync("src/components/page/RoutePlaceholder.module.css", "utf8");
  const title = css.match(/\n\.title\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(title, /font-size:\s*clamp\(min\(42px,\s*11vw\),\s*6\.6vw,\s*170px\)/);
  // "superintelligence?" is 18 characters at ~0.42em each: 11vw at 320 (35.2px) is ~266px, inside the 280px column.
  assert.ok(18 * 0.42 * 0.11 * 320 < 280);
});
