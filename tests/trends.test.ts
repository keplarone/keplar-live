import "./setup";
import assert from "node:assert/strict";
import { test } from "node:test";
import { glossary } from "../src/lib/kb/glossary";
import { buildPage, existingCoverage, GATES, matchTerm, overlap, runGates, screenQuery, termSlug, type Candidate, type SiteDoc } from "../src/lib/trends/logic";
import { parseTrendingRss } from "../src/lib/trends/sources";
import { adminPublish, adminRollback, adminRollbackAll, runTrends, siteDocs } from "../src/lib/trends/run";
import { allRows, getSettings, livePage, publishedRows, recentLog, saveSettings } from "../src/lib/trends/store";
import { GET as sitemapGet } from "../src/app/topics-sitemap.xml/route";

const docs: SiteDoc[] = siteDocs();
const termOf = (t: string) => glossary.find((g) => g.term.startsWith(t))!;

test("screen: AI-related and safe queries pass; brands, politics, adult, harm, claim bait, non-AI and junk do not", () => {
  for (const q of ["what is a judge model ai", "ai latency explained", "what is a transformer model in ai"]) assert.equal(screenQuery(q).ok, true, q);
  assert.equal(screenQuery("weather tomorrow").ok, false);
  for (const q of ["chatgpt agent", "claude vs gemini ai", "trump superintelligence", "ai porn generator", "ai suicide help", "is ai conscious", "best ai tools", "crypto ai token", "ai jailbreak prompts", "best time to visit maldives", "x", "ai <script>"]) assert.equal(screenQuery(q).ok, false, q);
});

test("match: a query maps to the most specific glossary term; unrelated queries match nothing", () => {
  assert.equal(matchTerm("what is a judge model in ai")?.term, "Judge model");
  assert.equal(matchTerm("rlhf explained")?.term.startsWith("RLHF"), true);
  assert.equal(matchTerm("ai prompt injection attacks")?.term, "Prompt injection");
  assert.equal(matchTerm("weather tomorrow"), null);
  assert.equal(termSlug(termOf("Large language model")), "large-language-model-llm");
});

test("coverage: a term whose intent an existing page owns is not rebuilt", () => {
  assert.ok(existingCoverage(termOf("Hallucination"), docs));
  assert.ok(existingCoverage(termOf("Superintelligence"), docs));
  assert.equal(existingCoverage(termOf("Judge model"), docs), null);
});

test("gates: thin, banned-claim, duplicate and slug-taken pages fail with a reason; a grounded page passes", () => {
  const t = termOf("Judge model");
  const c: Candidate = { query: "judge model ai", source: "related-rising", seed: "AI agents" };
  const ok = buildPage(c, t, docs, ["what is a judge model"], "2026-10-04");
  const others = docs.map((d) => ({ path: d.path, text: d.text }));
  const good = runGates(ok, others, []);
  assert.deepEqual(good.reasons, [], "a grounded, uncovered, long-enough term passes every gate");
  const thin = runGates({ ...ok, words: 80 }, others, []);
  assert.ok(thin.reasons.some((r) => r.startsWith("thin content")));
  const claim = runGates({ ...ok, intro: `${ok.intro} Keplar is superintelligence.` }, others, []);
  assert.ok(claim.reasons.some((r) => r.startsWith("no banned claims")));
  const pct = runGates({ ...ok, faq: [{ q: "q", a: "It is 97% more accurate than the rest." }] }, others, []);
  assert.ok(pct.reasons.some((r) => r.startsWith("no banned claims")));
  const dupe = runGates(ok, [{ path: "/x", text: ok.text }], []);
  assert.ok(dupe.reasons.some((r) => r.startsWith("duplicate content")));
  assert.ok(runGates(ok, others, [{ slug: ok.slug }]).reasons.some((r) => r.startsWith("slug free")));
  const short = runGates({ ...ok, definition: "Too short.", inKeplar: undefined }, others, []);
  assert.ok(short.reasons.some((r) => r.startsWith("substantive definition")));
  assert.equal(overlap("a b c d e f g", "a b c d e f g"), 1);
  assert.ok(GATES.maxSimilarity < 1);
});

test("built page: dated source note, no volumes of ours, no superintelligence/AGI claims, links to the library", () => {
  const p = buildPage({ query: "ai latency", source: "trending-rss", traffic: "500+", news: [{ title: "A story", source: "Example", url: "https://example.com/a" }] }, termOf("Latency"), docs, [], "2026-10-04");
  assert.ok(p.observed.note.includes("2026-10-04") && p.observed.note.includes("500+"));
  assert.ok(p.library.length >= 2 && p.library.every((l) => l.path.startsWith("/")));
  assert.equal(/keplar is (agi|superintelligen)/i.test(p.text), false);
  assert.ok(p.title.length <= 70 && p.description.length <= 175);
});

test("rss parser reads titles, traffic bucket and https news links only", () => {
  const xml = `<rss><channel><item><title>ai agents &amp; tools</title><ht:approx_traffic>2000+</ht:approx_traffic><ht:news_item><ht:news_item_title>Story</ht:news_item_title><ht:news_item_url>https://e.com/x</ht:news_item_url><ht:news_item_source>E</ht:news_item_source></ht:news_item><ht:news_item><ht:news_item_title>Bad</ht:news_item_title><ht:news_item_url>javascript:alert(1)</ht:news_item_url><ht:news_item_source>X</ht:news_item_source></ht:news_item></item></channel></rss>`;
  const [c] = parseTrendingRss(xml);
  assert.equal(c.query, "ai agents & tools");
  assert.equal(c.traffic, "2000+");
  assert.equal(c.news?.length, 1);
});

test("run: default is held (auto-publish off); on => published within the daily cap; kill switch hides pages; rollback is final; log is kept", async () => {
  const fixed = new Date("2026-10-04T10:00:00Z");
  const deps = {
    now: () => fixed,
    seeds: ["artificial intelligence"],
    trending: async () => ({ items: [{ query: "ai latency", source: "trending-rss" as const, traffic: "500+" }, { query: "chatgpt news", source: "trending-rss" as const }, { query: "friday the 13th", source: "trending-rss" as const }] }),
    related: async () => ({ items: [{ query: "what is a judge model ai", source: "related-rising" as const, seed: "artificial intelligence" }, { query: "ai hallucination examples", source: "related-rising" as const, seed: "artificial intelligence" }, { query: "ai porn", source: "related-rising" as const, seed: "x" }] }),
    ping: async (urls: string[]) => `pinged ${urls.length}`,
  };
  // 1. auto-publish off by default: nothing is live
  const a = await runTrends(deps);
  assert.equal(a.published.length, 0);
  assert.ok(a.screened < a.candidates, "unsafe, brand and non-AI queries were screened out");
  assert.ok(a.rejected.some((r) => r.slug.includes("hallucination") && r.reasons[0].startsWith("already covered")));
  assert.equal((await publishedRows()).length, 0);
  const heldSlugs = a.held;
  assert.ok(heldSlugs.length > 0, "the judge-model query becomes a held page");
  // 2. auto-publish on, cap of 1 per day: held rows are left to a human, new ones obey the cap
  await saveSettings({ autoPublish: true, maxPerDay: 1 }, "test@example.com");
  const b = await runTrends({ ...deps, related: async () => ({ items: [{ query: "ai latency", source: "related-rising" as const }, { query: "open weight model ai", source: "related-rising" as const }, { query: "ai panel of models", source: "related-rising" as const }] }) });
  assert.ok(b.published.length <= 1);
  for (const s of heldSlugs) assert.equal((await allRows()).find((r) => r.id === s)?.status, "held");
  // 3. a human approves a held page; it goes live and is in the sitemap
  if (heldSlugs[0]) {
    assert.equal(await adminPublish(heldSlugs[0], "test@example.com", fixed), true);
    assert.ok(await livePage(heldSlugs[0]));
    assert.ok((await (await sitemapGet()).text()).includes(`/topics/${heldSlugs[0]}`));
    // 4. kill switch: page 404s, leaves the sitemap, and runs skip
    await saveSettings({ paused: true }, "test@example.com");
    assert.equal(await livePage(heldSlugs[0]), null);
    assert.equal((await (await sitemapGet()).text()).includes(`/topics/${heldSlugs[0]}`), false);
    assert.equal((await runTrends(deps)).skipped, "paused");
    await saveSettings({ paused: false }, "test@example.com");
    // 5. rollback is final: never republished by a later run
    assert.equal(await adminRollback(heldSlugs[0], "test@example.com"), true);
    assert.equal(await livePage(heldSlugs[0]), null);
    await runTrends({ ...deps, now: () => new Date("2026-10-05T10:00:00Z") });
    assert.equal((await allRows()).find((r) => r.id === heldSlugs[0])?.status, "rolled_back");
  }
  assert.ok((await getSettings()).maxPerDay === 1);
  assert.ok((await recentLog(50)).length >= 4);
  assert.equal(typeof (await adminRollbackAll("test@example.com")), "number");
});

