import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f: string) => readFileSync(f, "utf8");
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

test("nav words are never the element a displacement filter runs on", () => {
  const nav = strip(read("src/components/chrome/Nav.module.css"));
  const tsx = read("src/components/chrome/Nav.tsx");
  assert.match(nav, /\.link, \.word, \.signIn, \.lensLabel \{[^}]*backdrop-filter: none;[^}]*filter: none/);
  assert.doesNotMatch(nav, /\.signIn\[data-distort\]/);
  assert.doesNotMatch(nav, /:is\(\.theme, \.signIn/);
  // The Sign in / Account label is a sibling of the lens, not a child of the filtered node.
  assert.match(tsx, /className=\{s\.lens\} data-glass-pill="" data-distort="" data-glass-chip="" aria-hidden="true" \/>\s*<span className=\{s\.lensLabel\}>/);
  assert.doesNotMatch(tsx, /className=\{s\.signIn\} data-glass-pill/);
  const chips = read("src/components/app-ui/HomeStart.tsx");
  assert.match(chips, /className=\{s\.chipLens\} data-glass-pill="" data-distort="" aria-hidden="true"/);
  assert.doesNotMatch(chips, /className=\{s\.homeChip\}[^>]*data-glass-pill/);
  const app = strip(read("src/components/app-ui/App.module.css"));
  assert.doesNotMatch(app, /\.homeChip\[data-distort\]/);
  assert.doesNotMatch(app, /backdrop-filter:\s*url\(#liquid-glass\)/);
});

test("the site menu is an opaque sheet over a dimmed page", () => {
  const nav = strip(read("src/components/chrome/Nav.module.css"));
  const tsx = read("src/components/chrome/Nav.tsx");
  assert.match(nav, /\.scrim \{[^}]*background: var\(--space-scrim\)/);
  assert.match(nav, /\.sheet \{[^}]*background: var\(--lg-solid\)/);
  assert.match(nav, /\.sheet \{[^}]*backdrop-filter: none/);
  assert.match(nav, /\.sheet \{[^}]*filter: none/);
  assert.match(nav, /\.sheet \{[^}]*border: 1px solid var\(--hairline-strong\)/);
  assert.match(tsx, /className=\{s\.scrim\}/);
  assert.match(nav, /\.bigLinks a:hover, \.smallLinks a:hover \{[^}]*background: var\(--hover-wash\);[^}]*color: var\(--c-ink\)/);
});

test("the app sidebar column is solid and the chat column is the canvas", () => {
  const app = strip(read("src/components/app-ui/App.module.css"));
  assert.match(app, /\.sideWrap \{[^}]*background: var\(--lg-solid\)/);
  assert.match(app, /\.sidebar \{[^}]*background: var\(--lg-solid\)/);
  assert.match(app, /\.main \{ background: var\(--c-canvas\)/);
  assert.match(app, /\.app \{[^}]*background: transparent/);
});
