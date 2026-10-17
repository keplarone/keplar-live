import { test } from "node:test";
import assert from "node:assert/strict";
import { sitemapUnavailable, urlEntry, urlsetResponse, xmlEscape } from "../src/lib/sitemap-xml";

test("sitemap xml: locs are escaped so a slug with & can't break the file", () => {
  assert.equal(xmlEscape("a&b<c>\"'"), "a&amp;b&lt;c&gt;&quot;&apos;");
  assert.equal(urlEntry("https://keplar.one/templates/r&d", "2026-10-03T09:00:00Z"), "  <url><loc>https://keplar.one/templates/r&amp;d</loc><lastmod>2026-10-03</lastmod></url>");
  assert.equal(urlEntry("https://keplar.one/templates"), "  <url><loc>https://keplar.one/templates</loc></url>");
});

test("sitemap xml: a store error is a 503 (crawlers keep the last list), never an empty 200", async () => {
  const down = sitemapUnavailable();
  assert.equal(down.status, 503);
  assert.ok(down.headers.get("retry-after"));
  const ok = urlsetResponse([]);
  assert.equal(ok.status, 200);
  assert.match(await ok.text(), /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
});
