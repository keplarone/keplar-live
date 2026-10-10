import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { DESKTOP_SCRIPT } from "../src/lib/desktop";

const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

test("desktop app: detected before paint (keplar-desktop UA token / html marker), nav padded to the title-bar area, empty chrome opts in to drag", () => {
  assert.match(DESKTOP_SCRIPT, /keplar-desktop/);
  assert.match(DESKTOP_SCRIPT, /data-keplar-desktop/);
  assert.match(DESKTOP_SCRIPT, /Electron\\\//);
  assert.match(DESKTOP_SCRIPT, /windowControlsOverlay/);
  assert.doesNotThrow(() => new Function(DESKTOP_SCRIPT));
  assert.match(read("src/app/layout.tsx"), /DESKTOP_SCRIPT/);
  const nav = read("src/components/chrome/Nav.module.css");
  assert.match(nav, /html:is\(\[data-desktop\], \[data-keplar-desktop\], \.keplar-desktop\)\) \.wrap \{[^}]*padding-left: calc\(env\(titlebar-area-x, 0px\)/);
  assert.match(nav, /padding-right: calc\(100vw - env\(titlebar-area-x, 0px\) - env\(titlebar-area-width, 100vw\)/);
  assert.doesNotMatch(nav, /app-region/); // the app owns the drag band; we only opt in
  const tsx = read("src/components/chrome/Nav.tsx");
  assert.match(tsx, /data-keplar-drag/);
  const app = read("src/components/app-ui/App.module.css");
  assert.match(app, /\.topbar \{[^}]*titlebar-area-width/);
  assert.match(read("src/components/app-ui/KeplarApp.tsx"), /className=\{s\.topbar\} data-keplar-drag/);
});

test("nav: logo pill left, Menu pill centred, theme + Sign in + Try right; real mark at a readable size; no refraction filter", () => {
  const css = read("src/components/chrome/Nav.module.css");
  assert.match(css, /grid-template-columns: 1fr auto 1fr/);
  const tsx = read("src/components/chrome/Nav.tsx");
  assert.doesNotMatch(tsx, /lg-lens/);
  assert.match(tsx, /<KeplarSymbol size=\{22\}/);
});

test("large screens: content, type and the app shell scale with the viewport instead of a small centred box", () => {
  const tokens = read("src/styles/tokens.css");
  assert.match(tokens, /--l-max: clamp\(1360px, 92vw, 3240px\)/);
  // Fluid, not stepped: type is rem + vw (so browser/OS text size still applies) and spacing follows --u; no breakpoint jumps.
  assert.doesNotMatch(tokens, /@media \(min-width: (1800|2400|3200)px\)/);
  assert.match(tokens, /--t-body: max\(clamp\(0\.9375rem, 1\.05vw, 1rem\), min\(1\.875rem,/);
  assert.match(tokens, /--ui-scale:\s*1;/);
  assert.match(tokens, /--u: clamp\(calc\(1px \* var\(--ui-scale\)\),/);
  assert.match(read("src/styles/globals.css"), /font-size:\s*calc\(16px \* var\(--ui-scale\)\)/);
  const app = read("src/components/app-ui/App.module.css");
  assert.match(app, /grid-template-columns: clamp\(264px, 14vw, 400px\) minmax\(0, 1fr\)/);
  assert.doesNotMatch(app.replace(/@media[^{]*\{/g, ""), /max-width: 800px;/);
});
