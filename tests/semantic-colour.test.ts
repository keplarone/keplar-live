import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { semantic } from "../src/lib/tokens";

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

test("every semantic colour is text-safe (>= 4.5:1) on its canvas in both themes", () => {
  for (const theme of ["light", "dark"] as const) {
    const t = semantic[theme];
    for (const [name, hex] of Object.entries(t)) {
      if (name === "canvas") continue;
      assert.ok(ratio(hex, t.canvas) >= 4.5, `${theme} ${name} ${hex} = ${ratio(hex, t.canvas).toFixed(2)}`);
    }
  }
});

test("the CSS custom properties match the TypeScript tokens", () => {
  const css = readFileSync("src/styles/tokens.css", "utf8");
  for (const theme of ["light", "dark"] as const) {
    const block = theme === "light" ? css.slice(0, css.indexOf(':root[data-theme="dark"]')) : css.slice(css.indexOf(':root[data-theme="dark"]'));
    for (const [name, hex] of Object.entries(semantic[theme])) {
      if (name === "canvas") continue;
      const cssName = name === "destructive" ? "destructive" : name;
      assert.match(block, new RegExp(`--c-${cssName}: ${hex};`), `${theme} --c-${cssName}`);
    }
  }
});

import { vivid } from "../src/lib/tokens";
test("vivid hues: ink on each fill is >= 4.5:1, and the CSS variables match TypeScript in both themes", () => {
  const css = readFileSync("src/styles/tokens.css", "utf8");
  const cut = css.indexOf(':root[data-theme="dark"]');
  for (const theme of ["light", "dark"] as const) {
    const block = theme === "light" ? css.slice(0, cut) : css.slice(cut);
    for (const [name, { v, on }] of Object.entries(vivid[theme])) {
      assert.ok(ratio(v, on) >= 4.5, `${theme} ${name} ${v} on ${on} = ${ratio(v, on).toFixed(2)}`);
      assert.match(block, new RegExp(`--v-${name}: ${v};`), `${theme} --v-${name}`);
      assert.match(block, new RegExp(`--on-${name}: ${on};`), `${theme} --on-${name}`);
    }
  }
});
