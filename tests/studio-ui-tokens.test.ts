import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DURATION, springLinear } from "@/components/kit/motion";

const UI = join(__dirname, "../src/components/kit");
const css = readFileSync(join(UI, "tokens.module.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** The declaration block that follows a selector (first match). */
function block(selectorStart: string): Record<string, string> {
  const i = css.indexOf(selectorStart);
  assert.ok(i >= 0, `selector ${selectorStart} not found`);
  const open = css.indexOf("{", i);
  const close = css.indexOf("}", open);
  const out: Record<string, string> = {};
  for (const m of css.slice(open + 1, close).matchAll(/(--ks-[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const light = block(".root {");
const dark = block(':global(:root[data-theme="dark"]) .root');
const forcedLight = block(':global(:root) .root.root[data-ks-theme="light"]');

type RGBA = [number, number, number, number];
function parseColor(v: string): RGBA {
  const hex = v.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgb = v.match(/^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*(?:\/\s*([\d.]+))?\s*\)$/);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] ? Number(rgb[4]) : 1];
  throw new Error(`unparsed colour ${v}`);
}
const over = (fg: RGBA, bg: RGBA): RGBA => [0, 1, 2].map((k) => fg[k] * fg[3] + bg[k] * (1 - fg[3])).concat(1) as RGBA;
const lum = ([r, g, b]: RGBA) =>
  [r, g, b].map((c) => (c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4).reduce((s, c, k) => s + c * [0.2126, 0.7152, 0.0722][k], 0);
function contrast(fg: string, bg: string, base: string, theme: Record<string, string>): number {
  const b = over(parseColor(theme[bg] ?? bg), parseColor(theme[base]));
  const f = over(parseColor(theme[fg]), b);
  const [l1, l2] = [lum(f), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const COLOR_TOKENS = Object.keys(dark);

test("both themes define the same colour tokens, and the pinned-light block equals the default light palette", () => {
  for (const k of COLOR_TOKENS) assert.ok(k in light, `light is missing ${k}`);
  for (const k of COLOR_TOKENS) assert.equal(forcedLight[k], light[k], `pinned light ${k}`);
  assert.deepEqual(Object.keys(forcedLight).sort(), COLOR_TOKENS.slice().sort());
  assert.ok(COLOR_TOKENS.length >= 40);
});

test("the accent is the site's genuine theme accent (src/styles/tokens.css --c-accent)", () => {
  const site = readFileSync(join(__dirname, "../src/styles/tokens.css"), "utf8");
  const lightAccent = site.match(/:root \{[\s\S]*?--c-accent:\s*(#[0-9a-f]{6})/i)?.[1];
  const darkAccent = site.match(/:root\[data-theme="dark"\] \{[\s\S]*?--c-accent:\s*(#[0-9a-f]{6})/i)?.[1];
  assert.equal(light["--ks-accent"], lightAccent);
  assert.equal(dark["--ks-accent"], darkAccent);
});

test("WCAG AA (4.5:1) for every text level on every surface, in both themes", () => {
  for (const [name, t] of [["light", light], ["dark", dark]] as const) {
    const surfaces = ["--ks-bg", "--ks-surface-1", "--ks-surface-2", "--ks-surface-3", "--ks-surface-inset"];
    const fills = ["--ks-fill-hover", "--ks-fill-active", "--ks-fill-selected"];
    for (const fg of ["--ks-text-1", "--ks-text-2", "--ks-text-3"]) {
      for (const s of surfaces) assert.ok(contrast(fg, s, s, t) >= 4.5, `${name} ${fg} on ${s}: ${contrast(fg, s, s, t).toFixed(2)}`);
      for (const f of fills) for (const s of ["--ks-surface-1", "--ks-surface-2"]) {
        const c = contrast(fg, f, s, t);
        assert.ok(c >= 4.5, `${name} ${fg} on ${f} over ${s}: ${c.toFixed(2)}`);
      }
    }
    for (const fg of ["--ks-success", "--ks-warning", "--ks-danger", "--ks-info", "--ks-accent-text"]) {
      for (const s of ["--ks-bg", "--ks-surface-1", "--ks-surface-2", "--ks-surface-3"]) {
        const c = contrast(fg, s, s, t);
        assert.ok(c >= 4.5, `${name} ${fg} on ${s}: ${c.toFixed(2)}`);
      }
    }
    // badge text on its own subtle tint
    for (const tone of ["success", "warning", "danger", "info"]) {
      const c = contrast(`--ks-${tone}`, `--ks-${tone}-subtle`, "--ks-surface-1", t);
      assert.ok(c >= 4.5, `${name} ${tone} badge: ${c.toFixed(2)}`);
    }
    assert.ok(contrast("--ks-accent-text", "--ks-accent-subtle", "--ks-surface-1", t) >= 4.5, `${name} accent badge`);
    assert.ok(contrast("--ks-primary-text", "--ks-primary-bg", "--ks-bg", t) >= 4.5, `${name} primary button`);
    assert.ok(contrast("--ks-primary-text", "--ks-primary-bg-hover", "--ks-bg", t) >= 4.5, `${name} primary hover`);
    assert.ok(contrast("--ks-danger-ink", "--ks-danger-solid", "--ks-bg", t) >= 4.5, `${name} danger button`);
    assert.ok(contrast("--ks-accent-ink", "--ks-accent", "--ks-bg", t) >= 4.5, `${name} text on accent`);
    // code on diff backgrounds
    for (const d of ["--ks-diff-add-bg", "--ks-diff-del-bg", "--ks-diff-add-emph", "--ks-diff-del-emph"]) {
      const c = contrast("--ks-text-1", d, "--ks-surface-inset", t);
      assert.ok(c >= 4.5, `${name} code on ${d}: ${c.toFixed(2)}`);
    }
  }
});

test("dark surfaces are layered graphite, not one solid black", () => {
  const ls = ["--ks-bg", "--ks-surface-1", "--ks-surface-2", "--ks-surface-3"].map((k) => lum(parseColor(dark[k])));
  for (let i = 1; i < ls.length; i++) assert.ok(ls[i] > ls[i - 1], "each dark layer is lighter than the one below");
  assert.notEqual(dark["--ks-bg"], "#000000");
});

test("motion tokens: CSS durations match motion.ts, spring is the generated no-overshoot curve", () => {
  const map: Record<string, number> = {};
  for (const m of css.matchAll(/--ks-dur-(\w+):\s*(\d+)ms;/g)) if (!(m[1] in map)) map[m[1]] = Number(m[2]);
  assert.deepEqual(map, { ...DURATION });
  const spring = css.match(/--ks-ease-spring:\s*(linear\([^)]*\));/)?.[1];
  assert.equal(spring, springLinear());
  const pts = springLinear().slice(7, -1).split(",").map(Number);
  assert.equal(pts[0], 0);
  assert.equal(pts[pts.length - 1], 1);
  for (let i = 1; i < pts.length; i++) assert.ok(pts[i] >= pts[i - 1] && pts[i] <= 1, "monotonic, never past 1 (no overshoot)");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*--ks-dur-morph: 0ms/);
});

test("Studio UI stylesheets carry no glass, blur, gradients or glow, and dodge the site's forced button shadow", () => {
  const files = readdirSync(UI, { recursive: true }).map(String).filter((f) => f.endsWith(".css"));
  assert.ok(files.length >= 5);
  for (const f of files) {
    const src = readFileSync(join(UI, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(src, /backdrop-filter|blur\(|gradient\(|drop-shadow|text-shadow/i, f);
    // redesign.css forces a shadow on buttons whose class contains these; CSS-module class names include the local name
    for (const m of src.matchAll(/\.([a-zA-Z][\w-]*)/g)) {
      const name = m[1];
      if (/^\d/.test(name)) continue;
      assert.doesNotMatch(name, /btn|button|cta|^primary|^secondary|^ghost|^go$|^pill|Pill|^chip|Chip|^tab|toggleItem/i, `${f}: .${name}`);
    }
    assert.doesNotMatch(f, /btn|button|cta/i, `file name ${f} would leak into class names`);
  }
});
