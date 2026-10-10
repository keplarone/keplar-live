import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * The marketing nav floats over a black stage and over light sections in every theme, so its own glass fill carries the contrast.
 * Every text / ink pair is checked at the WORST backdrop (pure black and pure white behind the translucent fill): alpha compositing is
 * monotonic, so if both extremes pass, every page behind it passes. WCAG AA: 4.5:1 text, 3:1 for the focus ring.
 */
const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const tokens = read("src/styles/tokens.css");

type RGBA = [number, number, number, number];
function block(selector: string): Record<string, string> {
  // the nav section is the last pair of :root blocks in tokens.css; pick the one that defines --nav-fill
  const re = new RegExp(`${selector.replace(/[[\]"]/g, "\\$&")}\\s*\\{([^}]*--nav-fill:[^}]*)\\}`);
  const m = tokens.match(re);
  assert.ok(m, `${selector} nav block exists`);
  const out: Record<string, string> = {};
  for (const d of m[1].matchAll(/(--nav-[\w-]+):\s*([^;]+);/g)) out[d[1]] = d[2].trim();
  return out;
}
function color(v: string): RGBA {
  let m = v.match(/^#([0-9a-f]{6})$/i);
  if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16), 1];
  m = v.match(/^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*([\d.]+))?\s*\)$/);
  assert.ok(m, `parseable color: ${v}`);
  return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
}
const over = (top: RGBA, bottom: RGBA): RGBA => {
  const a = top[3] + bottom[3] * (1 - top[3]);
  const ch = (i: number) => (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / a;
  return [ch(0), ch(1), ch(2), a];
};
const lum = ([r, g, b]: RGBA) => {
  const f = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a: RGBA, b: RGBA) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const BLACK: RGBA = [0, 0, 0, 1];
const WHITE: RGBA = [255, 255, 255, 1];

for (const theme of ["light", "dark"] as const) {
  const t = theme === "light" ? block(":root") : block(':root[data-theme="dark"]');
  for (const [backName, back] of [["black stage", BLACK], ["white section", WHITE]] as const) {
    for (const fillKey of ["--nav-fill", "--nav-fill-scrolled", "--nav-menu-fill", "--nav-sheet"] as const) {
      // the glass sheen (.lg::before) lightens a dark pill by up to ~15% white and darkens a light pill by ~7% ink: allow for it, worst case
      const sheen: RGBA = theme === "dark" ? [255, 255, 255, 0.15] : [23, 23, 26, 0.07];
      const fill = over(sheen, over(color(t[fillKey]), back));
      // --nav-link-2 (menu hints, mobile sub-links) only ever sits on the menu panel / sheet, never on the pill itself
      const panel = fillKey === "--nav-menu-fill" || fillKey === "--nav-sheet";
      const inks = (panel ? ["--nav-ink", "--nav-link", "--nav-link-2"] : ["--nav-ink", "--nav-link"]) as ("--nav-ink" | "--nav-link" | "--nav-link-2")[];
      for (const inkKey of inks) {
        test(`nav ${theme}: ${inkKey} on ${fillKey} over a ${backName} >= 4.5:1`, () => {
          const r = ratio(color(t[inkKey]), fill);
          assert.ok(r >= 4.5, `${r.toFixed(2)}:1`);
        });
      }
      // hover / current-page tints sit on the fill; ink, link and the menu hint must still pass on them
      if (fillKey !== "--nav-sheet") {
        for (const tint of ["--nav-hover-bg", "--nav-active-bg"] as const) {
          for (const inkKey of inks) {
            test(`nav ${theme}: ${inkKey} on ${tint} on ${fillKey} over a ${backName} >= 4.5:1`, () => {
              const bg = over(color(t[tint]), fill);
              assert.ok(ratio(color(t[inkKey]), bg) >= 4.5, `${ratio(color(t[inkKey]), bg).toFixed(2)}:1`);
            });
          }
        }
      }
      test(`nav ${theme}: focus ring on ${fillKey} over a ${backName} >= 3:1`, () => {
        assert.ok(ratio(color(t["--nav-focus"]), fill) >= 3);
      });
    }
  }
  test(`nav ${theme}: the Open Keplar button is an inverse graphite pill with AA text`, () => {
    const stops = [...t["--nav-cta-bg"].matchAll(/#[0-9a-f]{6}/gi)].map((m) => color(m[0]));
    assert.ok(stops.length >= 1, "cta has at least one solid fill");
    for (const s of [...stops, color(t["--nav-cta-solid"])]) assert.ok(ratio(color(t["--nav-cta-ink"]), s) >= 7, "text on button >= 7:1");
    // inverse of the pill: the button is dark on the light pill and light on the dark pill
    const pill = over(color(t["--nav-fill"]), theme === "light" ? BLACK : WHITE);
    assert.ok(ratio(stops[0], pill) >= 3, "button edge separates from the pill");
    assert.equal(lum(stops[0]) < lum(pill), theme === "light");
  });
}

test("nav css: no hard-coded black logo; everything routes through --nav-* tokens, theme comes from <html data-theme> only", () => {
  const css = read("src/components/chrome/Nav.module.css");
  assert.doesNotMatch(css, /:root\[data-theme/, "Nav.module.css has no per-theme overrides: the tokens swap");
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i, "no raw hex colors in the nav stylesheet");
  assert.match(css, /\.brand\s*\{[^}]*color:\s*var\(--nav-ink\)/);
  assert.match(read("src/components/brand/KeplarLogo.tsx"), /fill="currentColor"/, "logo mark + wordmark follow currentColor");
  assert.match(read("src/components/chrome/Nav.tsx"), /className=\{s\.cta\}/);
  // the early theme script is what makes it flash-free: it runs in <head> before any nav paint
  assert.match(read("src/app/layout.tsx"), /THEME_SCRIPT/);
});
