import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f: string) => readFileSync(f, "utf8");
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

function lum(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}
function ratio(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

function nightPalette(): { zenith: string; horizon: string; lit: string } {
  const src = read("src/components/sky/clouds/palette.ts");
  const block = src.match(/if \(dark\) \{\s*return \{([^}]+)\}/)?.[1] ?? "";
  const pick = (name: string) => {
    const hex = block.match(new RegExp(`${name}:\\s*"(#[0-9a-f]{6})"`))?.[1];
    assert.ok(hex, name);
    return hex;
  };
  return { zenith: pick("zenith"), horizon: pick("horizon"), lit: pick("lit") };
}

test("dark sky is navy with clouds that stay visible and keep light ink at AA", () => {
  const night = nightPalette();
  assert.ok(lum(night.zenith) > lum("#10141c"), "zenith is not flat black");
  assert.ok(lum(night.horizon) > lum(night.zenith), "the horizon is lighter than the zenith");
  assert.ok(lum(night.lit) > lum(night.horizon), "cloud tops read against the sky");
  assert.ok(ratio("#f4f4f6", night.lit) >= 4.5, "light ink on a night cloud is AA");
  assert.ok(ratio("#f4f4f6", night.horizon) >= 4.5, "light ink on the night horizon is AA");
  const sky = read("src/components/sky/Sky.module.css");
  assert.match(sky, /radial-gradient\(ellipse[\s\S]*#2a4068 0%, #3d5a8a 80%\)/);
  assert.match(sky, /\.landingClouds\[data-sky="css"\] \{ display: none; \}/);
  const scene = read("src/components/sky/clouds/cloud-scene.ts");
  assert.match(scene, /canvas\.dataset\.sky = "css"/);
  assert.match(scene, /canvas\.dataset\.sky = "live"/);
});

test("route snapshots do not crossfade the old page over the new one", () => {
  const motion = strip(read("src/styles/motion.css"));
  assert.match(motion, /@view-transition \{ navigation: auto; \}/);
  assert.match(motion, /::view-transition-old\(root\) \{ animation: none; display: none; \}/);
  assert.match(motion, /::view-transition-old\(\.kp-route-out\) \{ animation: none; display: none; \}/);
  assert.match(motion, /::view-transition-new\(\.kp-route-in\) \{ animation: none; \}/);
  const space = strip(read("src/styles/space.css"));
  assert.match(space, /::view-transition-old\(\.kp-route-out\)[\s\S]*?display: none;/);
  assert.doesNotMatch(space, /animation: sp-vt-out/);
  assert.doesNotMatch(space, /animation: sp-vt-in/);
});

test("scroll reveal does not fade text", () => {
  const css = read("src/styles/globals.css");
  const frames = css.match(/@keyframes kp-reveal \{[\s\S]*?\}/)?.[0] ?? "";
  assert.match(frames, /translate: 0 16px/);
  assert.doesNotMatch(frames, /opacity/);
  assert.match(css, /@supports \(animation-timeline: view\(\)\)\s*\{\s*@media screen and \(prefers-reduced-motion: no-preference\)\s*\{\s*\[data-reveal\]/);
});

test("scrolled nav is a solid bar and small pills use the contained lens", () => {
  const nav = strip(read("src/components/chrome/Nav.module.css"));
  assert.match(nav, /\.wrap\[data-scrolled\] \{[^}]*background: var\(--lg-solid\)/);
  assert.match(nav, /:is\(\.theme, \.weather, \.lens\)\[data-distort\] \{[^}]*backdrop-filter: url\(#liquid-glass-chip\)/);
  assert.doesNotMatch(nav, /url\(#liquid-glass\)/);
  assert.match(nav, /\.links:hover \.link:not\(:hover\):not\(\[aria-current="page"\]\) \{[^}]*opacity: 1/);
  const theme = read("src/components/theme/ThemeToggle.tsx");
  const weather = read("src/components/theme/WeatherToggle.tsx");
  assert.match(theme, /data-glass-chip=""/);
  assert.match(weather, /data-glass-chip=""/);
});

test("pricing cards do not pin their buttons, and the compare table follows the theme", () => {
  const cards = strip(read("src/components/sections/Pricing.module.css"));
  const compare = strip(read("src/components/growth/pricing/pricing.module.css"));
  assert.match(cards, /\.cta \{[^}]*position: static/);
  assert.match(compare, /\.fitCta \{[^}]*position: static/);
  assert.match(compare, /\.scroller \{[^}]*background: var\(--lg-solid\)/);
  assert.match(compare, /\.featureHead,\s*\.feature \{[^}]*background: var\(--lg-solid\)/);
  assert.doesNotMatch(compare, /background: var\(--space-glass-solid\)/);
});

test("the feature hover preview has no blur and no wide dark shadow", () => {
  const sky = strip(read("src/components/sky/Sky.module.css"));
  const frames = sky.match(/@keyframes sky-swap \{[\s\S]*?\}/)?.[0] ?? "";
  assert.doesNotMatch(frames, /blur|filter/);
  const demo = read("src/components/sky/MiniDemos.module.css");
  assert.doesNotMatch(demo, /box-shadow: var\(--space-glass-depth\)/);
  assert.match(demo, /\.win \{[^}]*box-shadow: 0 8px 18px/);
});
