import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// @ts-expect-error plain .mjs script without types
import { siteIssues } from "../scripts/seo-site-issues.mjs";
import { guides } from "@/lib/content/guides";
import { landingPages } from "@/lib/content/landing";
import { allPosts } from "@/lib/kb/blog";
import { footerNav, primaryNav } from "@/lib/site";

const page = (path: string, title: string, links: string[], extra: Record<string, unknown> = {}) => ({ path, title, desc: `${title} description`, canonical: `https://keplar.one${path}`, links, ...extra });

test("site checks: duplicate titles, missing canonicals and orphans are reported; locale variants and the home page are not", () => {
  const issues: string[] = siteIssues([
    page("/", "Home", ["/a", "/b"]),
    page("/a", "Same title", ["/"]),
    page("/b", "Same title", ["/a"]),
    page("/roadmap", "Roadmap", ["/"]),
    page("/de/roadmap", "Roadmap", ["/roadmap"]),
    page("/lonely", "Lonely", ["/"], { canonical: undefined }),
  ]);
  assert.ok(issues.some((i) => i.startsWith("duplicate title on /a, /b")));
  assert.ok(!issues.some((i) => i.includes("/de/roadmap") && i.startsWith("duplicate")), "same page in another language");
  assert.ok(issues.includes("/lonely: no canonical"));
  assert.ok(issues.includes("/lonely: orphan (no internal links from other pages)"));
  assert.ok(!issues.some((i) => i.startsWith("/: orphan")));
});

test("one page per search intent across guides, landing pages and the blog (no shared titles)", () => {
  const titles = [...guides.map((g) => [g.title, g.path]), ...landingPages.map((p) => [p.metaTitle, p.path]), ...allPosts().map((b) => [b.title, b.path])];
  const seen = new Map<string, string>();
  for (const [t, p] of titles) {
    const key = t.toLowerCase().replace(/\W+/g, " ").trim();
    assert.ok(!seen.has(key), `${p} repeats the title of ${seen.get(key)}`);
    seen.set(key, p);
  }
  assert.match(readFileSync("next.config.ts", "utf8"), /"\/guides\/check-an-ai-answer", destination: "\/blogs\/how-to-check-an-ai-answer"/);
});

test("Keplar One's nav and footer never link through a redirect to Keplar Business", () => {
  const hrefs = [...primaryNav.flatMap((n) => [n.href, ...(n.children ?? []).map((c) => c.href)]), ...footerNav.flatMap((c) => c.links.map((l) => l.href))];
  for (const h of ["/enterprise", "/agents"]) assert.ok(!hrefs.includes(h), h);
  for (const p of landingPages) for (const r of p.related) assert.ok(!["/enterprise", "/agents"].includes(r), `${p.path} -> ${r}`);
});

test("segment pages that had no inbound links are now linked from related pages", () => {
  const related = new Set(landingPages.flatMap((p) => p.related));
  for (const p of ["/for-developers", "/for-researchers"]) assert.ok(related.has(p), p);
});
