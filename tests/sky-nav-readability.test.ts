import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { CLOUD_CUTOUTS } from "../src/components/sky/clouds/cloud-cutouts";

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
  assert.match(sky, /linear-gradient\(180deg, #161e2c 0%, #2a3848 80%\)/);
  assert.match(sky, /\.landingClouds\[data-sky="css"\] \{ display: none; \}/);
  const scene = read("src/components/sky/clouds/cloud-scene.ts");
  assert.match(scene, /canvas\.dataset\.sky = "css"/);
  assert.match(scene, /canvas\.dataset\.sky = "live"/);
  assert.match(scene, /mode === "still"/);
  const vol = read("src/components/sky/clouds/volumetric.ts");
  assert.doesNotMatch(vol, /#07080c/);
  assert.match(vol, /#243044/);
  assert.match(vol, /fn fbm/);
  assert.match(vol, /fn bank/);
  assert.doesNotMatch(vol, /fn puff/);
  assert.doesNotMatch(vol, /smoothstep\(0\.62, 0\.16, left\)/);
  assert.match(vol, /cover\.value = Math\.min\(1, Math\.max\(0, profile\.gray\)\)/);
  assert.match(vol, /time \* 0\.012/);
  assert.match(vol, /vec2<f32>\(0\.80, 0\.82\)/);
  const webgl = read("src/components/sky/clouds/webgl-clouds.ts");
  assert.doesNotMatch(webgl, /SphereGeometry/);
  assert.match(webgl, /uCover\.value = draw\.gray/);
  assert.doesNotMatch(webgl, /p\.z > -3\.3/);
  assert.match(webgl, /float drift = uTime \* 0\.012/);
  assert.match(webgl, /vec2\(0\.80, 0\.82\)/);
  assert.match(webgl, /col = mix\(col, uBody \* \(1\.0 - crater\), disc \* vis\)/);
  assert.doesNotMatch(webgl, /edge \* \(1\.0 - disc\)/);
  assert.doesNotMatch(webgl, /vec2\(1\.15, 1\.35\)/);
  assert.match(webgl, /gl_Position = vec4\(p, 0\.0, 1\.0\)/);
  assert.doesNotMatch(vol, /edge \* \(1\.0 - disc\)/);
  assert.match(read("src/components/sky/Sky.module.css"), /circle at 80% 18%/);
  assert.match(read("src/styles/globals.css"), /#main \{ position: relative; z-index: 1; isolation: isolate; \}/);
  assert.match(read("src/components/sky/Sky.module.css"), /pointer-events: none/);
  assert.match(read("src/components/sky/Sky.module.css"), /#5d9be8 0%, #b9d8f5 80%/);
  assert.match(webgl, /return \(p\.x \+ drift\) \* lite \* uCover \* 0\.0/);
  assert.match(vol, /return \(p\.x \+ drift\) \* lite \* cover \* 0\.0/);
  const css = read("src/components/sky/Sky.module.css");
  assert.match(css, /@keyframes cloud-drift/);
  assert.match(css, /:global\(:root\[data-theme="dark"\]\) \.cloudImg \{\s*filter:/);
  assert.doesNotMatch(css, /\.h1 \{[^}]*filter:/);
  assert.match(css, /url\("\.\/static-day\.svg"\)/);
  assert.match(css, /url\("\.\/static-night\.svg"\)/);
});

test("cumulus cutouts are CC0, light, and stay off the headline", () => {
  const license = read("public/sky/clouds/LICENSE.md");
  assert.ok(license.includes("CC0 1.0"));
  assert.ok(license.includes("https://opengameart.org/content/clouds-with-transparency"));
  const files = readdirSync("public/sky/clouds").filter((name) => name.endsWith(".webp"));
  assert.equal(files.length, 8);
  const bytes = files.reduce((sum, name) => sum + statSync(`public/sky/clouds/${name}`).size, 0);
  assert.ok(bytes < 400 * 1024, `cutouts are ${bytes} bytes`);
  assert.equal(CLOUD_CUTOUTS.length, 8);
  for (const cloud of CLOUD_CUTOUTS) {
    if (cloud.extra) continue;
    const width = Number.parseFloat(cloud.width);
    const top = Number.parseFloat(cloud.top);
    const start = cloud.left != null
      ? Number.parseFloat(cloud.left)
      : 100 - Number.parseFloat(cloud.right ?? "0") - width;
    const end = start + width;
    if (top < 48) {
      const overlaps = Math.min(end, 70) - Math.max(start, 30);
      assert.ok(overlaps < 4, `${cloud.src} crosses the headline`);
    }
  }
  const deck = read("src/components/sky/clouds/CloudCutouts.tsx");
  assert.match(deck, /loading="lazy"/);
  assert.match(deck, /fetchPriority="low"/);
});

test("day sky is blue at the top and light ink stays AA on it", () => {
  const light = read("src/styles/light.css");
  const block = light.match(/:root\[data-theme="light"\]\s*\{([^}]*)\}/)?.[1] ?? "";
  for (const name of ["--c-ink", "--c-ink-2", "--c-ink-3"]) {
    const hex = block.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`))?.[1];
    assert.ok(hex, name);
    assert.ok(ratio(hex, "#5d9be8") >= 4.5, `${name} on the day zenith`);
    assert.ok(ratio(hex, "#b9d8f5") >= 4.5, `${name} on the day horizon`);
  }
  const day = read("src/components/sky/clouds/palette.ts");
  assert.match(day, /zenith: "#5d9be8", horizon: "#b9d8f5"/);
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
