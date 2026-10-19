import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// @ts-expect-error: plain .mjs gate script, no type declarations
import { assetsOf as assetsOfJs, overBudget as overBudgetJs } from "../scripts/perf-budget.mjs";

type Sizes = { jsGzip: number; cssGzip: number; cssRaw: number };
const assetsOf = assetsOfJs as (html: string) => { js: string[]; css: string[] };
const overBudget = overBudgetJs as (route: string, m: Sizes, b: Partial<Sizes>) => string[];

test("perf budget: reads the scripts and stylesheets a page references, deduplicated, ignoring other links", () => {
  const html = `<link rel="stylesheet" href="/_next/static/css/a.css" data-precedence="next"/><link rel="preload" as="style" href="/_next/static/css/a.css"/>
    <link rel="preload" as="script" href="/_next/static/chunks/x.js"/><link rel="preload" as="font" href="/_next/static/media/f.woff2"/>
    <link rel="icon" href="/favicon.ico"/><script src="/_next/static/chunks/x.js" async=""></script><script src="/_next/static/chunks/y.js?dpl=1"></script>
    <script>self.__next_f=[]</script><script src="https://example.com/t.js"></script>`;
  assert.deepEqual(assetsOf(html), { js: ["/_next/static/chunks/x.js", "/_next/static/chunks/y.js"], css: ["/_next/static/css/a.css"] });
});

test("perf budget: only measured values above their budget fail, and the message names route, metric and overage", () => {
  const m = { jsGzip: 210 * 1024, cssGzip: 40 * 1024, cssRaw: 300 * 1024 };
  assert.deepEqual(overBudget("/", m, { jsGzip: 200 * 1024, cssGzip: 40 * 1024, cssRaw: 400 * 1024 }), ["/: jsGzip 210.0 KB over budget 200.0 KB (+10.0 KB)"]);
  assert.deepEqual(overBudget("/", m, {}), [], "a route without numbers is measured, not judged");
});

test("perf budget: every tracked route has all three budgets, and the gate runs after the build in CI and verify", () => {
  const conf = JSON.parse(readFileSync("perf-budgets.json", "utf8"));
  assert.ok(Object.keys(conf.routes).length >= 6);
  for (const [route, b] of Object.entries(conf.routes) as [string, Record<string, number>][]) {
    for (const k of ["jsGzip", "cssGzip", "cssRaw"]) assert.ok(Number.isInteger(b[k]) && b[k] > 0, `${route} ${k}`);
  }
  const ci = readFileSync(".github/workflows/ci.yml", "utf8");
  assert.ok(ci.indexOf("node scripts/perf-budget.mjs --start") > ci.indexOf("run: npx next build"), "CI runs the budget after the build");
  assert.match(readFileSync("scripts/verify.mjs", "utf8"), /"scripts\/perf-budget\.mjs", "--start"/);
});
