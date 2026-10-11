import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { DESKTOP_SCRIPT } from "../src/lib/desktop";

test("desktop window: the site nav keeps clear of the window controls even where env(titlebar-area-*) is not exposed", () => {
  // The script records which side the controls are on.
  assert.match(DESKTOP_SCRIPT, /data-desktop-os/);
  assert.match(DESKTOP_SCRIPT, /\/Mac\/\.test\(n\.platform\|\|n\.userAgent\)\?"mac":"other"/);
  const css = readFileSync("src/components/chrome/Nav.module.css", "utf8");
  // Before: env(titlebar-area-width, 100vw) kept 0px when env() was missing, and the Try/Open Keplar pill sat under the controls.
  assert.match(css, /env\(titlebar-area-width, calc\(100vw - 146px\)\)/, "Windows/Linux fallback keeps room for minimise, maximise, close");
  assert.match(css, /html\[data-desktop-os="mac"\]\) \.wrap \{\s*padding-left: max\(84px/, "macOS keeps the traffic lights clear on the left");
});

test("desktop window: the floating Stats pill and its dock are gone", () => {
  assert.doesNotMatch(readFileSync("src/app/layout.tsx", "utf8"), /DesktopDock/);
  assert.equal(existsSync("src/components/desktop/DesktopDock.tsx"), false);
});
