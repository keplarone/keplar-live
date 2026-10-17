import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");

test("liquid glass: every glass surface has fallbacks (no backdrop-filter, reduced transparency, low power) and a mobile limit", () => {
  const css = read("src/styles/glass.css");
  assert.match(css, /@supports not \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\)/);
  assert.match(css, /prefers-reduced-transparency: reduce/);
  assert.match(css, /prefers-contrast: more/);
  assert.match(css, /data-glass="lite"/);
  assert.match(css, /max-width: 899px\), \(pointer: coarse\)/, "mobile / coarse pointers get a smaller blur and no lens");
  // The refraction filter is only referenced behind html[data-lens], which GlassCaps sets for Chromium on large, fine-pointer screens.
  assert.match(css, /html\[data-lens\] \.lg-lens/);
  const caps = read("src/components/glass/GlassCaps.tsx");
  assert.match(caps, /prefers-reduced-transparency/);
  assert.match(caps, /id="lg-refract"/);
});

test("dark (the Space theme) is the default and Light / Auto stay selectable", () => {
  // Space UI decision (docs/design/space-ui.md): black space is the default look; Light is the same system on paper.
  assert.match(read("src/lib/theme.ts"), /DEFAULT_THEME_PREF: ThemePref = "dark"/);
  const ctl = read("src/components/theme/ThemeControl.tsx");
  for (const id of ["dark", "light", "auto"]) assert.match(ctl, new RegExp(`id: "${id}"`));
});

test("typing feel: text boxes are native, the hero box is uncontrolled and the undo-splitting write is guarded", () => {
  const hero = read("src/components/home/OrbHero.tsx");
  const prompt = hero.slice(hero.indexOf("function HeroPrompt"), hero.indexOf("export function OrbHero"));
  assert.ok(!/\bvalue=\{/.test(prompt), "hero textarea must stay uncontrolled so React never rewrites it");
  assert.match(prompt, /<textarea/);
  const composer = read("src/components/app-ui/Composer.tsx");
  assert.ok(!/defaultValue=""/.test(composer), "composer must not re-sync defaultValue (splits native undo)");
  assert.match(composer, /field-sizing/);
  const feel = read("src/components/glass/TypingFeel.tsx");
  assert.match(feel, /HTMLTextAreaElement\.prototype/);
  assert.match(read("src/app/layout.tsx"), /<TypingFeel \/>/);
  const g = read("src/styles/globals.css");
  assert.match(g, /caret-color/);
  assert.match(g, /::selection/);
  assert.ok(!/animation[^;]*(bounce|wobble)/i.test(g), "no bouncing letters or caret effects");
});

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const mix = (fg: string, a: number, bg: string) => "#" + [1, 3, 5].map((i) => Math.round(parseInt(fg.slice(i, i + 2), 16) * a + parseInt(bg.slice(i, i + 2), 16) * (1 - a)).toString(16).padStart(2, "0")).join("");
const ratio = (x: string, y: string) => { const [a, b] = [lum(x), lum(y)].sort((m, n) => n - m); return (a + 0.05) / (b + 0.05); };

test("glass buttons: primary is graphite (light) / white (dark), AA+ text, never SaaS blue", () => {
  const css = read("src/styles/glass.css");
  // Space UI: the glass-button tokens are Space Studio's 3D faces (space.css): an ink face in light, the white face in dark.
  assert.match(css, /--btn-p-bg:\s*var\(--space-p-face\)/);
  assert.match(css, /--btn-p-solid:\s*#17171a/);
  assert.ok(ratio("#ffffff", "#17171a") >= 7, `light primary = ${ratio("#ffffff", "#17171a").toFixed(2)}`);
  const space = read("src/styles/space.css");
  assert.match(space, /:root \{[\s\S]*?--space-p-face: linear-gradient\(180deg, #3a3a42 0%, #1d1d22 55%, #0e0e12 100%\);[\s\S]*?--space-p-ink: #ffffff;/);
  assert.match(space, /:root\[data-theme="dark"\] \{[\s\S]*?--space-p-face: linear-gradient\(180deg, #ffffff 0%, #ececf2 55%, #d9d9e2 100%\);[\s\S]*?--space-p-ink: #000000;/);
  for (const face of ["#3a3a42", "#1d1d22", "#0e0e12"]) assert.ok(ratio("#ffffff", face) >= 7, `light 3D face ${face}`);
  for (const face of ["#ffffff", "#ececf2", "#d9d9e2"]) assert.ok(ratio("#000000", face) >= 12, `dark 3D face ${face}`);
  assert.ok(ratio("#09090b", "#ffffff") >= 12);
  assert.ok(ratio("#09090b", "#f4f4f5") >= 12);
  // secondary glass: ink text on the clear fill over white and over a pale page wash
  assert.ok(ratio("#09090b", mix("#ffffff", 0.42, "#e8f4f8")) >= 12);
  // every module that adopts the glass buttons also carries reduced-transparency / reduced-motion fallbacks
  // (the /app shell and the shared page Button left glass in UI v2: their controls are solid, see interface-overhaul.test.ts)
  for (const f of ["src/components/business/business.module.css"]) {
    const c = read(f);
    assert.match(c, /prefers-reduced-transparency: reduce/);
  }
  // UI v2: the shared page Button is solid (no glass at all), so it needs no transparency fallback.
  assert.doesNotMatch(read("src/components/ui/Button.module.css").replace(/\/\*[\s\S]*?\*\//g, ""), /backdrop-filter/);
});

test("field particles: denser tiers, ambient motes, and a frame-budget density governor", () => {
  const eng = read("src/field/engine.ts");
  assert.match(eng, /high: \{ dust: 18000/);
  assert.match(eng, /buildStrands/);
  assert.match(eng, /adaptDensity/);
  assert.match(eng, /setDrawRange/);
});

test("buttons default to a rounded rectangle (not a sitewide pill); cards keep their doubled-class radius, and the rule never touches accordion summaries", () => {
  const css = read("src/styles/glass.css");
  const rule = css.slice(css.indexOf("Shape system: pill only where it is wanted"));
  assert.match(rule, /:where\(button, \[role="button"\], \[role="tab"\], \[role="switch"\][^)]*\)[^{]*\{\s*border-radius: var\(--shape-control\);/);
  assert.doesNotMatch(rule.slice(rule.indexOf(":where("), rule.indexOf("{", rule.indexOf(":where("))), /summary/);
  assert.match(read("src/components/app-ui/App.module.css"), /\.homeTile\.homeTile, \.useForOption\.useForOption \{ border-radius: 22px; \}/);
  // UI v2: the pipeline stage tabs keep the card radius through the doubled class, now as the --shape-card token (22px).
  assert.match(read("src/components/sections/KeplarOnePipeline.module.css"), /\.tab\.tab \{[^}]*border-radius: var\(--shape-card\);/);
});
