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

test("desktop title bar: back, forward and search stay clear of the window controls", () => {
  const tsx = readFileSync("src/components/desktop/DesktopTitleBar.tsx", "utf8");
  assert.match(tsx, /onClick=\{\(\) => history\.back\(\)\}/);
  assert.match(tsx, /onClick=\{\(\) => history\.forward\(\)\}/);
  const css = readFileSync("src/components/desktop/DesktopTitleBar.module.css", "utf8");
  assert.match(css, /env\(titlebar-area-width, calc\(100vw - 146px\)\)/, "Windows/Linux fallback keeps room for minimise, maximise, close");
  assert.match(css, /\.bar\[data-mac\] \{\s*padding-left: max\(84px[^}]*env\(titlebar-area-width, 100vw\)/, "macOS: traffic lights on the left, nothing reserved on the right");
});

test("desktop window: the floating Stats pill and its dock are gone", () => {
  assert.doesNotMatch(readFileSync("src/app/layout.tsx", "utf8"), /DesktopDock/);
  assert.equal(existsSync("src/components/desktop/DesktopDock.tsx"), false);
});

test("the app is the app on the web and in the desktop window (no welcome-back overlay, no home-page backdrop)", () => {
  const app = readFileSync("src/components/app-ui/KeplarApp.tsx", "utf8");
  assert.doesNotMatch(app, /SkyBackdrop/, "the website's moving backdrop never paints behind the workspace");
  assert.doesNotMatch(app, /WelcomeBack/, "no second, site-styled home over the app's own home");
  assert.match(app, /<ResumeChats threads=\{state\.threads\}/, "returning people pick up a chat from the app's own home");
  assert.match(readFileSync("src/lib/desktop.ts", "utf8"), /export const inDesktopApp = \(\) => typeof document !== "undefined" && document\.documentElement\.getAttribute\("data-desktop"\) === "1"/);
});
