import "./setup";
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";

test("robots source: named crawlers get the same rules as everyone, sitemaps listed, no blanket block in production, /answers allowed", async () => {
  const src = await readFile(new URL("../src/app/robots.ts", import.meta.url), "utf8");
  for (const bot of ["Googlebot", "Bingbot", "OAI-SearchBot", "ClaudeBot", "PerplexityBot", "Applebot"]) assert.ok(src.includes(`"${bot}"`), bot);
  assert.ok(src.includes('allow: "/"') && src.includes('"/api/"') && src.includes('"/dev/"'));
  assert.ok(src.includes("answers-sitemap.xml") && src.includes("topics-sitemap.xml") && src.includes("/sitemap.xml"));
  assert.equal(src.includes('disallow: ["/answers'), false);
});
