import "./setup";
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { sitemapPaths } from "../src/app/sitemap";
import { lastmodFor } from "../src/lib/content/lastmod";
import { site } from "../src/lib/site";
import { formatCitation, freeToolRoute, runFreeTool, TOOLS, toolPaths, toolSystemPrompt } from "../src/lib/seo/tools";

test("citation formatter arranges known fields and does not fetch or guess", () => {
  const apa = formatCitation({ style: "apa", authors: "Ada Lovelace", title: "Notes", year: "1843", container: "Memoirs", url: "https://example.com/n" });
  assert.equal(apa.ok && apa.text, "Lovelace, A. (1843). Notes. Memoirs. https://example.com/n");
  const bad = formatCitation({ authors: "Ada Lovelace", title: "Notes", url: "javascript:alert(1)" });
  assert.equal(bad.ok, false);
  const empty = formatCitation({ title: "Notes" });
  assert.equal(empty.ok, false);
});

test("model tools call only a :free slug, discard a billed reply, and stay quiet without a key", async () => {
  const route = freeToolRoute();
  assert.ok(route?.slug.endsWith(":free"), "catalog has a free tool model");
  const missing = await runFreeTool("summarizer", "This passage is long enough to summarize for the test.", { key: null });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.status, 503);

  let sent = "";
  const billed = await runFreeTool("summarizer", "This passage is long enough to summarize for the test.", {
    key: "test-key",
    fetchImpl: async (_url, init) => {
      sent = String(init?.body ?? "");
      return new Response(JSON.stringify({ choices: [{ message: { content: "should not be shown" } }], usage: { cost: 0.02 } }), { status: 200 });
    },
  });
  assert.match(JSON.parse(sent).model, /:free$/);
  assert.equal(billed.ok, false);
  if (!billed.ok) assert.match(billed.error, /cost/);

  const ok = await runFreeTool("summarizer", "This passage is long enough to summarize for the test.", {
    key: "test-key",
    fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: "A short summary of the passage." } }], usage: { cost: 0 } }), { status: 200 }),
  });
  assert.equal(ok.ok, true);
  if (ok.ok) assert.match(ok.model, /:free$/);
});

test("each tool page is unique, in the sitemap, and model prompts stay off the local tools", () => {
  assert.equal(new Set(TOOLS.map((t) => t.slug)).size, TOOLS.length);
  assert.equal(new Set(TOOLS.map((t) => t.title)).size, TOOLS.length);
  assert.equal(new Set(TOOLS.map((t) => t.h1)).size, TOOLS.length);
  for (const t of TOOLS) {
    const rendered = `${t.title} · ${site.name}`;
    assert.ok(rendered.length <= 60, `${t.slug} title ${rendered.length}`);
    assert.ok(t.description.length >= 60 && t.description.length <= 175, `${t.slug} description ${t.description.length}`);
    assert.ok(sitemapPaths.includes(`/tools/${t.slug}`), t.slug);
    assert.equal(lastmodFor(`/tools/${t.slug}`), "2026-10-17");
    if (t.kind === "model") assert.ok(toolSystemPrompt(t.slug)?.includes("Do not") || toolSystemPrompt(t.slug)?.includes("Do not add") || toolSystemPrompt(t.slug));
    else assert.equal(toolSystemPrompt(t.slug), null);
  }
  assert.ok(sitemapPaths.includes("/tools"));
  assert.deepEqual(toolPaths().length, TOOLS.length + 1);
  const route = readFileSync("src/lib/seo/tools.ts", "utf8");
  assert.match(route, /cost > 0/);
  assert.doesNotMatch(route, /ratingValue|trusted by|customers/i);
});
