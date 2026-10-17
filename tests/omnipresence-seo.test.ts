import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { businessHost } from "@/proxy";
import { BUSINESS_ORIGIN, businessGraph, businessLlms, businessRobots, businessSitemap } from "@/lib/business/seo";
import { BUSINESS_TIERS } from "@/lib/business/tiers";
import { CAPABILITY_MATRIX, capabilitiesManifest, FACT_SECTIONS, MATRIX_COLUMNS } from "@/lib/content/product-facts";
import { landingPages } from "@/lib/content/landing";

const req = (url: string) => new NextRequest(url, { headers: { host: new URL(url).host } });

test("business host: robots, sitemap, llms and the share card are its own, not keplar.one's", () => {
  const rewrite = (p: string) => businessHost(req(`https://business.keplar.one${p}`))?.headers.get("x-middleware-rewrite") ?? "";
  for (const p of ["/robots.txt", "/sitemap.xml", "/llms.txt", "/opengraph-image"]) assert.ok(rewrite(p).endsWith(`/biz${p}`), p);
  assert.ok(rewrite("/twitter-image").endsWith("/biz/opengraph-image"));
});

test("business robots and sitemap point at the Business host and list only the storefront", () => {
  const robots = businessRobots();
  assert.match(robots, /Allow: \//);
  assert.match(robots, /Disallow: \/api\//);
  assert.ok(robots.includes(`Sitemap: ${BUSINESS_ORIGIN}/sitemap.xml`));
  const xml = businessSitemap("2026-10-11");
  assert.equal((xml.match(/<loc>/g) ?? []).length, 1);
  assert.ok(xml.includes(`<loc>${BUSINESS_ORIGIN}/</loc>`));
  assert.ok(!xml.includes("keplar.one/pricing"), "no Keplar One URLs in the Business sitemap");
  assert.ok(businessLlms().includes("Keplar Business"));
});

test("business JSON-LD: real plan prices only, no ratings or reviews", () => {
  const json = JSON.stringify(businessGraph());
  assert.ok(json.includes('"SoftwareApplication"'));
  assert.ok(json.includes(BUSINESS_TIERS.starter.monthly!.toFixed(2)));
  assert.ok(!/aggregateRating|"review"/i.test(json), "never invent ratings");
});

test("Breadcrumbs: visible nav and JSON-LD come from the same trail", () => {
  const src = readFileSync("src/components/seo/Breadcrumbs.tsx", "utf8");
  assert.match(src, /aria-label="Breadcrumb"/);
  assert.match(src, /aria-current="page"/);
  assert.match(src, /breadcrumbs\(trail\)/);
  for (const f of ["blogs/[slug]", "docs/[...slug]", "prompts/[category]", "topics/[slug]", "use-cases/[slug]", "vs/[slug]"]) {
    const page = readFileSync(`src/app/(marketing)/${f}/page.tsx`, "utf8");
    assert.match(page, /<Breadcrumbs trail=/, f);
    assert.ok(!page.includes("s.crumbs"), `${f}: the old unlabelled crumbs paragraph is gone`);
  }
});

test("capability matrix: one cell per column, Business-only features never shown on Keplar One", () => {
  for (const r of CAPABILITY_MATRIX) assert.equal(r.cells.length, MATRIX_COLUMNS.length, r.feature);
  const agents = CAPABILITY_MATRIX.find((r) => r.feature.startsWith("Scheduled agents"))!;
  assert.deepEqual(agents.cells.slice(0, 2), ["no", "no"]);
  const create = CAPABILITY_MATRIX.find((r) => r.feature === "Create websites and apps")!;
  assert.deepEqual(create.cells.slice(0, 2), ["yes", "yes"]);
});

test("capabilities.json lists every fact, with absolute URLs and a status", () => {
  const m = capabilitiesManifest("https://keplar.one");
  const total = FACT_SECTIONS.reduce((a, s) => a + s.facts.length, 0);
  assert.equal(m.sections.reduce((a, s) => a + s.features.length, 0), total);
  for (const s of m.sections) for (const f of s.features) {
    assert.ok(["live", "beta", "soon"].includes(f.status), f.name);
    if ("url" in f && f.url) assert.ok(f.url.startsWith("https://"), f.url);
  }
});

test("landing paths are unique", () => {
  assert.equal(new Set(landingPages.map((p) => p.path)).size, landingPages.length);
});
