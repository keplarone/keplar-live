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

test("create tab bars are not a solid canvas (that fill is pure black in dark mode)", () => {
  const studio = readFileSync("src/components/create/apps/studio.module.css", "utf8");
  const kind = studio.match(/\.kindBar \{([^}]*)\}/)?.[1] ?? "";
  assert.match(kind, /background:\s*transparent/);
  assert.doesNotMatch(kind, /--c-canvas/);
  const top = studio.match(/\.top \{([^}]*)\}/)?.[1] ?? "";
  assert.match(top, /background:\s*transparent/);
  assert.match(studio, /\.top \{[^}]*position:\s*sticky[^}]*background:\s*var\(--nav-fill\)/);
  assert.doesNotMatch(studio, /\.top \{[^}]*background:\s*var\(--c-canvas\)/);
  const builder = readFileSync("src/components/create/builder.module.css", "utf8");
  const stage = builder.match(/\.stageBar \{([^}]*)\}/)?.[1] ?? "";
  assert.match(stage, /background:\s*transparent/);
  assert.match(builder, /\.stageBar \{[^}]*position:\s*sticky[^}]*background:\s*var\(--nav-fill\)/);
  assert.doesNotMatch(builder, /\.stageBar \{[^}]*background:\s*var\(--c-canvas\)/);
});

test("create tabs: Site is not a Create sub-tab; Site URLs redirect to App", () => {
  const studio = readFileSync("src/components/create/CreateStudio.tsx", "utf8");
  assert.doesNotMatch(studio, /value: "site"/);
  // SiteBuilder may still mount for resume/remix handoff, but never as a tab. UI v2: the kinds are the kit's Tabs.
  assert.match(studio, /<Tabs id=\{KIND_TABS\} label="Create"/);
  assert.match(studio, /\{ value: "app", label: "App" \}/);
  const cfg = readFileSync("next.config.ts", "utf8");
  assert.match(cfg, /source:\s*"\/create\/site"/);
  assert.match(cfg, /source:\s*"\/app\/create\/site"/);
  assert.match(cfg, /key:\s*"tab",\s*value:\s*"site"/);
});
