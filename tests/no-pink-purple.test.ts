import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The accent is one neutral: graphite in light, near-white in dark.
 * Pink, magenta, purple and violet (hue 260–345) and the Tailwind accent utilities must not come back.
 * Detector files list those colours on purpose so they can reject them in generated sites.
 */
const ROOTS = ["src", "extension", "scripts"];
const SKIP_DIR = new Set(["node_modules", ".next", "dist"]);
const SKIP_FILE = [
  /src\/lib\/critic\//,
  /src\/lib\/site-builder\/lint\.ts$/,
  /src\/lib\/app-builder\/rubric\.ts$/,
  /* Space Studio is exempt: violet aura, headline gradient, and focus glow stay. */
  /src\/components\/space\/space\.module\.css$/,
  /src\/components\/space\/SpaceChrome\.tsx$/,
  /src\/components\/space\/Starfield\.tsx$/,
];
const EXT = /\.(css|ts|tsx|js|mjs|svg|html)$/;
const TW = /\b(?:purple|violet|fuchsia|pink|indigo)-\d{2,3}\b/;

function walk(d: string, out: string[] = []): string[] {
  let names: string[];
  try {
    names = readdirSync(d);
  } catch {
    return out;
  }
  for (const n of names) {
    if (SKIP_DIR.has(n)) continue;
    const p = join(d, n).replace(/\\/g, "/");
    if (statSync(p).isDirectory()) walk(p, out);
    else if (EXT.test(p) && !SKIP_FILE.some((r) => r.test(p))) out.push(p);
  }
  return out;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255)) as [number, number, number];
}

/** HSV hue, saturation, and the brightest channel. Near-black casts (max < 40) are not accents. */
function hsv(r: number, g: number, b: number): { h: number; sat: number; max: number } | null {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0 || max === 0) return null;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = Math.round(h * 60);
  if (h < 0) h += 360;
  return { h, sat: d / max, max };
}

const bannedHue = (info: { h: number; sat: number; max: number } | null) =>
  !!info && info.h >= 260 && info.h <= 345 && info.sat >= 0.18 && info.max >= 40;

function coloursIn(line: string): { label: string; rgb: [number, number, number] }[] {
  const found: { label: string; rgb: [number, number, number] }[] = [];
  for (const m of line.matchAll(/#([0-9a-fA-F]{3,8})\b/g)) {
    let hex = m[1];
    if (hex.length === 3 || hex.length === 4) hex = [...hex.slice(0, 3)].map((c) => c + c).join("");
    if (hex.length < 6) continue;
    found.push({
      label: `#${hex.slice(0, 6)}`,
      rgb: [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)],
    });
  }
  for (const m of line.matchAll(/rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/g)) {
    found.push({ label: `rgb(${m[1]} ${m[2]} ${m[3]})`, rgb: [Number(m[1]), Number(m[2]), Number(m[3])] });
  }
  for (const m of line.matchAll(/hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/g)) {
    found.push({ label: `hsl(${m[1]} ${m[2]}% ${m[3]}%)`, rgb: hslToRgb(Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100) });
  }
  return found;
}

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

test("no pink, magenta, purple or violet accents, and no Tailwind purple utilities", () => {
  const hits: string[] = [];
  for (const f of ROOTS.flatMap((r) => walk(r))) {
    readFileSync(f, "utf8").split("\n").forEach((line, i) => {
      if (TW.test(line)) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 120)}`);
      for (const { label, rgb } of coloursIn(line)) {
        const info = hsv(...rgb);
        if (bannedHue(info)) hits.push(`${f}:${i + 1}: ${label} hue ${info!.h}: ${line.trim().slice(0, 100)}`);
      }
    });
  }
  assert.deepEqual(hits, []);
});

test("the rotating greeting name has no [data-model= gradients and no blur(", () => {
  const css = readFileSync("src/styles/gemini.css", "utf8");
  const mod = readFileSync("src/components/app-ui/RotatingModelName.module.css", "utf8");
  assert.doesNotMatch(css, /\[data-model=/);
  assert.doesNotMatch(css, /blur\(/);
  assert.doesNotMatch(mod, /blur\(/);
});

test("the single accent is graphite in light and near-white in dark, at AA", () => {
  const css = readFileSync("src/styles/tokens.css", "utf8");
  const cut = css.indexOf(':root[data-theme="dark"]');
  const light = css.slice(0, cut);
  const dark = css.slice(cut);
  const pick = (block: string, name: string) => block.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, "i"))?.[1]?.toLowerCase() ?? "";
  assert.equal(pick(light, "--c-accent"), "#17171a");
  assert.equal(pick(light, "--c-focus"), "#17171a");
  assert.equal(pick(light, "--c-on-accent"), "#ffffff");
  assert.match(light, /--ring-rgb:\s*23 23 26;/);
  assert.equal(pick(dark, "--c-accent"), "#f4f4f6");
  assert.equal(pick(dark, "--c-focus"), "#f4f4f6");
  assert.equal(pick(dark, "--c-on-accent"), "#17171a");
  assert.match(dark, /--ring-rgb:\s*244 244 246;/);
  assert.ok(ratio("#17171a", "#ffffff") >= 4.5);
  assert.ok(ratio("#17171a", "#f7f8fa") >= 4.5);
  assert.ok(ratio("#ffffff", "#17171a") >= 4.5);
  assert.ok(ratio("#f4f4f6", "#000000") >= 4.5);
  assert.ok(ratio("#f4f4f6", "#0a0a0c") >= 4.5);
  assert.ok(ratio("#17171a", "#f4f4f6") >= 4.5);
});

test("Space Studio keeps its violet aura, headline, and focus glow", () => {
  const css = readFileSync("src/components/space/space.module.css", "utf8");
  const chrome = readFileSync("src/components/space/SpaceChrome.tsx", "utf8");
  assert.match(chrome, /rgb\(176, 104, 255\)/);
  assert.match(css, /#c58cff 0%, #f08bd8/);
  assert.match(css, /background: #c39bff/);
  assert.match(css, /--c-accent: #c39bff/);
  assert.match(css, /--space-focus-glow: 0 0 0 3px rgb\(195 155 255 \/ 0\.55\), 0 0 24px rgb\(176 104 255 \/ 0\.35\)/);
  assert.match(css, /html:has\(\[data-space-root\]\)/);
  const graphite = readFileSync("src/styles/graphite.css", "utf8");
  assert.match(graphite, /outline: 2px solid var\(--c-ink\) !important;/);
  assert.match(graphite, /outline-offset: 2px !important;/);
  assert.match(readFileSync("src/app/(space)/layout.tsx", "utf8"), /Montserrat/);
});
