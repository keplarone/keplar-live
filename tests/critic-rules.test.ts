import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReport, runRules, score } from "@/lib/critic/engine";
import { applyFindings } from "@/lib/critic/patch";
import { contrast, fixContrast, parseColor } from "@/lib/critic/css";
import { htmTemplates, parseHtml } from "@/lib/critic/html";

import { PAGE, CSS, JS } from "./critic-fixtures";

const files = { "index.html": PAGE, "styles.css": CSS, "app.js": JS };
const find = (fs: ReturnType<typeof runRules>, rule: string) => fs.filter((f) => f.rule === rule);

test("html scanner: offsets, nesting, accessible names, htm templates with masked expressions", () => {
  const d = parseHtml(`<a href="/x"><img alt="Home"></a><p>Hi <b>there</b></p>`);
  const a = d.els.find((e) => e.tag === "a")!;
  assert.equal(a.name, "Home");
  assert.equal(d.els.find((e) => e.tag === "p")!.text, "Hi there");
  const t = htmTemplates(JS);
  assert.ok(t.length >= 1);
  const inner = parseHtml(t[1]?.body ?? t[0].body, t[1]?.base ?? t[0].base, true);
  const img = inner.els.find((e) => e.tag === "img")!;
  assert.ok(img.attrs.src.dynamic);
  assert.equal(JS.slice(img.start, img.start + 4), "<img", "offsets point into the real file");
});

test("a11y: alt text, names, labels, landmarks, heading order, tabindex, click targets, lang", () => {
  const f = runRules(files, { name: "Crumb & Co" });
  const alt = find(f, "a11y/img-alt");
  assert.ok(alt.some((x) => x.file === "index.html" && x.line === 12 && x.patch?.[0].replace.includes('alt="Hero sourdough"')), "alt guessed from the file name");
  assert.ok(alt.some((x) => x.file === "app.js" && x.patch?.[0].replace.includes("p.alt || p.title")), "alt for a dynamic src uses the item's fields");
  assert.ok(find(f, "a11y/button-name").some((x) => x.file === "index.html" && x.patch?.[0].replace === ' aria-label="Close"'));
  assert.ok(find(f, "a11y/button-name").some((x) => x.file === "app.js"), "icon button inside an htm template");
  assert.ok(find(f, "a11y/input-label")[0].patch?.[0].replace.includes('aria-label="Your email"'));
  assert.equal(find(f, "a11y/heading-order")[0].line, 11);
  assert.equal(find(f, "a11y/tabindex-positive")[0].patch?.[0].replace, "0");
  assert.ok(find(f, "a11y/click-target")[0].patch?.some((p) => p.replace.startsWith('<button type="button"')));
  assert.ok(find(f, "a11y/html-lang").length === 1);
  assert.ok(find(f, "a11y/landmark-main")[0].patch?.some((p) => p.replace === "<main"));
});

test("contrast math matches WCAG reference values, and the fix keeps hue while passing", () => {
  assert.equal(contrast(parseColor("#000")!, parseColor("#fff")!).toFixed(1), "21.0");
  assert.equal(contrast(parseColor("#777")!, parseColor("#fff")!).toFixed(2), "4.48");
  const fixed = fixContrast(parseColor("#b0b0b0")!, parseColor("#ffffff")!, 4.5)!;
  assert.ok(contrast(parseColor(fixed)!, parseColor("#fff")!) >= 4.5);
  const f = runRules(files);
  const tok = find(f, "a11y/contrast-token").find((x) => x.element?.includes("--muted"))!;
  assert.ok(tok && tok.patch?.[0].file === "styles.css");
  const rule = find(f, "a11y/contrast")[0];
  assert.ok(rule.title.includes("needs 4.5:1"));
});

test("design: gradient text, neon glow, off-grid spacing, tiny text, AI violet, generic copy", () => {
  const f = runRules(files);
  const g = find(f, "design/gradient-text")[0];
  assert.ok(g && g.patch!.length >= 3, "gradient text fix replaces the gradient and drops clip/fill");
  assert.equal(find(f, "design/neon-glow")[0].severity, "major");
  assert.ok(find(f, "design/spacing-grid")[0].fix.includes("12px 24px"));
  assert.equal(find(f, "design/tiny-text")[0].patch?.[0].replace, "12px");
  assert.ok(find(f, "design/default-purple").length === 1);
  assert.ok(find(f, "design/generic-copy")[0].title.includes("Unlock the power"));
});

test("perf, ux and code: render-blocking, fonts, titles, dead/broken links, loose equality, console, empty catch", () => {
  const f = runRules(files, { name: "Crumb & Co" });
  assert.equal(find(f, "perf/render-blocking-script")[0].patch?.[0].replace, " defer");
  assert.ok(find(f, "perf/font-display")[0].patch?.[0].replace.includes("display=swap"));
  assert.ok(find(f, "ux/page-title")[0].patch?.[0].replace === "Crumb &amp; Co");
  assert.ok(find(f, "ux/dead-link").length === 1);
  assert.ok(find(f, "ux/broken-link")[0].title.includes("pricing.html"));
  assert.equal(find(f, "code/loose-equality")[0].patch?.[0].replace, "===");
  assert.ok(find(f, "code/console").length === 1);
  assert.ok(find(f, "code/empty-catch").length === 1);
  assert.ok(find(f, "a11y/reduced-motion").length === 1 && find(f, "a11y/focus-indicator").length === 1);
  for (const x of f) {
    assert.ok(x.file && x.line >= 1 && x.title && x.detail && x.fix, `finding ${x.id} is located and specific`);
    assert.ok(!/consider improving|looks good|could be better/i.test(x.fix + x.detail), "no generic comments");
  }
});

test("apply fixes: patches compose, re-anchor after edits, and re-running finds the fixed issues gone", () => {
  const f = runRules(files, { name: "Crumb & Co" });
  const fixable = f.filter((x) => x.patch);
  const r = applyFindings(files, fixable);
  assert.ok(r.applied.length >= 15, `applied ${r.applied.length}`);
  const again = runRules(r.files, { name: "Crumb & Co" });
  for (const rule of ["a11y/html-lang", "a11y/tabindex-positive", "perf/render-blocking-script", "design/gradient-text", "code/loose-equality", "ux/page-title", "a11y/landmark-main"]) assert.equal(find(again, rule).length, 0, `${rule} fixed`);
  assert.ok(r.files["index.html"].includes('<html lang="en">'));
  assert.ok(r.files["index.html"].includes('<main id="app">') && r.files["index.html"].includes("</main>"));
  // re-anchoring: shift the file, the patch still lands on its text
  const shifted = { ...files, "index.html": "<!-- banner -->\n" + files["index.html"] };
  const one = find(f, "a11y/tabindex-positive");
  const r2 = applyFindings(shifted, one);
  assert.deepEqual(r2.applied, [one[0].id]);
  assert.ok(r2.files["index.html"].includes('tabindex="0"'));
  // stale: the text it replaces is gone
  const gone = { ...files, "index.html": files["index.html"].replace('tabindex="3"', "") };
  assert.equal(applyFindings(gone, one).skipped.length, 1);
});

test("scoring: blockers cap the score, repeats count less, clean code scores high", () => {
  const f = runRules(files, { name: "Crumb & Co" });
  const s = score(f);
  assert.ok(s.score <= 69, `blockers cap: ${s.score}`);
  const clean = { "index.html": `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Crumb &amp; Co — sourdough delivered</title><meta name="description" content="Fresh sourdough to your door."><link rel="icon" href="/i.svg"><link rel="stylesheet" href="s.css"></head><body><header><nav><a href="index.html">Home</a></nav></header><main><h1>Sourdough, delivered Fridays</h1><img src="loaf.jpg" alt="A crusty loaf" width="800" height="600"></main></body></html>`, "s.css": ":root{--bg:#fff;--ink:#1a1a1a;--muted:#5f5f5f}body{line-height:1.6;padding:16px 24px}" };
  const r = buildReport({ id: "x", workspaceId: "w", siteId: "s", version: 1, createdAt: "t" }, clean, runRules(clean, { name: "Crumb & Co" }), { static: { rules: 1, ms: 1 } });
  assert.ok(r.score >= 95, `clean scores ${r.score}: ${r.findings.map((x) => x.rule).join(", ")}`);
  assert.equal(r.grade, "Ship it");
});
