import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * /app sidebar: one flat hover on the solid sidebar. A second backdrop-filter on a row
 * stacked the liquid-glass lens and drew rainbow edges that flashed down the list.
 */
const read = (f: string) => readFileSync(f, "utf8");
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

test("sidebar rows, Recents and the profile chip hover with one flat wash and no lens", () => {
  const app = strip(read("src/components/app-ui/App.module.css"));
  assert.match(app, /\.sidebar \{[^}]*background: var\(--lg-solid\)/);
  assert.match(app, /\.sidebar \{[^}]*backdrop-filter: none/);
  assert.doesNotMatch(app, /\[data-nav[^\]]*\][^{]*\{[^}]*backdrop-filter:\s*url\(#liquid-glass\)/);
  assert.match(app, /\[data-recents-toggle\]:hover\) \{[^}]*background: var\(--hover-wash\)/);
  assert.match(app, /\.threadLink \{[^}]*color: var\(--c-ink\)/);
  assert.doesNotMatch(app, /\.sideItem:hover[^,{]*\{[^}]*backdrop-filter:\s*(blur|url\()/);
  const recents = strip(read("src/components/app-ui/Recents.module.css"));
  assert.match(recents, /\.toggle:hover \{\s*background: var\(--hover-wash\)/);
  assert.doesNotMatch(recents, /rgb\(var\(--rgb-ink\) \/ 0\.04\)/);
  const account = strip(read("src/components/app-ui/AccountMenu.module.css"));
  const chip = account.match(/\.chip \{[^}]*\}/)?.[0] ?? "";
  assert.match(chip, /background: transparent/);
  assert.match(chip, /box-shadow: none/);
  assert.match(account, /\.chip:hover, \.chip\[aria-expanded="true"\] \{ background: var\(--hover-wash\); box-shadow: none; \}/);
  assert.doesNotMatch(account, /backdrop-filter/);
});

test("a narrow header keeps a readable chat title instead of a two-letter stub", () => {
  const css = read("src/components/app-ui/App.module.css");
  assert.match(css, /@media \(max-width: 640px\) \{[\s\S]*?\.dailyLeft \{ display: none !important; \}/);
  assert.match(css, /@media \(max-width: 899px\) and \(min-width: 360px\) \{\s*:global\(:root\[data-theme\]\) \.topTitle \{ min-width: 8rem; \}/);
  assert.match(css, /@media \(max-width: 359px\)\s*\{[\s\S]*?\.topTitle\s*\{\s*visibility:\s*hidden/);
});
