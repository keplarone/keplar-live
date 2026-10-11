// Whole-site SEO checks shared by scripts/seo-crawl.mjs and tests/seo-site-checks.test.ts (no I/O here).
/**
 * Whole-site checks over the indexable pages: shared titles or descriptions, a missing canonical, and orphans (a sitemap page
 * no other crawled page links to, so visitors and crawlers only find it through the sitemap). The home page is never an orphan.
 */
const unlocalized = (path) => path.replace(/^\/(?!vs\/)[a-z]{2,3}(?:-[a-z]{2,4})?(?=\/|$)/, "") || "/";

export function siteIssues(pages) {
  const out = [];
  const dupes = (key, label) => {
    const by = new Map();
    for (const p of pages) if (p[key]) by.set(p[key], [...(by.get(p[key]) ?? []), p.path]);
    // The same page in several languages may share a title (an untranslated name, or German and Dutch spelling it alike): hreflang covers that.
    for (const [v, paths] of by) if (new Set(paths.map(unlocalized)).size > 1) out.push(`duplicate ${label} on ${paths.join(", ")}: ${v.slice(0, 80)}`);
  };
  dupes("title", "title");
  dupes("desc", "description");
  for (const p of pages) if (!p.canonical) out.push(`${p.path}: no canonical`);
  const linked = new Set(pages.flatMap((p) => (p.links ?? []).filter((l) => l !== p.path).map((l) => l.replace(/\/$/, "") || "/")));
  for (const p of pages) if (p.path !== "/" && !linked.has(p.path)) out.push(`${p.path}: orphan (no internal links from other pages)`);
  return out;
}
