import "./setup";
import assert from "node:assert/strict";
import { test } from "node:test";
import { releases, latestRelease } from "../src/lib/kb/changelog";
import { GET as feed } from "../src/app/changelog/feed.xml/route";
import { sitemapPaths } from "../src/app/sitemap";
import { siteGraph } from "../src/lib/structuredData";
import { lastmodFor } from "../src/lib/content/lastmod";
import { allDocs } from "../src/lib/kb/docs";

test("release notes: dated, unique, newest first, not in the future, honest wording", () => {
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(new Set(releases.map((r) => r.id)).size, releases.length);
  for (let i = 0; i < releases.length; i++) {
    const r = releases[i];
    assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(r.date <= today, `${r.id} is in the future`);
    if (i) assert.ok(releases[i - 1].date >= r.date, "newest first");
    assert.ok(r.items.length >= 2);
    const text = [r.title, r.summary, ...r.items].join(" ");
    assert.equal(/\b(AGI|superintelligen|accura(te|cy) of \d|\d+% (more )?(accurate|better|faster)|confidence score|best-in-class|state of the art|#1)\b/i.test(text), false, `banned claim in ${r.id}`);
    assert.equal(/\bcolou?r\b|\bcentre\b|\boptimis/i.test(text), false, "US English");
  }
});

test("release notes: internal links resolve, listed in sitemap with a real lastmod, feed is valid Atom", async () => {
  const known = new Set([...sitemapPaths, "/answers", "/status", "/download", "/product", "/about", "/how-it-works", "/models", "/pricing"]);
  const docs = new Set(allDocs().map((d) => d.path));
  for (const r of releases) for (const l of r.links ?? []) assert.ok(known.has(l.href) || docs.has(l.href), `${r.id}: ${l.href}`);
  assert.ok(sitemapPaths.includes("/changelog"));
  assert.equal(lastmodFor("/changelog"), latestRelease());
  const xml = await feed().text();
  assert.ok(xml.startsWith("<?xml") && xml.includes("<feed") && xml.split("<entry>").length - 1 === releases.length);
  assert.equal(xml.includes("&&"), false);
});

test("organization: sameAs lists only the real GitHub organization", () => {
  const org = (siteGraph()["@graph"] as { "@type": string; sameAs?: string[] }[]).find((n) => n["@type"] === "Organization")!;
  assert.deepEqual(org.sameAs, ["https://github.com/keplarone"]);
});
