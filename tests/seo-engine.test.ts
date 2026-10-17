import "./setup";
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { GET as sitemapIndex } from "../src/app/sitemap-index.xml/route";
import { developersPage } from "../src/lib/growth/developers-page";
import { glossary } from "../src/lib/kb/glossary";
import { kbPaths } from "../src/lib/kb/paths";
import { vsPages } from "../src/lib/kb/vs";
import { FACT_SECTIONS, WHAT_IS_KEPLAR } from "../src/lib/content/product-facts";
import { faq } from "../src/lib/faq";
import { organizationNode } from "../src/lib/structuredData";
import { robotsSitemapUrls, shardLocs, shardNames, SITEMAP_FILES, SITEMAP_URL_CAP, sitemapIndexXml } from "../src/lib/seo/sitemaps";
import { pageMeta } from "../src/lib/seo";
import { site } from "../src/lib/site";

test("sitemap index lists the stable sitemap files and shards a 10,000 URL collection", async () => {
  const xml = sitemapIndexXml();
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<sitemapindex xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  for (const f of SITEMAP_FILES) assert.ok(xml.includes(`${site.url}${f.path}`), f.path);
  assert.equal(xml.includes("<urlset"), false);
  const res = await sitemapIndex();
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /application\/xml/);
  assert.equal(await res.text(), xml);
  const robots = robotsSitemapUrls(site.url);
  assert.equal(robots[0], `${site.url}/sitemap-index.xml`);
  assert.deepEqual(robots.slice(1), SITEMAP_FILES.map((f) => `${site.url}${f.path}`));
  assert.deepEqual(shardNames("answers-sitemap", 10_000), ["answers-sitemap.xml"]);
  assert.deepEqual(shardNames("answers-sitemap", SITEMAP_URL_CAP + 1), ["answers-sitemap.xml", "answers-sitemap-2.xml"]);
  const shards = shardLocs(Array.from({ length: SITEMAP_URL_CAP + 2 }, (_, i) => i));
  assert.equal(shards.length, 2);
  assert.equal(shards[0]!.length, SITEMAP_URL_CAP);
  assert.deepEqual(shards[1], [SITEMAP_URL_CAP, SITEMAP_URL_CAP + 1]);
});

test("public API facts agree: glossary, product facts, organization schema, and the developers doc", () => {
  const api = glossary.find((t) => t.term.startsWith("API "));
  assert.ok(api?.inKeplar);
  assert.match(api.inKeplar, /beta public API/);
  assert.match(api.inKeplar, /POST \/api\/v1\/ask/);
  assert.doesNotMatch(api.inKeplar, /does not currently offer a public/);
  assert.match(WHAT_IS_KEPLAR, /public API/);
  assert.match(organizationNode().description ?? "", /public API/);
  const doc = readFileSync("content/docs/reference/developers-and-api.md", "utf8");
  assert.match(doc, /beta public API/i);
  assert.match(doc, /\/api\/v1\/ask/);
});

test("consensus is described as counts, and browser web search is not described as off while Live Research is beta", () => {
  const breakdown = FACT_SECTIONS.flatMap((s) => s.facts).find((f) => f.name === "Answer breakdown");
  assert.ok(breakdown);
  assert.match(breakdown.what, /4 of 5/);
  assert.match(breakdown.what, /never a percentage of correctness/);
  assert.doesNotMatch(breakdown.what, /agreement percentage/);
  const faqText = faq.map((f) => f.a).join("\n");
  assert.doesNotMatch(faqText, /agreement percentage/);
  const web = FACT_SECTIONS.flatMap((s) => s.facts).find((f) => f.name === "Web lookups");
  assert.equal(web?.feature, "live-research");
  assert.match(web?.what ?? "", /do not search the web/);
  assert.doesNotMatch(web?.what ?? "", /not switched on/);
});

test("an unapproved comparison is noindex and stays out of the sitemap", () => {
  const held = vsPages.filter((v) => v.approved === false);
  assert.ok(held.some((v) => v.slug === "perplexity"));
  const listed = new Set(kbPaths().map((p) => p.path));
  for (const v of held) {
    assert.equal(listed.has(`/vs/${v.slug}`), false, v.slug);
    const meta = pageMeta(`/vs/${v.slug}`, v.title, v.description, { noindex: true });
    assert.equal((meta.robots as { index?: boolean }).index, false);
  }
});

test("/for-developers title and description fit the site length bar", () => {
  const rendered = `${developersPage.metaTitle} · Keplar`;
  assert.ok(rendered.length <= 60, `rendered title ${rendered.length}`);
  assert.ok(developersPage.metaDescription.length >= 60 && developersPage.metaDescription.length <= 160, `description ${developersPage.metaDescription.length}`);
});
