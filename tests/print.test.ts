import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// QA 2026-10-05: printing /pricing gave 8 mostly blank sheets (unrevealed blocks at opacity 0, the fixed nav and skip link on every
// sheet, Dark's near-white ink on white paper) and prices that had not counted up yet printed as "$0".
test("print: revealed content, Light ink on paper, no fixed nav, banner or skip link; prices finish before printing", () => {
  const g = readFileSync("src/styles/globals.css", "utf8");
  const print = g.slice(g.lastIndexOf("@media print"));
  assert.match(print, /\[data-rv\]\s*\{[^}]*opacity:\s*1 !important/);
  assert.match(print, /\.skip-link\s*\{[^}]*display:\s*none/);
  assert.match(print, /:root\[data-theme="dark"\]\s*\{[^}]*--c-ink:\s*#09090b[^}]*--c-canvas|:root\[data-theme="dark"\]\s*\{[^}]*--c-canvas:\s*#ffffff[^}]*--c-ink:\s*#09090b/);
  assert.match(readFileSync("src/components/chrome/Nav.module.css", "utf8"), /@media print\s*\{\s*\.wrap\s*\{\s*display:\s*none/);
  assert.match(readFileSync("src/components/consent/CookieBanner.module.css", "utf8"), /@media print\s*\{\s*\.banner\s*\{\s*display:\s*none/);
  assert.match(readFileSync("src/components/motion/CountUp.tsx", "utf8"), /addEventListener\("beforeprint", finish\)/);
});
