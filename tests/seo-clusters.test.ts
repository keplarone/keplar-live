import { test } from "node:test";
import assert from "node:assert/strict";
import { CLUSTERS, clusterOf, clusterTrail, liveHubs, relatedInCluster } from "../src/lib/seo/clusters";
import { hasTitle, titleFor } from "../src/lib/seo/titles";
import { sitemapPaths } from "../src/app/sitemap";
import { kbPaths } from "../src/lib/kb/paths";

const known = new Set([...sitemapPaths, ...kbPaths().map((p) => p.path)]);

test("clusters: eleven intents, unique ids and hubs, every supporting page is a real indexable URL", () => {
  assert.equal(CLUSTERS.length, 11);
  assert.equal(new Set(CLUSTERS.map((c) => c.id)).size, CLUSTERS.length);
  assert.equal(new Set(CLUSTERS.map((c) => c.hub)).size, CLUSTERS.length, "two clusters share a hub");
  for (const c of CLUSTERS) {
    assert.ok(c.pages.length >= 2, `${c.id} needs supporting pages`);
    assert.equal(new Set(c.pages).size, c.pages.length, `${c.id} lists a page twice`);
    for (const p of c.pages) assert.ok(known.has(p), `${c.id}: ${p} is not in the sitemap`);
    assert.ok(!c.pages.includes(c.hub), `${c.id}: the hub is not its own supporting page`);
    assert.ok(c.queries.length >= 3 && c.intent.length > 40, `${c.id} needs an intent and queries`);
    assert.ok(/^\/(app\/[a-z]+|[a-z-]*)?$/.test(c.product.href), `${c.id}: product route ${c.product.href}`);
  }
});

test("clusters: live hubs are in the sitemap, planned hubs are not listed until built", () => {
  for (const c of CLUSTERS) {
    if (c.hubStatus === "live") assert.ok(known.has(c.hub), `${c.id}: live hub ${c.hub} missing from the sitemap`);
    else assert.ok(!known.has(c.hub), `${c.id}: hub ${c.hub} exists, mark it live`);
  }
  assert.ok(liveHubs().includes("/pricing") && liveHubs().includes("/prompts") && liveHubs().includes("/guides"));
});

test("clusters: lookups give related pages inside the cluster and a breadcrumb through a live hub", () => {
  assert.equal(clusterOf("/guides/study-from-a-pdf")?.id, "study");
  assert.equal(clusterOf("/nope"), null);
  const rel = relatedInCluster("/guides/study-from-a-pdf", 4);
  assert.equal(rel[0], "/ai-study-tool");
  assert.ok(!rel.includes("/guides/study-from-a-pdf") && rel.length === 4);
  assert.deepEqual(clusterTrail("/docs/using-keplar/study-mode", "Study mode"), [{ name: "AI for studying", path: "/ai-study-tool" }, { name: "Study mode", path: "/docs/using-keplar/study-mode" }]);
  assert.deepEqual(clusterTrail("/ai-study-tool", "AI study tool"), [{ name: "AI study tool", path: "/ai-study-tool" }]);
  assert.deepEqual(clusterTrail("/docs/create/generate-video", "Generate video"), [{ name: "AI video generation", path: "/ai-video-generator" }, { name: "Generate video", path: "/docs/create/generate-video" }]);
});

test("clusters: every hub, supporting page and product route has a real title for link lists", () => {
  for (const c of CLUSTERS) {
    for (const p of [c.hub, ...c.pages]) assert.ok(hasTitle(p), `${c.id}: no title for ${p}`);
    assert.ok(hasTitle(c.product.href) || c.product.href === "/", `${c.id}: product ${c.product.href}`);
  }
  assert.equal(titleFor("/prompts/learning"), "Learning and studying prompts");
  assert.equal(titleFor("/vs/claude"), "Keplar vs Claude");
  assert.equal(titleFor("/ai-study-tool"), "AI study tool");
  assert.equal(titleFor("/some/unknown-page"), "Unknown page");
});
