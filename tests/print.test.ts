import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

// QA 2026-10-05: printing /pricing gave 8 mostly blank sheets (unrevealed blocks at opacity 0, the fixed nav and skip link on every
// sheet, Dark's near-white ink on white paper) and prices that had not counted up yet printed as "$0".
test("print: content is never hidden, Light ink on paper, no fixed nav, banner or skip link; prices are the real numbers", () => {
  const g = readFileSync("src/styles/globals.css", "utf8");
  const print = g.slice(g.lastIndexOf("@media print"));
  // The scroll reveal is a screen-only, scroll-driven animation: nothing for paper (or anything else) to wait on.
  assert.match(g, /@supports \(animation-timeline: view\(\)\)\s*\{\s*@media screen and \(prefers-reduced-motion: no-preference\)\s*\{\s*\[data-reveal\]/);
  assert.doesNotMatch(g, /\[data-rv="out"\]/, "no script-set hidden state");
  assert.match(print, /\.skip-link\s*\{[^}]*display:\s*none/);
  assert.match(print, /:root\[data-theme="dark"\]\s*\{[^}]*--c-ink:\s*#09090b[^}]*--c-canvas|:root\[data-theme="dark"\]\s*\{[^}]*--c-canvas:\s*#ffffff[^}]*--c-ink:\s*#09090b/);
  assert.match(readFileSync("src/components/chrome/Nav.module.css", "utf8"), /@media print\s*\{\s*\.wrap\s*\{\s*display:\s*none/);
  assert.match(readFileSync("src/components/consent/CookieBanner.module.css", "utf8"), /@media print\s*\{\s*\.banner\s*\{\s*display:\s*none/);
  // Prices render as text: no count-up from $0 that screen readers, find-in-page or paper could catch mid-way.
  assert.equal(existsSync("src/components/motion/CountUp.tsx"), false);
  assert.match(readFileSync("src/components/sections/Pricing.tsx", "utf8"), /<span className=\{s\.amount\}>\{t\.price === null \? p\.custom : formatPrice\(t\)\}<\/span>/);
});

test("scroll reveal never hides content from a script", () => {
  const root = readFileSync("src/components/motion/RevealRoot.tsx", "utf8");
  assert.doesNotMatch(root, /IntersectionObserver/);
  assert.doesNotMatch(root, /dataset\.rv/);
});
