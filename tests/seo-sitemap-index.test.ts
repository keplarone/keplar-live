import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SITEMAP_INDEX_PATH, SITEMAPS, sitemapIndexXml, sitemapUrls } from "../src/lib/seo/sitemaps";

test("sitemap index: lists every registered sitemap as an absolute URL, escaped, no lastmod", () => {
  const xml = sitemapIndexXml();
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<sitemapindex xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  for (const u of sitemapUrls()) assert.ok(xml.includes(`<sitemap><loc>${u}</loc></sitemap>`), u);
  assert.equal((xml.match(/<sitemap>/g) ?? []).length, SITEMAPS.length);
  assert.doesNotMatch(xml, /lastmod/);
  assert.ok(sitemapIndexXml(["https://keplar.one/a&b.xml"]).includes("a&amp;b.xml"));
});

test("sitemap index: every registered sitemap has a route, and the index route exists", () => {
  for (const s of SITEMAPS) {
    const file = s.path === "/sitemap.xml" ? "src/app/sitemap.ts" : `src/app${s.path}/route.ts`;
    assert.doesNotThrow(() => readFileSync(file, "utf8"), `${s.path} -> ${file}`);
  }
  assert.doesNotThrow(() => readFileSync(`src/app${SITEMAP_INDEX_PATH}/route.ts`, "utf8"));
  assert.equal(new Set(SITEMAPS.map((s) => s.path)).size, SITEMAPS.length, "duplicate sitemap paths");
});
