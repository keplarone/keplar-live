import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/** Static guard for "no focus box": the browser-level check is e2e/no-focus-box.e2e.ts. */
const css = (p: string) => readFileSync(p, "utf8");

test("global: no outline on focus, no tap-highlight box, forced-colors keeps the system outline", () => {
  const g = css("src/styles/globals.css");
  assert.match(g, /-webkit-tap-highlight-color:\s*transparent/);
  assert.match(g, /@media not \(forced-colors: active\)\s*\{[\s\S]*:focus, :focus-visible \{ outline: none !important; \}/);
  assert.match(g, /filter: var\(--focus-filter\)/);
  assert.match(css("src/styles/mobile.css"), /forced-colors: active[\s\S]*:focus-visible \{\s*outline: 2px solid Highlight/);
  for (const t of ["--focus-filter"]) assert.ok(css("src/styles/tokens.css").split(t).length >= 3, "defined for light and dark");
});

test("no container shows a ring just because a button inside it was pressed", () => {
  const files = ["src/styles/glass.css", "src/components/app-ui/Composer.module.css", "src/components/app-ui/App.module.css", "src/components/sky/Sky.module.css", "src/components/landing/LiveDemo.module.css", "src/components/templates/Templates.module.css"];
  for (const f of files) assert.ok(!/(^|\n)[^\n{}]*:focus-within\s*\{[^}]*(box-shadow|outline)/.test(css(f)), `${f}: :focus-within draws a ring`);
});

test("no click shock ring", () => {
  assert.ok(!/fx-shock|data-shock/.test(css("src/styles/lit.css")));
  assert.ok(!/data-shock/.test(readFileSync("src/components/ui/ButtonFx.tsx", "utf8")));
});

test("card/plan hover lifts only: no ring or glow box", () => {
  const p = css("src/styles/polish.css");
  assert.ok(!/__plan"\]\)[^{]*:hover\s*\{[^}]*box-shadow/.test(p));
});
