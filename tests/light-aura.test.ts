import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The corner aura is gone. The light palette still keeps WCAG AA for body inks.
 */
const root = new URL("../", import.meta.url);
const read = (f: string) => readFileSync(new URL(f, root), "utf8");
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

function cssFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(new URL(dir, root))) {
    const rel = join(dir, name);
    if (statSync(new URL(rel, root)).isDirectory()) cssFiles(rel, acc);
    else if (name.endsWith(".css")) acc.push(rel);
  }
  return acc;
}

test("the aura stylesheet and every aura token are gone", () => {
  assert.equal(existsSync(new URL("src/styles/aura.css", root)), false);
  assert.doesNotMatch(read("src/styles/globals.css"), /aura\.css/);
  for (const f of cssFiles("src")) {
    assert.doesNotMatch(stripComments(read(f)), /--aura-|var\(--aura-/, `${f} still names an aura`);
  }
});

test("the pinned star cluster is gone and the landing clouds follow the MIT technique without a glow pass", () => {
  assert.equal(existsSync(new URL("src/components/sky/particle-scene.ts", root)), false);
  const story = read("src/components/sky/ParticleStory.tsx");
  assert.doesNotMatch(story, /use client|particle-scene|<canvas/);
  assert.match(read("src/app/(marketing)/layout.tsx"), /<MarketingSky \/>/);
  assert.doesNotMatch(read("src/app/layout.tsx"), /SiteClouds|MarketingSky/);
  assert.doesNotMatch(read("src/components/sky/SkyHome.tsx"), /LandingClouds|SiteClouds|<canvas/);
  const dir = new URL("src/components/sky/clouds/", root);
  const files = readdirSync(dir).filter((n) => n.endsWith(".ts") || n.endsWith(".tsx"));
  const src = files.map((n) => readFileSync(new URL(n, dir), "utf8")).join("\n");
  assert.match(src, /procedural-clouds-threejs/);
  assert.match(src, /MIT License/);
  assert.match(src, /Beer-Lambert/);
  assert.match(src, /chooseCloudMode/);
  assert.doesNotMatch(src, /AdditiveBlending|UnrealBloom|godRays|silverLining/);
});

test("light palette: cool off-white canvas and AA inks", () => {
  const light = stripComments(read("src/styles/light.css"));
  const block = light.match(/:root\[data-theme="light"\]\s*\{([^}]*)\}/);
  assert.ok(block);
  const v = (name: string) => {
    const m = block[1].match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, "i"));
    assert.ok(m, `${name} is a hex colour`);
    return m[1];
  };
  const lum = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  assert.equal(v("--c-canvas").toLowerCase(), "#f7f8fa");
  for (const bg of ["--c-canvas", "--c-surface-1", "--c-surface-2"]) {
    for (const ink of ["--c-ink", "--c-ink-2", "--c-ink-3"]) {
      const r = ratio(v(ink), v(bg));
      assert.ok(r >= 4.5, `${ink} on ${bg} = ${r.toFixed(2)}:1 (needs 4.5)`);
    }
  }
  assert.doesNotMatch(light, /data-theme="dark"/);
  assert.match(read("src/lib/theme.ts"), /DEFAULT_THEME_PREF: ThemePref = "dark"/);
});
