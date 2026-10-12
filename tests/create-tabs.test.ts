import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// QA 2026-10-05: at 320px the Create tabs (App / Images / Video (Beta) / Mobile (Beta)) were wider than the screen and broke mid-word.
// Site Create tab was removed 2026-10-06.
test("create tabs: labels never wrap and fit 320-440px phones", () => {
  const css = readFileSync("src/components/create/builder.module.css", "utf8");
  assert.match(css.match(/\.segBtn\s*\{([^}]*)\}/)?.[1] ?? "", /white-space:\s*nowrap/);
  assert.match(css, /\.stageBar > \.seg\s*\{[^}]*max-width:\s*100%[^}]*overflow-x:\s*auto/);
  // 390 / 414px phones cut "Mobile (Beta)" off with the full padding, so the tight tabs reach 440px.
  assert.match(css, /@media \(max-width: 440px\)\s*\{\s*\.stageBar \.segBtn\s*\{\s*padding:\s*0 10px/);
});

test("create tabs: Site is not a Create sub-tab; Site URLs redirect to App", () => {
  const studio = readFileSync("src/components/create/CreateStudio.tsx", "utf8");
  assert.doesNotMatch(studio, /tab\("site"/);
  // SiteBuilder may still mount for resume/remix handoff, but never as a tab.
  assert.match(studio, /tab\("app", "App"\)/);
  const cfg = readFileSync("next.config.ts", "utf8");
  assert.match(cfg, /source:\s*"\/create\/site"/);
  assert.match(cfg, /source:\s*"\/app\/create\/site"/);
  assert.match(cfg, /key:\s*"tab",\s*value:\s*"site"/);
});
