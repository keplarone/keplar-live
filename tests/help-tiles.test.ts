import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// QA 2026-10-05: at 1920 the Help topic tiles used the page --t-title size (~56px in a ~270px column), so
// "Connected apps and the desktop app" broke mid-word ("Connecte / d") and that tile grew to nearly twice the height of the others.
test("help tiles: card-sized title that never splits a word, equal-height tiles", () => {
  const css = readFileSync("src/components/support/Help.module.css", "utf8");
  const title = css.match(/\.tileTitle\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.doesNotMatch(title, /var\(--t-title\)/);
  assert.match(title, /font-size:\s*clamp\(/);
  assert.doesNotMatch(title, /overflow-wrap:\s*anywhere/);
  assert.match(css, /\.tiles\s*>\s*li\s*\{[^}]*display:\s*grid/);
});
