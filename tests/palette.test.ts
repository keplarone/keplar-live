import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Palette: graphite base + rich semantic accents (teal/cyan, warm earth, dusty rose).
 * Still banned: generic AI-SaaS electric blues and purple spam. Primary buttons stay ink/white.
 * Customer site-builder palettes and legal copy are out of scope.
 */
const SKIP = [/src\/lib\/site-builder/, /src\/lib\/legal/, /src\/components\/legal\/content/];
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n).replace(/\\/g, "/"); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk("src").filter((f) => /\.(css|ts|tsx)$/.test(f) && !SKIP.some((r) => r.test(f)));

/** Named SaaS / Material blues that must never reappear as brand accents. */
const BLUE_HEX = /#(?:2f63e8|2457d6|1c3f9e|16348f|4f7cec|3b6be0|6e92ef|8aa9ff|7a9eff|9bb7ff|8db8ff|6a92ff|cfdcff|3f66cf|b9ccff|9db9ff|82a6ff|a6c0ff|e4edff|5f84dc|3d6fe0|2f62d8|1f4fc0|153a9a|12275f|eef3ff|6c93ff|b2c8ff|88a8ff|0a84ff|007aff|3b82f6|2563eb|1d4ed8)\b/i;
const BLUE_RGB = /\b(?:36 87 214|47 99 232|138 169 255|122 158 255)\b|rgba?\(\s*(?:36|47|138|122)\s*,\s*(?:87|99|169|158)\s*,\s*(?:214|232|255)/;
/** Purple / violet spam (brand must not drift here). */
const PURPLE_HEX = /#(?:7c3aed|8b5cf6|a855f7|9333ea|6d28d9|5b21b6|c084fc|e9d5ff|6366f1|4f46e5|818cf8)\b/i;

test("no SaaS electric-blue or purple spam in app/marketing styles", () => {
  const hits: string[] = [];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    src.split("\n").forEach((line, i) => {
      if (BLUE_HEX.test(line) || BLUE_RGB.test(line) || PURPLE_HEX.test(line)) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(hits, []);
});

test("primary buttons stay graphite (ink) / white; semantic accents may be coloured", () => {
  const css = readFileSync("src/styles/glass.css", "utf8");
  const light = css.match(/--btn-p-solid: (#[0-9a-f]{6});/i)?.[1] ?? "";
  assert.equal(light.toLowerCase(), "#17171a");
  const tokens = readFileSync("src/styles/tokens.css", "utf8");
  // One neutral accent: dark graphite in light, near-white in dark (src/styles/tokens.css).
  assert.match(tokens, /--c-accent: #17171a;/);
  assert.match(tokens, /:root\[data-theme="dark"\] \{[\s\S]*?--c-accent: #f4f4f6;/);
  assert.match(tokens, /--v-reasoning: #00c0e0;/);
  assert.match(tokens, /--v-creation: #d4894a;/);
});

test("scene engine particle palette stays grey (chromatic planets live in space layer only)", () => {
  const eng = readFileSync("src/field/scene-engine.ts", "utf8");
  const block = eng.match(/const PALETTE = \{([\s\S]*?)\};/)?.[1] ?? "";
  const hexes = [...block.matchAll(/#([0-9a-f]{6})/gi)].map((m) => m[1]);
  assert.equal(hexes.length, 16);
  for (const h of hexes) {
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 12, `#${h} is a grey`);
  }
});

test("no electric blue-dominant spam (teal OK: green channel stays close to blue)", () => {
  /** Ban when blue clearly dominates green (SaaS blue). Teal/cyan (g ≈ b) and warm earth pass. */
  const isSpamBlue = (r: number, g: number, b: number) => b - g > 45 && b - r > 80 && g < 140;
  const BRAND = [/ProviderButtons\.tsx$/, /create\/StylePane\.tsx$/, /api\/sites\/\[id\]\/design\/route\.ts$/, /lib\/app-builder\/design\//, /docs-theme\.css$/, /docs\/icon\.svg$/, /icons\/docs-icon\.svg$/];
  // Existing scene accents, status dots and model marks are intentional, not primary brand colors.
  // Keep this exact per-file list so new blue or purple colors still fail the guard.
  const sceneColors: Record<string, string[]> = {
    "src/components/app-ui/App.module.css": ["74,99,184"],
    "src/components/create/images.module.css": ["38,92,140"],
    "src/components/create/video/video.module.css": ["38,92,140"],
    "src/components/kb/blogCovers.ts": ["91,116,201", "66,133,244", "77,107,254"],
    "src/components/sky/MiniDemos.module.css": ["74,99,184"],
    "src/components/sky/SkyHome.tsx": ["74,99,184"],
    // the weather sky: natural daylight sky blues (zenith / gradient), not UI accents (docs/design/space-ui.md 2.1)
    "src/lib/sky/variants.ts": ["63,134,216", "60,130,212"],
    "src/styles/space.css": ["61,132,213"],
  };
  const hits: string[] = [];
  for (const f of files) {
    if (BRAND.some((r) => r.test(f))) continue;
    readFileSync(f, "utf8").split("\n").forEach((line, i) => {
      const found: [number, number, number][] = [];
      for (const m of line.matchAll(/#([0-9a-fA-F]{6})\b/g)) found.push([0, 2, 4].map((k) => parseInt(m[1].slice(k, k + 2), 16)) as [number, number, number]);
      for (const m of line.matchAll(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/g)) found.push([Number(m[1]), Number(m[2]), Number(m[3])]);
      if (found.some(([r, g, b]) => isSpamBlue(r, g, b) && !sceneColors[f]?.includes(`${r},${g},${b}`))) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 90)}`);
    });
  }
  assert.deepEqual(hits, []);
});
