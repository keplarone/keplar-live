import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { ensureErrorPage } from "@/lib/site-builder/finalize";
import { parseEnhanced } from "@/lib/site-builder/enhance";
import { paletteOf, MoodError } from "@/lib/site-builder/mood";
import { nsCss, nsHtml, sitePrefix, unNsHtml } from "@/lib/site-builder/namespace";
import { parseCritique } from "@/lib/site-builder/qa/critique";
import { issuesFromConsole, issuesFromProbe, VIEWPORTS, type Probe } from "@/lib/site-builder/qa/probe";
import { phaseLabel, progressOf } from "@/components/create/workspace/activity";

const probe = (o: Partial<Probe> = {}): Probe => ({ docW: 390, winW: 390, overflow: [], h1: 1, h1InFirstScreen: true, textLen: 900, imgs: [], tiny: 0, tinySample: "", taps: { n: 6, small: 0, sample: "" }, contrast: [], title: "t", hasMain: true, viewportMeta: true, fonts: [], links: [], forms: 0, height: 2000, ...o });
const phone = VIEWPORTS.find((v) => v.id === "mobile")!;

test("per-site class prefix: stable, never 'k', applied to markup and CSS, and reversible", () => {
  const a = sitePrefix("sit_aaa");
  assert.equal(a, sitePrefix("sit_aaa"));
  assert.match(a, /^[a-z]{3}$/);
  assert.notEqual(a, "k");
  assert.ok(new Set(["s1", "s2", "s3", "s4", "s5", "s6"].map(sitePrefix)).size >= 4, "different sites get different prefixes");
  const html = `<div class="k-wrap k-hero other" id="k-keep"><a class='k-btn' href="k-page.html">x</a></div>`;
  const out = nsHtml(html, a);
  assert.ok(out.includes(`class="${a}-wrap ${a}-hero other"`));
  assert.ok(out.includes(`id="k-keep"`) && out.includes(`href="k-page.html"`), "only class names change");
  assert.equal(unNsHtml(out, a), html);
  assert.equal(nsCss(".k-wrap{a:b}.k-hero .k-x{c:d}", a), `.${a}-wrap{a:b}.${a}-hero .${a}-x{c:d}`);
});

test("browser probe findings are real, specific and graded", () => {
  assert.deepEqual(issuesFromProbe(probe(), "index.html", phone), []);
  const bad = issuesFromProbe(probe({ docW: 900, overflow: [{ sel: "div.wide", right: 900 }], imgs: [{ src: "/x.png", alt: null, broken: true, w: 100 }], contrast: [{ sel: "p", ratio: 1.6, text: "faint" }], viewportMeta: false, h1: 0 }), "index.html", phone);
  const codes = bad.map((i) => i.code);
  for (const c of ["overflow-x", "broken-image", "low-contrast", "no-viewport", "h1-count"]) assert.ok(codes.includes(c), c);
  assert.equal(bad.find((i) => i.code === "overflow-x")?.severity, "error");
  const c = issuesFromConsole([{ kind: "pageerror", text: "x is not defined" }, { kind: "pageerror", text: "x is not defined" }, { kind: "request", text: "404 http://127.0.0.1/a.png" }], "index.html", "desktop");
  assert.ok(c.length >= 1 && c.length <= 2, "duplicates are folded");
});

test("visual critique: parsed defensively and bounded", () => {
  assert.equal(parseCritique("no json here"), null);
  const c = parseCritique('noise {"score": 12, "summary": "ok", "issues": [{"severity":"high","where":"hero","problem":"text on image unreadable","fix":"add a scrim"},{"problem":""}]} tail');
  assert.ok(c);
  assert.equal(c.score, 10);
  assert.equal(c.issues.length, 1);
  assert.equal(c.issues[0].severity, "high");
});

test("prompt improvement: needs a real description back, otherwise nothing is invented", () => {
  assert.equal(parseEnhanced("plain text"), null);
  assert.equal(parseEnhanced('{"idea":"short"}'), null);
  const e = parseEnhanced('{"idea":"A warm neighborhood bakery site that leads with the opening hours and a way to reserve a loaf, in short honest sentences.","adds":["a","b"],"missing":["hours"]}');
  assert.ok(e && e.adds.length === 2 && e.missing[0] === "hours");
});

test("mood board: the palette is read from the image's own pixels; garbage is refused", async () => {
  const img = await sharp({ create: { width: 60, height: 60, channels: 3, background: { r: 200, g: 60, b: 30 } } }).png().toBuffer();
  const colors = await paletteOf(img);
  assert.ok(colors.length >= 1 && colors.length <= 5);
  assert.match(colors[0], /^#[0-9a-f]{6}$/);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(colors[0].slice(i, i + 2), 16));
  assert.ok(r > 150 && g < 110 && b < 90, `expected a rust red, got ${colors[0]}`);
  await assert.rejects(() => paletteOf(Buffer.from("not an image")), MoodError);
});

test("every site gets its own 404 page in its own voice, linking only to real pages", () => {
  const home = `<!doctype html><html lang="en"><head><title>x</title></head><body><header><nav><a href="menu.html">Menu</a> <a href="index.html">Home</a></nav></header><main id="main"></main><footer>f</footer></body></html>`;
  const out = ensureErrorPage({ "index.html": home, "menu.html": home, "styles.css": "a{}" }, "plain", "directory");
  assert.ok(out["404.html"]);
  assert.match(out["404.html"], /<title>Page not found<\/title>/);
  assert.match(out["404.html"], /href="menu\.html"/);
  assert.ok(!/href="404\.html"/.test(out["404.html"]));
  assert.equal(ensureErrorPage({ ...out, "404.html": "mine" }, "plain")["404.html"], "mine", "a page the model wrote is kept");
});

test("build progress is computed from real counters only and never goes backwards through the phases", () => {
  const base = { chars: 0, files: 0, pages: 3, testSteps: 0 };
  assert.equal(progressOf({ ...base, phase: "idle" }), 0);
  const w1 = progressOf({ ...base, phase: "writing", chars: 9000 });
  const w2 = progressOf({ ...base, phase: "writing", chars: 27000, files: 3 });
  assert.ok(w1 > 0 && w2 > w1 && w2 <= 0.7);
  const seq = [w2, progressOf({ ...base, phase: "checking" }), progressOf({ ...base, phase: "saving" }), progressOf({ ...base, phase: "testing", testSteps: 0 }), progressOf({ ...base, phase: "testing", testSteps: 16 })];
  for (let i = 1; i < seq.length; i++) assert.ok(seq[i] >= seq[i - 1], `phase ${i}`);
  assert.ok(seq[seq.length - 1] < 1, "never claims 100% before the test is done");
  assert.equal(phaseLabel("writing"), "Building preview");
  assert.equal(phaseLabel("saving"), "Compiling app");
});

test("the workspace has no blue anywhere in its own palette and no gradient template swatches", () => {
  const ws = readFileSync(new URL("../src/components/create/workspace/ws.module.css", import.meta.url), "utf8");
  assert.doesNotMatch(ws, /#(2457d6|2f63e8|8aa9ff)|rgb\(\s*(36|47)\s*,?\s*(87|99)/i, "the workspace palette has no blue");
  assert.doesNotMatch(readFileSync(new URL("../src/components/create/builder.module.css", import.meta.url), "utf8"), /^\.swatch/m, "no gradient template swatches");
});
