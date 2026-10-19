import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { allReports, missingSections, REQUIRED_SECTIONS } from "../src/lib/kb/reports";
import { allPosts } from "../src/lib/kb/blog";
import { nearDuplicates, QUALITY } from "../src/lib/seo/quality";
import { hasTitle } from "../src/lib/seo/titles";
import { sitemapPaths } from "../src/app/sitemap";
import { lastmodFor } from "../src/lib/content/lastmod";

test("reports: every report has the required sections, sound metadata, real data files and real related pages", () => {
  const reports = allReports();
  assert.ok(reports.length >= 1);
  for (const r of reports) {
    assert.deepEqual(missingSections(r), [], `${r.slug} is missing sections (needs ${REQUIRED_SECTIONS.join(", ")})`);
    assert.ok(r.metaTitle.length + " · Keplar".length <= QUALITY.titleMax, `${r.slug} search title ${r.metaTitle.length}`);
    assert.ok(r.description.length >= QUALITY.descriptionMin && r.description.length <= 175, `${r.slug} description ${r.description.length}`);
    assert.match(r.published, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(r.updated >= r.published);
    assert.ok(r.words >= 800, `${r.slug}: ${r.words} words`);
    assert.ok(r.dataFiles.length >= 1, `${r.slug}: a report names its data files`);
    for (const f of r.dataFiles) assert.ok(existsSync(f), `${r.slug}: data file ${f} is not in the repository`);
    for (const p of r.related) assert.ok(hasTitle(p), `${r.slug}: related ${p}`);
    assert.ok(sitemapPaths.includes(r.path), `${r.path} in the sitemap`);
    assert.equal(lastmodFor(r.path), r.updated);
    const text = `${r.title} ${r.description} ${r.text}`.toLowerCase();
    for (const bad of ["trusted by", "customers love", "guaranteed accurate", "100% accurate", "eliminates hallucination", "more accurate than chatgpt"]) assert.ok(!text.includes(bad), `${r.slug}: ${bad}`);
    assert.ok(/limitation/i.test(r.text), `${r.slug} states its limitations`);
  }
  assert.ok(sitemapPaths.includes("/reports"));
  assert.ok(lastmodFor("/reports"));
  const dupes = nearDuplicates([...reports.map((r) => ({ path: r.path, title: r.title, description: r.description, text: r.text })), ...allPosts().map((p) => ({ path: p.path, title: p.title, description: p.description, text: p.text }))]).filter((d) => d.a.startsWith("/reports") || d.b.startsWith("/reports"));
  assert.deepEqual(dupes, [], "a report must not duplicate a blog post");
});
