import "./setup";
import assert from "node:assert/strict";
import { SITEMAP_INDEX_PATH, SITEMAPS } from "../src/lib/seo/sitemaps";
import { test } from "node:test";
import { readFile } from "node:fs/promises";

test("robots source: named crawlers get the same rules as everyone, sitemaps listed, no blanket block in production, /answers allowed", async () => {
  const src = await readFile(new URL("../src/app/robots.ts", import.meta.url), "utf8");
  for (const bot of ["Googlebot", "Bingbot", "OAI-SearchBot", "ClaudeBot", "PerplexityBot", "Applebot"]) assert.ok(src.includes(`"${bot}"`), bot);
  assert.ok(src.includes('allow: "/"') && src.includes('"/api/"') && src.includes('"/dev/"'));
  // Sitemaps come from the registry (src/lib/seo/sitemaps.ts): the index plus every file, so a new family is listed by adding it there.
  assert.ok(src.includes("SITEMAP_INDEX_PATH") && src.includes("sitemapUrls()"));
  const listed = [SITEMAP_INDEX_PATH, ...SITEMAPS.map((s) => s.path)];
  for (const p of ["/sitemap-index.xml", "/sitemap.xml", "/answers-sitemap.xml", "/templates-sitemap.xml", "/topics-sitemap.xml"]) assert.ok(listed.includes(p), p);
  assert.equal(src.includes('disallow: ["/answers'), false);
});
