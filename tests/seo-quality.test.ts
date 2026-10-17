import "./setup";
import assert from "node:assert/strict";
import { test } from "node:test";
import { sitemapPaths } from "../src/app/sitemap";
import { kbPaths } from "../src/lib/kb/paths";
import { CLUSTERS, clusterAlso, clusterForPath, clusterTrail } from "../src/lib/seo/clusters";
import { decidePublish, includeInSitemap } from "../src/lib/seo/programmatic";
import { assessPage, paginate, shingleOverlap, validateJsonLd, wordCount } from "../src/lib/seo/quality";

const known = new Set([...sitemapPaths, ...kbPaths().map((p) => p.path)]);
const products = new Set(["/app/ask", "/app/study", "/app/slides", "/app/create", "/pricing", "/docs"]);

function body(seed: string): string {
  return Array.from({ length: 70 }, (_, i) => `${seed} paragraph ${i} walks through one concrete step a reader can follow without another page repeating it.`).join(" ");
}

const draft = (over: Partial<Parameters<typeof assessPage>[0]> = {}) => ({
  path: "/tools/example",
  title: "A worked example of checking a draft",
  description: "A long enough description of a worked example that tells the reader what the page covers and what it does not claim.",
  h1: "Check a draft one step at a time",
  body: body("alpha"),
  links: ["/docs", "/guides"],
  ...over,
});

test("eleven clusters own existing URLs, one intent each, and no held comparison", () => {
  assert.equal(CLUSTERS.length, 11);
  assert.equal(new Set(CLUSTERS.map((c) => c.id)).size, 11);
  const paths: string[] = [];
  for (const c of CLUSTERS) {
    assert.equal(c.pages.filter((p) => p.role === "hub").length, 1, c.id);
    assert.equal(c.pages.find((p) => p.role === "hub")?.path, c.hub, c.id);
    assert.ok(products.has(c.productPath), c.productPath);
    assert.equal(new Set(c.pages.map((p) => p.intent)).size, c.pages.length, `${c.id} intents`);
    for (const p of c.pages) {
      assert.ok(known.has(p.path), `${c.id} missing ${p.path}`);
      paths.push(p.path);
    }
  }
  assert.equal(new Set(paths).size, paths.length, "a URL belongs to one cluster");
  assert.equal(paths.includes("/vs/perplexity"), false);
});

test("cluster trails and related links stay inside the cluster", () => {
  assert.deepEqual(clusterTrail("/compare"), [{ name: "AI model comparisons", path: "/compare" }]);
  assert.deepEqual(clusterTrail("/vs/chatgpt")[0], { name: "AI model comparisons", path: "/compare" });
  assert.equal(clusterTrail("/vs/chatgpt")[1]?.path, "/vs/chatgpt");
  assert.equal(clusterForPath("/nope"), undefined);
  for (const link of clusterAlso("/vs")) {
    assert.equal(clusterForPath(link.path)?.id, "comparisons");
    assert.notEqual(link.path, "/vs");
    assert.notEqual(link.path, "/vs/perplexity");
  }
});

test("the quality bar noindexes thin, duplicate, and mismatched schema", () => {
  const ok = assessPage(draft());
  assert.equal(ok.indexable, true, ok.reasons.join("; "));
  assert.equal(wordCount(draft().body) >= 300, true);

  const thin = assessPage(draft({ body: "Too short to publish." }));
  assert.equal(thin.indexable, false);
  assert.ok(thin.reasons.some((r) => r.startsWith("thin content")));

  const copy = draft();
  const dup = assessPage(draft({ path: "/tools/other", title: "Another title for the same body text here", h1: "A different heading" }), [{ path: copy.path, text: copy.body }]);
  assert.equal(dup.indexable, false);
  assert.ok(shingleOverlap(copy.body, copy.body) === 1);

  const taken = assessPage(draft({ path: "/tools/other" }), [], [{ path: "/tools/example", title: draft().title, description: "x".repeat(80), h1: "Other" }]);
  assert.ok(taken.reasons.some((r) => r.includes("duplicate title")));

  const faq = { "@type": "FAQPage", mainEntity: [{ "@type": "Question", name: "Where is the question?", acceptedAnswer: { "@type": "Answer", text: "It is written in the body." } }] };
  const missing = validateJsonLd([faq], "A page that never asks that.");
  assert.ok(missing.some((p) => p.includes("FAQ question")));
  const present = assessPage(draft({ body: `${body("beta")} Where is the question? It is written in the body.`, jsonLd: [faq] }));
  assert.equal(present.indexable, true, present.reasons.join("; "));

  const rated = validateJsonLd([{ "@type": "Product", name: "Keplar", aggregateRating: { "@type": "AggregateRating", ratingValue: "5" } }], "Keplar");
  assert.ok(rated.some((p) => p.includes("rating")));

  const decision = decidePublish(draft({ body: "Short." }));
  assert.equal(includeInSitemap(decision), false);
});

test("pagination clamps and reports neighbors", () => {
  const rows = ["a", "b", "c", "d", "e"];
  assert.deepEqual(paginate(rows, 2, 2), { page: 2, pages: 3, items: ["c", "d"], prev: 1, next: 3 });
  assert.equal(paginate(rows, 0, 2).page, 1);
  assert.equal(paginate(rows, 9, 2).page, 3);
  assert.equal(paginate(rows, 9, 2).next, null);
  assert.deepEqual(paginate([], 1, 20).items, []);
});
