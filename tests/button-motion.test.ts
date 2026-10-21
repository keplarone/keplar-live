/** keplar.one button motion: the shared ease, a 0.97 press that springs back, menus that rise 4px, and a copy icon that morphs. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");

test("keplar.one shares one ease, presses to 0.97, and steps sidebar rows 2px", () => {
  const g = read("src/styles/graphite.css");
  assert.match(g, /--m-ease-out: cubic-bezier\(0\.2, 0\.8, 0\.2, 1\);/);
  assert.match(g, /scale: 0\.97 !important;/);
  assert.match(g, /transition-duration: 60ms;/);
  assert.match(g, /\[class\*="sideItem"\]:hover \{\s*translate: 2px 0 !important;/);
  assert.match(g, /\[class\*="homeChip"\]:hover \[class\*="homeChipLabel"\] \{\s*translate: 1px 0;/);
  assert.match(g, /prefers-reduced-motion: reduce\)[\s\S]*:active:not\(:disabled\):not\(\[aria-disabled="true"\]\) \{\s*scale: none !important;/);
});

test("menus fade and rise 4px in 120ms on keplar.one; the kit's own rise stays for Space Studio", () => {
  const kit = read("src/components/kit/overlay.module.css");
  assert.match(kit, /\.float \{[^}]*animation: rise/);
  assert.match(kit, /@keyframes kpRise \{ from \{ opacity: 0; transform: translateY\(4px\); \} \}/);
  assert.match(kit, /animation: kpRise 120ms cubic-bezier\(0\.2, 0\.8, 0\.2, 1\) both;/);
  assert.match(kit, /prefers-reduced-motion: reduce\)[\s\S]*\.float \{ animation: none; \}/);
});

test("copy controls morph the icon into a check instead of swapping drawings", () => {
  for (const f of ["src/components/app-ui/KeplarTurn.tsx", "src/components/app-ui/Markdown.tsx"]) {
    assert.match(read(f), /MorphIcon icon="copy" state=\{copied \? "copied" : "idle"\}/, f);
  }
  assert.match(read("src/components/kit/controls.module.css"), /translateY\(-2px\)/);
});
