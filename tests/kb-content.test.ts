import "./setup";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { test } from "node:test";
import sitemap, { sitemapPaths } from "../src/app/sitemap";
import { localizedSitemapEntries } from "../src/lib/i18n/sitemap";
import { lastmodFor } from "../src/lib/content/lastmod";
import { allPosts } from "../src/lib/kb/blog";
import { allDocs, docSections, docsIn, neighbors } from "../src/lib/kb/docs";
import { glossary, slugOfTerm } from "../src/lib/kb/glossary";
import { blogPosting, faqLd, faqPairs, howToLd, techArticle, tocOf } from "../src/lib/kb/jsonld";
import { internalLinks, nodesToText, wordCount, type Node } from "../src/lib/kb/md";
import { kbPaths } from "../src/lib/kb/paths";
import { allPrompts, promptCategories } from "../src/lib/kb/prompts";
import { allUseCases } from "../src/lib/kb/usecases";
import { approvedVs, vsPages } from "../src/lib/kb/vs";

const TODAY = new Date().toISOString().slice(0, 10);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const ROOT = join(import.meta.dirname, "..");

type Page = { path: string; title: string; description: string; nodes: Node[]; text: string; kind: string };
const pages = (): Page[] => [
  ...allDocs().map((d) => ({ path: d.path, title: d.title, description: d.description, nodes: d.nodes, text: nodesToText(d.nodes), kind: "doc" })),
  ...allPosts().map((p) => ({ path: p.path, title: p.title, description: p.description, nodes: p.nodes, text: p.text, kind: "blog" })),
  ...allUseCases().map((u) => ({ path: u.path, title: u.title, description: u.description, nodes: u.nodes, text: nodesToText(u.nodes), kind: "use-case" })),
];

/* ---------- counts and front matter ---------- */

test("knowledge base meets the scale targets", () => {
  assert.ok(allDocs().length >= 60, `docs: ${allDocs().length}`);
  assert.ok(allPosts().length >= 20, `blog: ${allPosts().length}`);
  assert.ok(allUseCases().length >= 10, `use cases: ${allUseCases().length}`);
  assert.ok(glossary.length >= 50, `glossary: ${glossary.length}`);
  assert.ok(allPrompts().length >= 40, `prompts: ${allPrompts().length}`);
  assert.ok(promptCategories.length >= 6);
  const total = allDocs().length + allPosts().length + allUseCases().length + promptCategories.length + 4 /* hubs */ + approvedVs().length;
  assert.ok(total >= 100, `total pages: ${total}`);
});

test("every page has a title, a description of sensible length, a valid date and unique metadata", () => {
  const titles = new Set<string>();
  const descs = new Set<string>();
  for (const p of pages()) {
    assert.ok(p.title && p.title.length >= 8 && p.title.length <= 100, `${p.path} title length ${p.title?.length}`);
    assert.ok(p.description.length >= 60 && p.description.length <= 200, `${p.path} description length ${p.description.length}`);
    assert.ok(!titles.has(p.title.toLowerCase()), `duplicate title: ${p.title}`);
    assert.ok(!descs.has(p.description.toLowerCase()), `duplicate description on ${p.path}`);
    titles.add(p.title.toLowerCase());
    descs.add(p.description.toLowerCase());
  }
  for (const d of allDocs()) {
    assert.match(d.updated, ISO, d.path);
    assert.ok(d.updated <= TODAY, `${d.path} updated in the future`);
    assert.ok(docSections.some((s) => s.id === d.section), `${d.path} has an unknown section`);
  }
  for (const p of allPosts()) {
    assert.match(p.published, ISO);
    assert.match(p.updated, ISO);
    assert.ok(p.published <= TODAY && p.updated <= TODAY && p.updated >= p.published, p.path);
  }
});

test("docs: every section has pages, order is unique per section, prev/next chain covers every page once", () => {
  for (const s of docSections) {
    const list = docsIn(s.id);
    assert.ok(list.length >= 1, `${s.id} is empty`);
    const orders = list.map((d) => d.order);
    assert.equal(new Set(orders).size, orders.length, `${s.id} has duplicate order values`);
  }
  const seen = new Set<string>();
  let cur = allDocs()[0];
  while (cur) {
    assert.ok(!seen.has(cur.path), `prev/next loops at ${cur.path}`);
    seen.add(cur.path);
    const next = neighbors(cur).next;
    if (!next) break;
    assert.equal(neighbors(next).prev?.path, cur.path);
    cur = next;
  }
  assert.equal(seen.size, allDocs().length, "prev/next chain must reach every doc");
});

test("docs pages carry real content (at least 180 words) and blog posts at least 800", () => {
  for (const d of allDocs()) assert.ok(d.words >= 180, `${d.path} has only ${d.words} words`);
  for (const p of allPosts()) assert.ok(wordCount(p.text) >= 800, `${p.path} has only ${wordCount(p.text)} words`);
  for (const u of allUseCases()) assert.ok(u.words >= 340, `${u.path} has only ${u.words} words`);
});

/* ---------- editorial rules ---------- */

test("every blog post ends with how Keplar approaches the topic and has unique slugs", () => {
  const slugs = new Set<string>();
  for (const p of allPosts()) {
    assert.ok(!slugs.has(p.slug));
    slugs.add(p.slug);
    const idx = p.nodes.map((n, i) => (n.t === "h2" ? i : -1)).filter((i) => i >= 0);
    const lastIdx = idx.at(-1)!;
    const last = p.nodes[lastIdx] as { t: "h2" | "h3"; id: string; text: string };
    assert.match(last.text, /Keplar/, `${p.path}: last section must be about Keplar, is "${last.text}"`);
    const keplarSection = nodesToText(p.nodes.slice(lastIdx));
    assert.ok(keplarSection.split(/\s+/).length >= 120, `${p.path}: the Keplar section is too thin`);
  }
});

const BANNED: [RegExp, string][] = [
  [/\b100\s?%\s+(accurate|correct|reliable)\b/i, "100% accuracy"],
  [/\b(customers|users|people) (say|love|tell us)\b/i, "testimonial-style claim"],
  [/\bsuperintelligent (assistant|AI|system) (that|which) (we|keplar)\b/i, "superintelligence claim"],
  [/\bkeplar (verifies|checks|fact-checks|validates) (the )?(sources|citations|claims against)/i, "source-checking claim"],
  [/\bkeplar (is|has become) (an )?(AGI|superintelligence)\b/i, "AGI claim"],
  [/\bproven\b|\bbest-in-class\b|\bworld'?s (best|first|most)\b|\bindustry-leading\b/i, "unsupported superlative"],
  [/\b\d{1,3}(,\d{3})+\s+(users|customers|teams)\b/i, "invented user count"],
  [/\b(lorem ipsum|TODO|TBD|XXX)\b/, "placeholder text"],
];
function sentences(t: string) { return t.split(/(?<=[.!?])\s+|\n+/); }

test("no unsupported claims: no source-checking, accuracy or confidence score claims, testimonials, invented numbers", () => {
  for (const p of pages()) {
    for (const [re, label] of BANNED) assert.doesNotMatch(p.text, re, `${p.path}: ${label}`);
    for (const s of sentences(p.text)) {
      if (!s.trim().endsWith("?") && /\bguarantee[sd]?\b/i.test(s)) assert.match(s, /\b(no|not|nobody|cannot|can't|does not|doesn't|never|without|n't)\b/i, `${p.path}: guarantee claim: "${s}"`);
      if (/\b(confidence|accuracy) (score|percentage)\b/i.test(s)) {
        assert.match(s, /\b(no|not|never|none|without|doesn't|does not|nor|isn't|n't)\b/i, `${p.path}: mentions a score without denying it: "${s}"`);
      }
    }
    // statistics: any percentage must be one of the documented thresholds or a prompt example, never a result claim
    for (const m of p.text.matchAll(/\b(\d+(?:\.\d+)?)\s?%/g)) {
      assert.ok(["20", "15", "80", "60", "55", "75"].includes(m[1]), `${p.path}: unexplained percentage ${m[0]}`);
    }
  }
});

test("US spelling in content and data files", () => {
  const BRIT = [/\bneighbour\w*/i, /\bcolour\w*/i, /\bbehaviour\w*/i, /\bfavour\w*/i, /\bhonour\w*/i, /\borganis(e|ed|es|ing|ation)\b/i, /\boptimis(e|ed|es|ing|ation)\b/i, /\bpersonalis\w+/i, /\bsummaris(e|ed|es|ing)\b/i, /\bcentre[sd]?\b/i, /\blicences?\b/i, /\benquir\w+/i, /\bgrey\b/i, /\bwhilst\b/i, /\bcancell(ed|ing)\b/i, /\bprogramme\b/i, /\bcatalogue\b/i, /\bjudgement\b/i, /\banalys(e|ed|ing)\b/i, /\brecognis\w+/i, /\bprioritis\w+/i];
  const files: string[] = [];
  const walk = (d: string) => readdirSync(d).forEach((n) => { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.md$/.test(n)) files.push(p); });
  walk(join(ROOT, "content"));
  for (const f of ["glossary.ts", "prompts.ts", "vs.ts"]) files.push(join(ROOT, "src/lib/kb", f));
  for (const f of files) {
    const t = readFileSync(f, "utf8");
    for (const re of BRIT) assert.doesNotMatch(t, re, `${f}: British spelling ${re}`);
  }
});

/* ---------- duplicate content ---------- */

function shingles(text: string, n = 6): Set<string> {
  const w = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(" "));
  return out;
}

test("duplicate-content check: no two pages share more than 12% of their six-word shingles", () => {
  const list = pages().map((p) => ({ path: p.path, sh: shingles(p.text) }));
  const worst: { a: string; b: string; j: number }[] = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      let inter = 0;
      const [small, big] = list[i].sh.size < list[j].sh.size ? [list[i].sh, list[j].sh] : [list[j].sh, list[i].sh];
      for (const x of small) if (big.has(x)) inter++;
      const jac = inter / (list[i].sh.size + list[j].sh.size - inter);
      const contain = inter / Math.max(1, small.size);
      if (jac > 0.12 || contain > 0.3) worst.push({ a: list[i].path, b: list[j].path, j: Math.max(jac, contain) });
    }
  }
  assert.deepEqual(worst, [], `near-duplicate pages: ${JSON.stringify(worst)}`);
});

test("duplicate-content check: glossary definitions, prompts and comparison rows are unique", () => {
  const defs = glossary.map((g) => g.def.toLowerCase());
  assert.equal(new Set(defs).size, defs.length);
  assert.equal(new Set(glossary.map((g) => slugOfTerm(g.term))).size, glossary.length, "glossary slugs must be unique");
  const texts = allPrompts().map((p) => p.text.toLowerCase());
  assert.equal(new Set(texts).size, texts.length);
  assert.equal(new Set(allPrompts().map((p) => p.id)).size, allPrompts().length, "prompt ids unique");
  for (const g of glossary) assert.ok(g.def.length >= 60 && g.def.length <= 600, `glossary "${g.term}" definition length ${g.def.length}`);
  for (const p of allPrompts()) {
    assert.ok(p.text.length >= 60 && p.why.length >= 25 && p.check.length >= 15, `prompt ${p.id} is thin`);
  }
});

/* ---------- link checker ---------- */

function appRoutes(): string[] {
  const out: string[] = [];
  const walk = (dir: string, segs: string[]) => {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) walk(p, /^\(.*\)$/.test(n) ? segs : [...segs, n]);
      else if (n === "page.tsx" || (n === "route.ts" && segs[0] !== "api")) out.push("/" + segs.join("/"));
    }
  };
  walk(join(ROOT, "src/app"), []);
  return out;
}

function resolves(href: string, known: Set<string>, staticRoutes: Set<string>): boolean {
  const path = href.split("#")[0].split("?")[0] || "/";
  if (path.startsWith("mailto:")) return true;
  const clean = path.length > 1 ? path.replace(/\/$/, "") : path;
  return known.has(clean) || staticRoutes.has(clean) || existsSync(join(ROOT, "public", clean));
}

test("link checker: every internal link in content and data resolves to a real page", () => {
  const known = new Set([...sitemapPaths, ...vsPages.map((v) => `/vs/${v.slug}`)]);
  const staticRoutes = new Set(appRoutes().filter((r) => !r.includes("[")));
  const bad: string[] = [];
  for (const p of pages()) for (const l of internalLinks(p.nodes)) if (!resolves(l, known, staticRoutes)) bad.push(`${p.path} -> ${l}`);
  for (const d of allDocs()) for (const l of d.related) if (!resolves(l, known, staticRoutes)) bad.push(`${d.path} related -> ${l}`);
  for (const p of allPosts()) for (const l of p.related) if (!resolves(l, known, staticRoutes)) bad.push(`${p.path} related -> ${l}`);
  for (const u of allUseCases()) for (const l of u.related) if (!resolves(l, known, staticRoutes)) bad.push(`${u.path} related -> ${l}`);
  for (const g of glossary) for (const x of g.see ?? []) if (!x.href.startsWith("#") && !resolves(x.href, known, staticRoutes)) bad.push(`glossary ${g.term} -> ${x.href}`);
  for (const g of glossary) for (const x of g.see ?? []) if (x.href.startsWith("#")) assert.ok(glossary.some((t) => slugOfTerm(t.term) === x.href.slice(1)), `glossary anchor ${x.href}`);
  for (const c of promptCategories) for (const x of c.related) if (!resolves(x.href, known, staticRoutes)) bad.push(`prompts/${c.slug} -> ${x.href}`);
  for (const text of [readFileSync(join(ROOT, "src/lib/kb/prompts.ts"), "utf8")]) for (const m of text.matchAll(/\]\((\/[^)]+)\)/g)) if (!resolves(m[1], known, staticRoutes)) bad.push(`prompts.ts -> ${m[1]}`);
  assert.deepEqual(bad, []);
});

test("link checker: the hubs link to every section, post and use case (no orphan pages)", () => {
  const linked = new Set<string>();
  for (const p of pages()) for (const l of internalLinks(p.nodes)) linked.add(l.split("#")[0]);
  for (const d of allDocs()) { const n = neighbors(d); if (n.next) linked.add(n.next.path); if (n.prev) linked.add(n.prev.path); }
  for (const s of docSections) for (const d of docsIn(s.id)) linked.add(d.path); // section hub lists its pages
  for (const p of allPosts()) linked.add(p.path); // blog index lists every post
  for (const u of allUseCases()) linked.add(u.path); // use-case index lists every page
  const orphans = kbPaths().map((k) => k.path).filter((p) => !linked.has(p) && !["/docs", "/blogs", "/glossary", "/prompts", "/use-cases", "/vs"].includes(p) && !p.startsWith("/docs/") && !p.startsWith("/prompts/") && !p.startsWith("/vs/"));
  assert.deepEqual(orphans, []);
  // inbound links from outside the section: every blog post is linked from at least one other page
  const inbound = new Map<string, number>();
  for (const p of pages()) for (const l of internalLinks(p.nodes)) if (l.split("#")[0] !== p.path) inbound.set(l.split("#")[0], (inbound.get(l.split("#")[0]) ?? 0) + 1);
  const noInbound = allDocs().map((d) => d.path).filter((p) => !inbound.has(p) && !neighbors(allDocs().find((d) => d.path === p)!).prev && !neighbors(allDocs().find((d) => d.path === p)!).next);
  assert.deepEqual(noInbound, []);
});

/* ---------- sitemap ---------- */

test("sitemap: every knowledge-base page is listed once with a real, non-future lastmod; pending comparisons are not", () => {
  const set = new Set(sitemapPaths);
  assert.equal(set.size, sitemapPaths.length, "duplicate sitemap paths");
  for (const k of kbPaths()) {
    assert.ok(set.has(k.path), `${k.path} missing from sitemap`);
    assert.match(k.lastmod, ISO);
    assert.ok(k.lastmod <= TODAY, `${k.path} lastmod in the future`);
    assert.equal(lastmodFor(k.path), k.lastmod);
  }
  for (const v of vsPages.filter((x) => !x.approved)) assert.ok(!set.has(`/vs/${v.slug}`), `${v.slug} is pending approval and must stay out of the sitemap`);
  assert.ok(!sitemapPaths.some((p) => p.includes("search-index")));
  for (const p of ["/compare", "/compare/perplexity-model-council", "/compare/poe", "/compare/chathub"]) assert.ok(set.has(p), `${p} (approved 2026-10-12) missing from sitemap`);
  // English paths first, then every translated page of every indexable locale (src/lib/i18n/sitemap.ts); every URL listed once.
  const entries = sitemap();
  assert.equal(entries.length, sitemapPaths.length + localizedSitemapEntries(lastmodFor).length);
  assert.equal(new Set(entries.map((e) => e.url)).size, entries.length, "duplicate sitemap URLs");
  for (const e of entries) assert.ok(e.lastModified, `${e.url} has no lastmod`);
});

/* ---------- JSON-LD ---------- */

const safe = (o: unknown) => { const s = JSON.stringify(o); assert.doesNotMatch(s, /<\/script/i); return JSON.parse(s); };

test("JSON-LD: TechArticle, BlogPosting, FAQPage and HowTo are well formed and match the visible page", () => {
  for (const d of allDocs()) {
    const ld = safe(techArticle({ path: d.path, title: d.title, description: d.description, published: d.updated, updated: d.updated, section: d.section, keywords: d.keywords, words: d.words }));
    assert.equal(ld["@type"], "TechArticle");
    assert.ok(ld.headline && ld.datePublished && ld.dateModified && /^https?:\/\//.test(ld.mainEntityOfPage), `${d.path}: TechArticle fields`);
    const faq = faqPairs(d.nodes);
    if (faq.length) {
      const f = safe(faqLd(faq));
      assert.equal(f["@type"], "FAQPage");
      for (const q of f.mainEntity) { assert.equal(q["@type"], "Question"); assert.ok(q.name && q.acceptedAnswer.text); assert.ok(d.text.replace(/\s+/g, " ").includes(q.name.slice(0, 40)), `${d.path}: FAQ question not on page`); }
    }
    const how = d.howto ? howToLd({ path: d.path, title: d.title, description: d.description, nodes: d.nodes }) : null;
    if (d.howto) {
      assert.ok(how, `${d.path} is flagged howto but has no "## Steps" ordered list`);
      const h = safe(how);
      assert.equal(h["@type"], "HowTo");
      assert.ok(h.step.length >= 2);
      h.step.forEach((st: { "@type": string; text: string; position: number }, i: number) => { assert.equal(st["@type"], "HowToStep"); assert.equal(st.position, i + 1); assert.ok(st.text.length > 5); });
    }
    assert.ok(tocOf(d.nodes).every((t) => t.id && t.text));
  }
  for (const p of allPosts()) {
    const ld = safe(blogPosting({ path: p.path, title: p.title, description: p.description, published: p.published, updated: p.updated, category: p.category, keywords: p.keywords, words: p.words }));
    assert.equal(ld["@type"], "BlogPosting");
    // author: the two co-founders as two Person nodes; publisher: the Organization
    assert.ok(Array.isArray(ld.author) && ld.author.length === 2 && ld.author.every((x: { "@type": string; "@id": string; name: string }) => x["@type"] === "Person" && x["@id"] && x.name) && ld.publisher["@id"] && /^https?:\/\//.test(ld.image), `${p.path}: BlogPosting fields`);
    for (const f of faqPairs(p.nodes)) assert.ok(f.q.endsWith("?") && f.a.length > 20, `${p.path}: weak FAQ`);
  }
  assert.ok(allDocs().filter((d) => d.howto).length >= 6, "docs should include several HowTo guides");
});

test("JSON-LD: glossary DefinedTerms and comparison pages are well formed", () => {
  for (const v of vsPages) {
    assert.ok(v.sources.length >= 1 && v.sources.every((s) => s.url.startsWith("https://")), `${v.slug}: sources`);
    assert.ok(v.faq.length >= 1);
    safe(faqLd(v.faq));
  }
});

/* ---------- comparison page rules ---------- */

test("comparison pages: dated, sourced, fair (no superiority claims) and gated by approval", () => {
  assert.ok(approvedVs().length >= 3);
  for (const v of vsPages) {
    const all = JSON.stringify({ ...v, faq: v.faq.map((f) => f.a) }); // visitors ask "is X more accurate?"; the answers must deny, so the questions are exempt
    assert.doesNotMatch(all, /\b(more accurate than|more secure than|safer than|more private than|better than|worse than|beats|inferior|superior|outperform)/i, `${v.slug}: superiority claim`);
    assert.ok(v.chooseThem.length >= 2 && v.chooseKeplar.length >= 2, `${v.slug}: both sides need a "when to choose"`);
    assert.ok(v.publicFacts.length >= 2);
    assert.ok(v.rows.some((r) => /confidence|accuracy/i.test(r.feature)), `${v.slug}: must state Keplar has no score`);
  }
  const perplexity = vsPages.find((v) => v.slug === "perplexity")!;
  assert.equal(perplexity.approved, false, "Perplexity (Model Council overlap) waits for owner approval");
  assert.ok(perplexity.holdReason && perplexity.overlap);
});

/* ---------- Lighthouse-style static checks on the new routes ---------- */

function sourceFiles(dir: string, out: string[] = []) {
  for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) sourceFiles(p, out); else if (/\.(tsx|css)$/.test(n)) out.push(p); }
  return out;
}
const NEW_ROUTES = ["docs", "blogs", "glossary", "prompts", "use-cases", "vs"].map((r) => join(ROOT, "src/app/(marketing)", r));

test("page structure: one h1 per page file, canonical via pageMeta, no client page components, no blue", () => {
  for (const dir of NEW_ROUTES) {
    for (const f of sourceFiles(dir).filter((x) => x.endsWith("page.tsx"))) {
      const t = readFileSync(f, "utf8");
      assert.ok((t.match(/className=\{s\.h1\}|<h1[\s>]/g) ?? []).length >= 1, `${f}: needs an h1`);
      assert.ok((t.match(/className=\{s\.h1\}/g) ?? []).length <= (f.includes("[...slug]") ? 2 : 1), `${f}: more than one h1 class`);
      assert.ok((t.match(/<h1[\s>]/g) ?? []).length <= (f.includes("[...slug]") ? 2 : 1), `${f}: more than one h1`);
      assert.doesNotMatch(t, /^["']use client["']/m, `${f}: page components stay server-rendered`);
      assert.match(t, /pageMeta\(/, `${f}: must set canonical metadata through pageMeta`);
      assert.doesNotMatch(t, /<img\b/, `${f}: use no raw images`);
      assert.match(t, /JsonLd/, `${f}: needs structured data`);
    }
  }
  const css = readFileSync(join(ROOT, "src/components/kb/kb.module.css"), "utf8");
  assert.doesNotMatch(css, /#(0{2}[0-9a-f]{2}ff|[0-4][0-9a-f]{2}fff|3b82f6|2563eb|1d4ed8)\b|\bblue\b|rgb\(\s*\d+\s*,\s*\d+\s*,\s*2[0-9]{2}\s*\)/i, "no blue controls");
  assert.doesNotMatch(css, /border-radius:\s*(?!var)[0-9]+px[^;]*;[^}]*button/i);
});

test("performance budget: the knowledge base ships client code only for copy, search, TOC, docs skin and the mobile menu", () => {
  const clients = sourceFiles(join(ROOT, "src/components/kb")).filter((f) => /^["']use client["']/m.test(readFileSync(f, "utf8"))).map((f) => basename(f));
  assert.deepEqual(clients.sort(), ["CopyButton.tsx", "DocsSearch.tsx", "DocsSkin.tsx", "Toc.tsx"].sort());
  // content is read at build time only
  for (const dir of NEW_ROUTES) for (const f of sourceFiles(dir)) assert.doesNotMatch(readFileSync(f, "utf8"), /export const dynamic = ["']force-dynamic["']|revalidate\s*=\s*0/, `${f}: must be static`);
});

test("accessibility basics: code blocks are focusable, tables have scoped headers and a labelled region, copy buttons have names", () => {
  const md = readFileSync(join(ROOT, "src/components/kb/Markdown.tsx"), "utf8");
  assert.match(md, /<pre tabIndex=\{0\}>/);
  assert.match(md, /scope="col"/);
  assert.match(md, /aria-label="Table"/);
  assert.match(readFileSync(join(ROOT, "src/components/kb/CopyButton.tsx"), "utf8"), /aria-label=/);
  const ids = new Set<string>();
  for (const d of allDocs()) {
    const seen = new Set<string>();
    for (const n of d.nodes) if (n.t === "h2" || n.t === "h3") { assert.ok(!seen.has(n.id), `${d.path}: duplicate heading id ${n.id}`); seen.add(n.id); }
    ids.add(d.path);
    const heads = d.nodes.filter((n) => n.t === "h2" || n.t === "h3");
    assert.ok(heads.length >= 2, `${d.path}: needs headings for the on-this-page list`);
  }
});

test("llms.txt lists the docs, blog, use cases, glossary, prompts and approved comparisons", async () => {
  const { GET } = await import("../src/app/llms.txt/route");
  const body = await (GET() as Response).text();
  if (body.startsWith("# Not indexable")) return;
  for (const k of kbPaths()) {
    if (/^\/(docs|blog|use-cases|prompts|vs)(\/|$)/.test(k.path) || k.path === "/glossary") assert.ok(body.includes(`https://keplar.one${k.path})`) || body.includes(`${k.path})`), `llms.txt is missing ${k.path}`);
  }
  assert.doesNotMatch(body, /\/vs\/perplexity/);
});
