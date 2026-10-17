import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (x: string, y: string) => { const [a, b] = [lum(x), lum(y)].sort((m, n) => n - m); return (a + 0.05) / (b + 0.05); };

test("the composer is a solid surface and the chip lens cannot reprint the placeholder", () => {
  const composer = strip(read("src/components/app-ui/Composer.module.css"));
  const theme = composer.slice(composer.indexOf(":global(:root[data-theme]) .composer {"));
  assert.match(theme, /:global\(:root\[data-theme\]\) \.composer \{[^}]*background: var\(--surface-raised\)/);
  assert.match(theme, /:global\(:root\[data-theme\]\) \.composer \{[^}]*filter: none/);
  assert.doesNotMatch(theme, /space-glass-depth/);
  assert.match(read("src/components/app-ui/Composer.tsx"), /data-composer=""/);

  const caps = read("src/components/glass/GlassCaps.tsx");
  assert.match(caps, /id="liquid-glass-chip" x="0%" y="0%" width="100%" height="100%"/);
  assert.match(caps, /id="liquid-glass" x="-50%" y="-120%"/);
  const glass = strip(read("src/styles/glass.css"));
  assert.match(glass, /\[data-glass-chip\]\[data-distort\] \{[^}]*backdrop-filter: url\(#liquid-glass-chip\)/);
  assert.match(glass, /\.lg\[data-lit\]::after \{[^}]*opacity: 0/);
  assert.match(read("src/components/app-ui/HomeStart.tsx"), /data-glass-chip=""/);

  const app = strip(read("src/components/app-ui/App.module.css"));
  assert.match(app, /\.homeChip \{[^}]*overflow: hidden/);
  assert.match(app, /\.dockNote \{[^}]*color: var\(--c-ink-2\)/);
  assert.doesNotMatch(app, /backdrop-filter:\s*url\(#liquid-glass\)/);

  const light = read("src/components/ui/ProximityLight.tsx");
  const fx = read("src/components/ui/ButtonFx.tsx");
  for (const src of [light, fx]) assert.match(src, /data-glass-pill.*data-composer|data-composer.*data-glass-pill/);
});

test("the composer disclaimer holds AA on the canvas in both themes", () => {
  const tokens = read("src/styles/tokens.css");
  const dark = tokens.slice(tokens.indexOf(':root[data-theme="dark"]'));
  const ink2 = (block: string) => block.match(/--c-ink-2:\s*(#[0-9a-fA-F]{6})/)?.[1];
  const lightInk = ink2(tokens);
  const darkInk = ink2(dark);
  assert.ok(lightInk && darkInk);
  assert.ok(ratio(darkInk, "#000000") >= 4.5, `dark disclaimer ${ratio(darkInk, "#000000").toFixed(2)}`);
  assert.ok(ratio(darkInk, "#141417") >= 4.5, `dark on composer ${ratio(darkInk, "#141417").toFixed(2)}`);
  assert.ok(ratio(lightInk, "#ffffff") >= 4.5, `light disclaimer ${ratio(lightInk, "#ffffff").toFixed(2)}`);
});
