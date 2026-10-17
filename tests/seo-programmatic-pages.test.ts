import "./setup";
import assert from "node:assert/strict";
import { test } from "node:test";
import { sitemapPaths } from "../src/app/sitemap";
import { guides } from "../src/lib/content/guides";
import { citationGuide, guideBody, limitsGuide } from "../src/lib/seo/worked-guides";
import { decidePublish, includeInSitemap } from "../src/lib/seo/programmatic";
import { formatCitation } from "../src/lib/seo/tools";

const sample = {
  authors: "Ada Lovelace",
  title: "Notes on the analytical engine",
  year: "1843",
  container: "Taylor's Scientific Memoirs",
  url: "https://example.com/notes",
};

test("worked guides are generated from the formatter and the tool list, and they pass the quality gate", () => {
  const apa = formatCitation({ ...sample, style: "apa" });
  const mla = formatCitation({ ...sample, style: "mla" });
  const chicago = formatCitation({ ...sample, style: "chicago", accessed: "October 17, 2026" });
  assert.equal(apa.ok && mla.ok && chicago.ok, true);
  if (!apa.ok || !mla.ok || !chicago.ok) return;
  const cite = guideBody(citationGuide);
  assert.ok(cite.includes(apa.text), "APA line is the formatter output");
  assert.ok(cite.includes(mla.text));
  assert.ok(cite.includes(chicago.text));
  assert.match(cite, /does not search the web/);
  assert.match(guideBody(limitsGuide), /cost above zero/);
  assert.match(guideBody(limitsGuide), /Citation formatter/);
  assert.match(guideBody(limitsGuide), /not Study mode/);

  const taken = guides.map((g) => ({ path: g.path, title: g.title, description: g.metaDescription, h1: g.title }));
  for (const g of [citationGuide, limitsGuide]) {
    const others = guides.filter((o) => o.path !== g.path).map((o) => ({ path: o.path, text: guideBody(o) }));
    const report = decidePublish(
      { path: g.path, title: g.title, description: g.metaDescription, h1: g.title, body: guideBody(g), links: g.related },
      others,
      taken,
    );
    assert.equal(report.indexable, true, `${g.path}: ${report.reasons.join("; ")}`);
    assert.equal(includeInSitemap(report), true);
    assert.ok(sitemapPaths.includes(g.path), g.path);
  }
});
