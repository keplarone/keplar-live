/**
 * Design review guards for every Keplar Studio stylesheet (studio-mode/**), not only ui/:
 * - redesign.css gives any <button>/<a> whose class contains btn/button/cta (case-insensitive: "docTab" contains "cTa"),
 *   __primary, __ghost, __tab, Pill, Chip… a heavy shadow and a spring lift. Studio class names must avoid them.
 * - globals.css removes every outline with !important, so a focus style drawn with `outline` is invisible: Studio focus is
 *   a box-shadow ring (--ks-focus-ring).
 * - No blur, gradients or glow.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), "src/components/app-ui/studio-mode");
const sheets = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  return e.isDirectory() ? sheets(p) : e.name.endsWith(".module.css") ? [p] : [];
});
const files = sheets(ROOT);
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

test("studio stylesheets exist", () => assert.ok(files.length >= 8, String(files.length)));

test("no Studio class name triggers redesign.css's forced button shadow", () => {
  for (const f of files) {
    const names = new Set([...strip(fs.readFileSync(f, "utf8")).matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]));
    for (const n of names) {
      assert.doesNotMatch(n, /btn|button|cta/i, `${path.relative(ROOT, f)}: .${n}`);
      assert.doesNotMatch(n, /^(primary|secondary|ghost|go|tab|chip)$|^(tab|pill|chip)[A-Z]|Pill|Chip|toggleItem/, `${path.relative(ROOT, f)}: .${n}`);
    }
  }
});

test("Studio focus styles never rely on outline (globals.css strips outlines)", () => {
  for (const f of files) {
    for (const rule of strip(fs.readFileSync(f, "utf8")).matchAll(/([^{}]*:focus(?:-visible|-within)?[^{}]*)\{([^}]*)\}/g)) {
      assert.doesNotMatch(rule[2], /outline:\s*(?!none)\d/, `${path.relative(ROOT, f)}: ${rule[1].trim()}`);
    }
  }
});

test("no blur, gradient or glow in Studio stylesheets", () => {
  for (const f of files) {
    const css = strip(fs.readFileSync(f, "utf8"));
    assert.doesNotMatch(css, /backdrop-filter:\s*(?!none)|filter:\s*blur|gradient\(|text-shadow:\s*(?!none)/, path.relative(ROOT, f));
  }
});
