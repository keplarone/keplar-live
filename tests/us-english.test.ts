import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * User-facing copy is US English. This scans the source (comments stripped) for the common British forms so one cannot slip
 * back into the UI, the marketing pages, the starter prompts or the site-builder's output. Identifiers that must keep their
 * spelling (the "cancelled" status value, the glsl `colourFor`, `normalise`, `customised`, `unlabelled-input`) are not words
 * this pattern matches, and the files below are exempt on purpose.
 */
const ROOT = join(import.meta.dirname, "..", "src");
const EXEMPT = new Set([
  "lib/orchestration/english-words.ts", // a word list: British forms are valid words there
  "lib/critic/css.ts", // `grey` is a CSS color keyword the critic must parse in generated pages
  "lib/orchestration/types.ts", // `judgement` / `favoured` are stored field names
  "lib/site-builder/lint.ts", // `labelled` is a local variable, `unlabelled-input` an issue code
  "field/glsl.ts", // `colourFor` is a GLSL function name
  "lib/images/safety.ts", // a place-name word list ("centre" is a real name token)
  "lib/site-builder/coverage.ts", // matches the words a visitor-written brief uses ("enquiry form"); it never shows them
  "components/account/AccountSettings.tsx", // search keywords deliberately include both spellings
]);
const BRITISH = [
  /\bneighbour\w*/gi,
  /\bcolour\w*\b/gi,
  /\bbehaviour\w*/gi,
  /\bfavour\w*/gi,
  /\bhonour\w*/gi,
  /\bflavour\w*/gi,
  /\borganis(?:e|ed|es|ing|ation|ations)\b/gi,
  /\boptimis(?:e|ed|es|ing|ation)\b/gi,
  /\bpersonalis\w+/gi,
  /\bsummaris(?:e|ed|es|ing)\b/gi,
  /\bcentre[sd]?\b/gi,
  /\bcentred\b/gi,
  /\blicences?\b/gi,
  /\benquir\w+/gi,
  /\bgrey\b/gi,
  /\bwhilst\b/gi,
  /\binternationalis\w+/gi,
  /\bCancell(?:ed|ing)\b/g,
  /\bcancelling\b/g,
  /\bprogramme\b/gi,
  /\bcatalogue\b/gi,
  /\bjudgement\b/gi,
];

function files(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(ts|tsx|css|md|mdx)$/.test(n)) out.push(p);
  }
  return out;
}
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");

test("user-facing copy uses US spelling (no neighbourhood, colour, centre, enquiry, cancelled, ...)", () => {
  const hits: string[] = [];
  for (const f of files(ROOT)) {
    const rel = relative(ROOT, f).split("\\").join("/");
    if (EXEMPT.has(rel)) continue;
    // Translated locale catalogs are other languages ("Programme" is French); only messages/<ns>/en.ts is English copy.
    if (/^lib\/i18n\/messages\/[^/]+\/(?!en\.ts$)[^/]+$/.test(rel)) continue;
    const text = stripComments(readFileSync(f, "utf8"));
    for (const re of BRITISH) {
      re.lastIndex = 0;
      for (const m of text.matchAll(re)) hits.push(`${rel}: ${m[0]}`);
    }
  }
  assert.deepEqual(hits, [], "British spellings in user-facing source:\n" + hits.join("\n"));
});

test("the first-run starter prompts say neighborhood", async () => {
  const src = readFileSync(join(ROOT, "lib/onboarding/model.ts"), "utf8");
  assert.match(src, /neighborhood bakery/);
  assert.doesNotMatch(src, /neighbourhood/);
});
