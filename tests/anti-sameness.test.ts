import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { briefToPrompt, buildBrief, normalizeBrief } from "@/lib/site-builder/brief";
import { DIRECTIONS } from "@/lib/site-builder/design";
import { closest, fingerprintOf, recentRecipeTokens, repeatedSiblings, samenessFinding, sectionsOf, similarity, stockFindings, type FingerprintRow } from "@/lib/site-builder/sameness";
import { ERRORS, LAYOUTS, makeRecipe, normalizeRecipe, recipeSummary, recipeToPrompt, recipeTokens, vocabOf } from "@/lib/site-builder/variation";

const STOCK = `<!doctype html><html><head><title>x</title></head><body><header class="k-header"></header><main id="main">
<section class="k-section k-hero"><div class="k-wrap"><h1>Build faster</h1><p>Welcome</p><a class="k-btn" href="#">Start</a></div></section>
<section class="k-section"><div class="k-wrap"><div class="k-grid">
<div class="card"><h3>A</h3><p>a</p></div><div class="card"><h3>B</h3><p>b</p></div><div class="card"><h3>C</h3><p>c</p></div></div></div></section>
<section class="k-section k-accent-band"><div class="k-wrap"><h2>Ready?</h2><a class="k-btn k-btn--accent" href="#">Get started</a></div></section>
</main><footer class="k-footer"></footer></body></html>`;

const DISTINCT = `<!doctype html><html><head><title>x</title></head><body><header class="k-header"></header><main id="main">
<section class="k-section k-hero"><div class="k-wrap"><h1>Bread, before the street wakes</h1><p>Bakes from 4 a.m.</p></div></section>
<section class="k-section"><div class="k-wrap"><dl class="kt-ticket"><dt>Mon</dt><dd>Closed</dd><dt>Tue</dt><dd>7 to 2</dd></dl></div></section>
<section class="k-section k-invert"><div class="k-wrap"><ol class="k-index"><li>Rye</li><li>Seeded</li></ol></div></section>
<section class="k-section"><div class="k-wrap"><div class="kt-board"><p>Find us on Mill Lane</p></div></div></section>
</main><footer class="k-footer"></footer></body></html>`;

test("sections and repeated siblings are read from the markup", () => {
  assert.equal(sectionsOf(STOCK).length, 3);
  const mid = sectionsOf(STOCK)[1];
  assert.equal(repeatedSiblings(mid.html), 3);
  assert.ok(repeatedSiblings(sectionsOf(DISTINCT)[2].html) <= 1);
});

test("stock hero + equal cards + closing CTA is an error; a composed home page is not", () => {
  const bad = stockFindings({ "index.html": STOCK, "styles.css": "a{}" });
  assert.ok(bad.some((f) => f.code === "stock-hero-cards-cta" && f.severity === "error"));
  const good = stockFindings({ "index.html": DISTINCT, "styles.css": "a{}" });
  assert.ok(!good.some((f) => f.code === "stock-hero-cards-cta"));
});

test("default fonts, centered-everything, generic headings and a missing 404 are flagged", () => {
  const css = ":root{--x:1}\n.a{font-family:Inter,sans-serif}" + ".b{text-align:center}".repeat(6);
  const r = makeRecipe({ seed: "t1", kind: "restaurant", direction: "craft" });
  const f = stockFindings({ "index.html": `<main><h2>Features</h2><h2>Why choose us</h2></main>`, "styles.css": css }, { recipe: r });
  const codes = f.map((x) => x.code);
  for (const c of ["default-font", "centered-everything", "generic-headings", "no-error-page", "no-project-vocabulary"]) assert.ok(codes.includes(c), c);
});

test("recipes: deterministic per seed, varied across seeds, only known ids survive, steered away from recent options", () => {
  const a = makeRecipe({ seed: "alpha", kind: "shop", direction: "organic" });
  assert.deepEqual(a, makeRecipe({ seed: "alpha", kind: "shop", direction: "organic" }));
  const seen = new Set<string>();
  for (let i = 0; i < 40; i++) seen.add(recipeTokens(makeRecipe({ seed: `s${i}`, kind: "saas", direction: "technical" })).join("|"));
  assert.ok(seen.size >= 30, `only ${seen.size} distinct recipes out of 40`);
  const bogus = normalizeRecipe({ ...a, layout: "<script>", nav: "nope", vocab: "x", fontDisplay: "block" }, a)!;
  assert.equal(bogus.layout, a.layout);
  assert.equal(bogus.nav, a.nav);
  assert.equal(bogus.fontDisplay, a.fontDisplay);
  // avoidance: with every layout but one marked as recently used, the free one wins most of the time
  const avoid = LAYOUTS.slice(1).map((l) => `layout:${l.id}`);
  let free = 0;
  for (let i = 0; i < 60; i++) if (makeRecipe({ seed: `v${i}`, kind: "other", direction: "swiss", avoid }).layout === LAYOUTS[0].id) free++;
  assert.ok(free > 30, `avoidance too weak: ${free}/60`);
  assert.equal(recipeSummary(a).length, 7);
  assert.ok(ERRORS.length >= 4);
});

test("the recipe rides in the brief prompt and is validated on the way in", () => {
  const recipe = makeRecipe({ seed: "brief", kind: "restaurant", direction: "craft", tone: ["Warm and friendly"] });
  const brief = { ...buildBrief("A cafe called Fig & Oat"), recipe };
  const prompt = briefToPrompt(brief, 6);
  assert.match(prompt, /STRUCTURE RECIPE/);
  assert.ok(prompt.includes(`prefix "${vocabOf(recipe.vocab).prefix}-"`));
  assert.match(prompt, /404\.html/);
  const round = normalizeBrief(JSON.parse(JSON.stringify(brief)));
  assert.deepEqual(round.recipe, recipe);
  const hostile = normalizeBrief({ ...brief, recipe: { ...recipe, layout: "x".repeat(300) } }, brief);
  assert.equal(hostile.recipe?.layout, recipe.layout);
  assert.ok(recipeToPrompt(recipe).length < 3500);
});

test("mood board: only valid hex colors and http(s) links are kept", () => {
  const b = normalizeBrief({ name: "x", mood: { colors: ["#AABBCC", "red", "#12345", "#001122"], links: ["https://example.com/a", "javascript:alert(1)", "http://x.test"], notes: "quiet\u0007 and warm" } });
  assert.deepEqual(b.mood?.colors, ["#aabbcc", "#001122"]);
  assert.deepEqual(b.mood?.links, ["https://example.com/a", "http://x.test"]);
  assert.equal(b.mood?.notes, "quiet and warm");
  assert.match(briefToPrompt(b, 4), /Mood board colors/);
});

test("fingerprints: identical structure scores high, a different one low; the library flags near-copies", () => {
  const rec = makeRecipe({ seed: "fp", kind: "restaurant", direction: "craft" });
  const a = fingerprintOf({ "index.html": STOCK }, { direction: "craft", accent: "#c8402a", recipe: rec });
  const same = fingerprintOf({ "index.html": STOCK }, { direction: "craft", accent: "#c8402a", recipe: rec });
  const other = fingerprintOf({ "index.html": DISTINCT }, { direction: "noir", accent: "#3a6b4e", recipe: makeRecipe({ seed: "zzz", kind: "saas", direction: "noir" }) });
  assert.ok(similarity(a, same) > 0.99);
  assert.ok(similarity(a, other) < 0.5, String(similarity(a, other)));
  const lib: FingerprintRow[] = [{ id: "1", workspaceId: "system", createdAt: new Date().toISOString(), kind: "restaurant", direction: "craft", tokens: same }];
  const hit = closest(a, lib);
  assert.ok(samenessFinding(hit.score));
  assert.equal(samenessFinding(closest(other, lib).score), null);
  assert.deepEqual(Object.keys(lib[0].tokens).sort(), ["base", "custom", "recipe", "structure"]);
  // content-free: no visible text in a fingerprint
  assert.ok(!JSON.stringify(a).includes("Build faster"));
});

test("recent recipe tokens only include options used at least twice", () => {
  const mk = (layout: string, i: number): FingerprintRow => ({ id: String(i), workspaceId: "system", createdAt: new Date(Date.now() - i * 1000).toISOString(), kind: "x", direction: "swiss", tokens: { structure: [], custom: [], base: [], recipe: [`layout:${layout}`, `nav:top-bar`] } });
  const out = recentRecipeTokens([mk("ledger", 1), mk("ledger", 2), mk("timeline", 3)]);
  assert.ok(out.includes("layout:ledger") && !out.includes("layout:timeline"));
  assert.ok(DIRECTIONS.length >= 8);
});
