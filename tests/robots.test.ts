import "./setup";
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { SITEMAP_FILES } from "../src/lib/seo/sitemaps";

test("robots source: named crawlers get the same rules as everyone, sitemaps listed, no blanket block in production, /answers allowed", async () => {
  const src = await readFile(new URL("../src/app/robots.ts", import.meta.url), "utf8");
  for (const bot of ["Googlebot", "Bingbot", "OAI-SearchBot", "ClaudeBot", "PerplexityBot", "Applebot"]) assert.ok(src.includes(`"${bot}"`), bot);
  assert.ok(src.includes('allow: "/"') && src.includes('"/api/"') && src.includes('"/dev/"'));
  assert.ok(src.includes("robotsSitemapUrls"), "robots.txt advertises the sitemap index");
  const paths = SITEMAP_FILES.map((f) => f.path).join(" ");
  assert.ok(paths.includes("answers-sitemap.xml") && paths.includes("topics-sitemap.xml") && paths.includes("/sitemap.xml") && paths.includes("templates-sitemap.xml"));
  assert.equal(src.includes('disallow: ["/answers'), false);
});
