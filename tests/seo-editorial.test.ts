import "./setup";
import assert from "node:assert/strict";
import { test } from "node:test";
import { editorialPages } from "../src/lib/content/editorial";
import { aboutPage } from "../src/lib/content/about-page";
import { modelsPage } from "../src/lib/content/models-page";
import { ACCESSED, sources } from "../src/lib/content/sources";
import { guides } from "../src/lib/content/guides";
import { landingPages } from "../src/lib/content/landing";
import { lastmodFor } from "../src/lib/content/lastmod";
import sitemap, { sitemapPaths } from "../src/app/sitemap";
import { localizedSitemapEntries } from "../src/lib/i18n/sitemap";

const pages = [...editorialPages, aboutPage, modelsPage];
const text = (p: unknown) => JSON.stringify(p);
const known = new Set(sitemapPaths.concat(["/app", "/signup", "/signin", "/compare"]));

test("editorial pages have unique, well-sized titles, descriptions and paths", () => {
  for (const k of ["metaTitle", "metaDescription", "path", "h1"] as const) assert.equal(new Set(pages.map((p) => p[k])).size, pages.length, `duplicate ${k}`);
  for (const p of pages) {
    assert.ok(p.metaTitle.length <= 66, `${p.path} title ${p.metaTitle.length}`);
    assert.ok(p.metaDescription.length >= 90 && p.metaDescription.length <= 175, `${p.path} description ${p.metaDescription.length}`);
    assert.ok(p.updated >= p.published, `${p.path} updated before published`);
    assert.ok(p.updated <= ACCESSED || p.updated <= new Date().toISOString().slice(0, 10), `${p.path} dated in the future`);
  }
});

test("every {{citation}} resolves to a registered source with a URL, date and kind", () => {
  for (const p of pages) {
    for (const m of text(p).matchAll(/\{\{([A-Za-z0-9]+)\}\}/g)) assert.ok(sources[m[1]], `${p.path} cites unknown source ${m[1]}`);
  }
  for (const s of Object.values(sources)) {
    assert.match(s.url, /^https:\/\//);
    assert.ok(s.date && s.title && s.by, s.id);
    assert.equal(s.id, Object.keys(sources).find((k) => sources[k] === s));
  }
  assert.match(ACCESSED, /^\d{4}-\d{2}-\d{2}$/);
});

test("the superintelligence pillar cites primary sources and states timelines are contested", () => {
  const p = editorialPages.find((x) => x.slug === "superintelligence")!;
  const t = text(p);
  for (const id of ["bostrom2014", "deepmind2023"]) assert.ok(t.includes(`{{${id}}}`), `pillar must cite ${id}`);
  assert.match(t.toLowerCase(), /contested|disagree|uncertain|no one knows/);
  assert.ok(p.term && p.term.name.toLowerCase().includes("superintelligence"));
});

test("Keplar is never described as superintelligence, AGI or an accuracy-scored system", () => {
  const t = text(pages).toLowerCase();
  assert.ok(/keplar (is|one is) not (agi|a superintelligence|superintelligence)|not (agi|superintelligence)/.test(t), "must say Keplar is not AGI / superintelligence");
  for (const bad of ["keplar is a superintelligence", "keplar is superintelligent", "keplar is agi", "we have built superintelligence", "confidence", "% accurate", "guaranteed accurate", "eliminates hallucination", "trusted by", "customers love", "star rating"]) {
    assert.ok(!t.includes(bad), `found "${bad}"`);
  }
  // the about page must not carry personal data about founders
  const a = text(aboutPage).toLowerCase();
  assert.ok(!/\bborn\b|birth|\bage\b|years old/.test(a));
});

test("internal links in editorial pages point at real pages", () => {
  for (const p of pages) {
    for (const m of text(p).matchAll(/\]\((\/[a-z0-9\-/]*)(?:#[\w-]*)?\)/g)) assert.ok(known.has(m[1]), `${p.path} -> ${m[1]}`);
    for (const r of p.related) assert.ok(known.has(r), `${p.path} related ${r}`);
  }
});

test("each search intent has one page: no editorial page duplicates another's primary term", () => {
  const owners = new Map<string, string>();
  const intents: Record<string, string> = {
    superintelligence: "/superintelligence",
    "ai-vs-agi-vs-superintelligence": "/ai-vs-agi-vs-superintelligence",
    "si-vs-ai": "/si-vs-ai",
    "multi-model-ai": "/multi-model-ai",
  };
  for (const [slug, path] of Object.entries(intents)) {
    const p = editorialPages.find((x) => x.slug === slug);
    assert.equal(p?.path, path);
    owners.set(path, p!.h1);
  }
  assert.equal(new Set(owners.values()).size, owners.size);
});

test("sitemap: unique, 200-only public paths with real lastmod dates", () => {
  assert.equal(new Set(sitemapPaths).size, sitemapPaths.length);
  const today = new Date().toISOString().slice(0, 10);
  // English paths plus the translated pages of the indexable locales (src/lib/i18n/sitemap.ts), each URL once.
  const entries = sitemap();
  const localized = localizedSitemapEntries(lastmodFor);
  assert.equal(entries.length, sitemapPaths.length + localized.length);
  assert.equal(new Set(entries.map((e) => e.url)).size, entries.length);
  for (const e of localized) assert.ok(e.lastModified, `${e.url} lacks lastmod`);
  for (const p of sitemapPaths) {
    const lm = lastmodFor(p);
    assert.ok(lm && /^\d{4}-\d{2}-\d{2}$/.test(lm), `${p} lacks lastmod`);
    assert.ok(lm <= today, `${p} lastmod in the future`);
  }
  assert.ok(new Set(entries.map((e) => String(e.lastModified))).size > 1, "lastmod must not be one build timestamp");
  for (const p of ["/superintelligence", "/ai-vs-agi-vs-superintelligence", "/si-vs-ai", "/multi-model-ai", "/about", "/models"]) assert.ok(sitemapPaths.includes(p), p);
  for (const p of ["/app", "/signin", "/signup", "/account", "/checkout", "/welcome", "/admin", "/admin/seo", "/compare", "/api/seo/event"]) assert.ok(!sitemapPaths.includes(p), p);
  for (const e of entries) assert.ok(!("changeFrequency" in e) && !("priority" in e));
  assert.ok(landingPages.length && guides.length);
});
