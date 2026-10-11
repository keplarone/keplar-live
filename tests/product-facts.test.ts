import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_FEATURES } from "../src/lib/features";
import { FACT_SECTIONS, factLines, factsText, NOT_JUST_MULTI_MODEL, WHAT_IS_KEPLAR } from "../src/lib/content/product-facts";
import { softwareApp, organizationNode } from "../src/lib/structuredData";
import { sitemapPaths } from "../src/app/sitemap";
import { staticLastmod } from "../src/lib/content/lastmod";
import { faq } from "../src/lib/faq";

test("product facts: every product area is described, not only the multi-model answer", () => {
  const all = [WHAT_IS_KEPLAR, NOT_JUST_MULTI_MODEL, ...factLines()].join("\n");
  for (const area of ["Study mode", "Deep Research", "Debate", "slideshow", "Image generation", "Video generation", "websites", "Roblox Studio", "Scheduled agents", "Approvals", "Projects", "memory", "Specialists", "MCP", "Desktop app", "Public API", "Embeddable widget", "Keplar Business"]) {
    assert.match(all, new RegExp(area, "i"), area);
  }
  assert.ok(factLines().length >= 40, `${factLines().length} facts`);
});

test("product facts: statuses come from the feature registry, and no hype or AGI claims", () => {
  for (const f of FACT_SECTIONS.flatMap((s) => s.facts)) {
    if (f.feature) assert.ok(ALL_FEATURES.some((x) => x.id === f.feature), `${f.name}: unknown feature id ${f.feature}`);
  }
  const text = factsText((p) => `https://keplar.one${p}`);
  assert.match(text, /not AGI or superintelligence/);
  assert.doesNotMatch(text, /\b(best|most accurate|fastest|guarantee[sd]?|never wrong)\b/i);
  assert.doesNotMatch(text, /\b(?:he|she|his|her|him)\b/);
});

test("structured data, home FAQ and sitemap carry the full picture", () => {
  const app = softwareApp();
  assert.equal(app.description, WHAT_IS_KEPLAR);
  assert.deepEqual(app.featureList, factLines());
  assert.match(app.operatingSystem, /Windows/);
  assert.match(organizationNode().description, /Roblox Studio/);
  assert.match(faq[0]!.a, /Study mode/);
  assert.ok(sitemapPaths.includes("/what-is-keplar"));
  assert.ok(staticLastmod["/what-is-keplar"]);
});
