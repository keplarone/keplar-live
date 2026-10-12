import "./setup";
import assert from "node:assert/strict";
import { test } from "node:test";
import { guides } from "../src/lib/content/guides";
import { landingPages } from "../src/lib/content/landing";
import { allPosts } from "../src/lib/kb/blog";
import { allDocs } from "../src/lib/kb/docs";
import sitemap from "../src/app/sitemap";
import { parseUtm, withUtm } from "../src/lib/utm";

const allText = () =>
  JSON.stringify([landingPages, guides]);

test("landing and guide copy makes no unproven claims", () => {
  const t = allText().toLowerCase();
  for (const bad of ["checks claims against", "verified against sources", "eliminates hallucination", "100% accurate", "guaranteed accurate", "trusted by", "thousands of", "customers love", "% more accurate", "stops hallucinations\""]) {
    assert.ok(!t.includes(bad), `found "${bad}"`);
  }
  // Every statement of "no hallucination" must be negative.
  assert.ok(!/\b\d+(\.\d+)?%\b/.test(t), "no percentages or invented statistics");
});

test("every page has a unique title, description, and path", () => {
  const pages = [...landingPages.map((p) => ({ t: p.metaTitle, d: p.metaDescription, p: p.path })), ...guides.map((g) => ({ t: g.title, d: g.metaDescription, p: g.path }))];
  for (const k of ["t", "d", "p"] as const) assert.equal(new Set(pages.map((x) => x[k])).size, pages.length, `duplicate ${k}`);
  for (const p of pages) {
    assert.ok(p.d.length >= 60 && p.d.length <= 175, `${p.p} description length ${p.d.length}`);
    assert.ok(p.t.length <= 62, `${p.p} title length ${p.t.length}`);
  }
});

test("internal links point at real pages", () => {
  const known = new Set(["/how-it-works", "/pricing", "/compare", "/for-you", "/for-developers", "/download", "/what-is-keplar", ...landingPages.map((p) => p.path), ...guides.map((g) => g.path), ...allPosts().map((b) => b.path), ...allDocs().map((d) => d.path)]);
  for (const p of landingPages) for (const r of p.related) assert.ok(known.has(r), `${p.path} -> ${r}`);
  for (const g of guides) for (const r of g.related) assert.ok(known.has(r), `${g.path} -> ${r}`);
});

test("sitemap lists the new pages and keeps private and noindexed routes out", () => {
  const urls = sitemap().map((e) => new URL(e.url).pathname);
  for (const p of [...landingPages.map((x) => x.path), ...guides.map((g) => g.path), "/guides"]) assert.ok(urls.includes(p), p);
  for (const p of ["/app", "/account", "/checkout", "/signin", "/signup"]) assert.ok(!urls.includes(p), p);
  assert.ok(urls.includes("/compare/perplexity-model-council"), "comparison pages are approved and listed (2026-10-12)");
});

test("utm tags are validated and appended only to internal links", () => {
  const u = parseUtm(JSON.stringify({ utm_source: "x", utm_medium: "m", evil: "1", utm_term: 5 }));
  assert.deepEqual(u, { utm_source: "x", utm_medium: "m" });
  assert.equal(withUtm("/app", u), "/app?utm_source=x&utm_medium=m");
  assert.equal(withUtm("/signup?next=%2Fapp", u), "/signup?next=%2Fapp&utm_source=x&utm_medium=m");
  assert.equal(withUtm("https://example.com", u), "https://example.com");
  assert.equal(withUtm("//evil.com", u), "//evil.com");
  assert.equal(withUtm("/pricing", {}), "/pricing");
});
