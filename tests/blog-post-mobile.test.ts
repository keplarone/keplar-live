import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// QA 2026-10-05: every /blogs/<post> set its two columns with an inline style, which beat the kb media queries. Below 1180px the TOC
// is hidden but its 180px column stayed, so the article was 24px wide at 320 (the title ran one letter per line) and 94px at 390.
test("blog post grid: columns come from a class that collapses with the media queries, never an inline style", () => {
  const page = readFileSync("src/app/(marketing)/blogs/[slug]/page.tsx", "utf8");
  assert.doesNotMatch(page, /gridTemplateColumns/);
  assert.match(page, /s\.gridPost/);
  const css = readFileSync("src/components/kb/kb.module.css", "utf8");
  assert.match(css, /\n\.gridPost\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(180px, 15rem\);/);
  const narrow = css.slice(css.indexOf("@media (max-width: 1180px)"));
  assert.match(narrow.slice(0, narrow.indexOf("}\n@media")), /\.gridPost\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\);/);
});
