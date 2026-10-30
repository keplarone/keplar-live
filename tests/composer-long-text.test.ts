import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Owner bug 2026-10-19: a long prompt turned the one-row pill composer into a tall stadium (999px corners around many lines) with the
// text squeezed between the left and right controls, and a second white ring drawn around it on every keystroke.
const css = readFileSync("src/styles/orbit/app.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const tsx = readFileSync("src/components/app-ui/Composer.tsx", "utf8");

test("the one-row pill layout never applies once the text needs a second line", () => {
  assert.match(tsx, /data-multiline=\{multiline \|\| undefined\}/, "the composer marks long text");
  // Orbit (src/styles/orbit/app.css): the one-row layout is a grid with the composer's panel radius; it must carry the guard.
  const pill = [...css.matchAll(/([^{}]+)\{[^{}]*border-radius:\s*(?:999px|var\(--o-r-pill\))[^{}]*\}/g)].map((m) => m[1]).filter((s) => s.includes('__composer"]'));
  for (const s of pill) assert.match(s, /:not\(\[data-multiline\]\)/, `pill rule without the long-text guard: ${s.trim()}`);
  const grid = [...css.matchAll(/([^{}]+)\{[^{}]*grid-template-columns:\s*auto minmax\(0, 1fr\) auto[^{}]*\}/g)].map((m) => m[1]);
  assert.ok(grid.length > 0, "the one-row rule is still there for short text");
  for (const s of grid) assert.match(s, /:not\(\[data-multiline\]\)/, "the three-column row is for one line only");
});

test("typing in the field does not draw the keyboard outline around the composer (the controls still get it)", () => {
  assert.doesNotMatch(css, /form\[class\*="__composer"\]:focus-within:has\(:focus-visible\)\s*\{/);
  assert.match(css, /form\[class\*="__composer"\]:focus-within:has\(:focus-visible:not\(textarea\)\)\s*\{[^}]*outline:\s*2px solid/);
});
