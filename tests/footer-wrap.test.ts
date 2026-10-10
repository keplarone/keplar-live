import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// QA 2026-10-05: from 900 to 1150px wide the footer's two-column Learn list split "What is superintelligence?" mid-word on every page.
test("footer: the wide Learn list is one column between 900 and 1199px", () => {
  const css = readFileSync("src/components/chrome/Footer.module.css", "utf8");
  assert.match(css, /@media \(min-width: 900px\) and \(max-width: 1199px\)\s*\{\s*\.col\[data-wide\] ul\s*\{\s*columns:\s*1;/);
});
