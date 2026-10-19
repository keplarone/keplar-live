import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkCitations, citedPages, judgePage, MIN_EVIDENCE_CHARS, numbersIn, plainText, wordsIn } from "@/lib/research/citation-check";
import { addSources, linkCitations } from "@/lib/orchestration/research";
import type { ResearchSource } from "@/lib/orchestration/types";

const src = (n: number): ResearchSource => ({ n, title: `Page ${n}`, url: `https://site${n}.example.com/page`, host: `site${n}.example.com`, query: 0 });
const SOURCES = [src(1), src(2), src(3), src(4)];

// Page texts as a search returns them: long enough to judge.
const EIFFEL = "The Eiffel Tower is a wrought-iron lattice tower on the Champ de Mars in Paris. It was completed in 1889 as the entrance arch to the Exposition Universelle, and was designed by the engineering firm of Gustave Eiffel. The tower is 330 metres tall.";
const COFFEE = "Coffee is a beverage brewed from roasted coffee beans. Brazil is the largest producer of coffee in the world, followed by Vietnam and Colombia, and most beans are arabica or robusta varieties grown in tropical regions.";
const POPULATION = "Paris had an estimated population of 2.1 million residents in January 2023, according to the national statistics office, making it the fourth-most populous city in the European Union.";
const evidence = (m: Record<number, string>) => new Map(Object.entries(m).map(([k, v]) => [Number(k), v]));

test("text helpers: Markdown stripped, numbers normalised, stop words dropped", () => {
  assert.equal(plainText("**Paris** is [big](https://x.y) [1]."), "Paris is big.");
  assert.deepEqual(numbersIn("It cost 1,200 dollars in 1889, about 3.50 each, 2 options, 7%"), ["1200", "1889", "3.5", "7"]);
  assert.ok(!wordsIn("which would have been there").length, "only stop words: nothing to check");
  assert.deepEqual(wordsIn("Towers completed"), ["tower", "complet"]);
});

test("judgePage: supports, partial, conflict, unrelated and unchecked", () => {
  assert.equal(judgePage("The Eiffel Tower was completed in 1889.", EIFFEL).verdict, "supports");
  assert.equal(judgePage("The Eiffel Tower was completed in 1887 by Gustave Eiffel's firm.", EIFFEL).verdict, "partial", "a number the page doesn't have is never 'supported'");
  const c = judgePage("The Eiffel Tower is 300 metres tall.", EIFFEL);
  assert.equal(c.verdict, "conflict");
  assert.match(c.quote!, /330 metres/, "the conflicting passage is quoted from the page");
  assert.equal(judgePage("The Eiffel Tower was completed in 1889.", COFFEE).verdict, "unrelated", "a page about something else");
  assert.equal(judgePage("The Eiffel Tower was completed in 1889.", undefined).verdict, "unchecked");
  assert.equal(judgePage("The Eiffel Tower was completed in 1889.", "Coffee beans.").verdict, "partial", `a page under ${MIN_EVIDENCE_CHARS} characters is never called unrelated`);
});

test("a correct citation is kept and counted as supported", () => {
  const r = checkCitations("The Eiffel Tower was completed in 1889 [1].", SOURCES, evidence({ 1: EIFFEL }));
  assert.equal(r.markdown, "The Eiffel Tower was completed in 1889 [1].");
  assert.equal(r.check.by, "server");
  assert.deepEqual(r.check.summary, { claims: 1, supported: 1, partiallySupported: 0, conflicting: 0, notVerified: 0, removedCitations: 0, removedLinks: 0, uncitedFacts: 0 });
  assert.deepEqual(r.check.claims, [], "supported statements are not listed");
});

test("a mismatched citation (the page is about something else) is removed; the sentence stays and is listed", () => {
  const md = "The Eiffel Tower was completed in 1889 [2]. Brazil is the largest coffee producer [2].";
  const r = checkCitations(md, SOURCES, evidence({ 1: EIFFEL, 2: COFFEE }));
  assert.equal(r.markdown, "The Eiffel Tower was completed in 1889. Brazil is the largest coffee producer [2].");
  assert.equal(r.check.summary.removedCitations, 1);
  assert.equal(r.check.summary.notVerified, 1);
  assert.equal(r.check.summary.supported, 1);
  const [claim] = r.check.claims;
  assert.equal(claim.status, "not-verified");
  assert.equal(claim.text, "The Eiffel Tower was completed in 1889.", "the listed text is the plain sentence");
  assert.match(claim.note!, /doesn't mention this, so its citation was removed/);
  assert.match(claim.note!, /Page 1 matches it better; it wasn't cited/, "the page that does match is named, never silently re-pointed");
  assert.deepEqual(citedPages(r.markdown, SOURCES), [2]);
});

test("a fabricated number (no read page) is dropped by linkCitations before the check, and the check never brings it back", () => {
  const linked = linkCitations("The tower is 330 metres tall [9].", SOURCES);
  assert.equal(linked.markdown, "The tower is 330 metres tall.");
  const r = checkCitations(linked.markdown, SOURCES, evidence({ 1: EIFFEL }));
  assert.equal(r.markdown, linked.markdown);
  assert.equal(r.check.summary.claims, 0, "an uncited sentence is not a cited claim");
  assert.equal(r.check.summary.uncitedFacts, 1, "but it is counted as an uncited fact");
  // A marker for a page that wasn't read is never judged, even if the check is called directly.
  assert.equal(checkCitations("The tower is 330 metres tall [9].", SOURCES, evidence({ 9: EIFFEL })).check.summary.claims, 0);
});

test("a different number for the same unit is a conflict, with the page's passage", () => {
  const r = checkCitations("Paris has about 2.4 million residents [3].", SOURCES, evidence({ 3: POPULATION }));
  assert.equal(r.markdown, "Paris has about 2.4 million residents [3].", "a conflicting citation is kept so the person can open the page");
  assert.equal(r.check.summary.conflicting, 1);
  assert.equal(r.check.claims[0].status, "conflicting");
  assert.equal(r.check.claims[0].conflict!.n, 3);
  assert.match(r.check.claims[0].conflict!.quote, /2\.1 million/);
});

test("pages that back a sentence only together are 'partly supported'; a page with no text is 'not verified' and keeps its marker", () => {
  const together = checkCitations("The Eiffel Tower was completed in 1889 and Paris had 2.1 million residents in 2023 [1][3].", SOURCES, evidence({ 1: EIFFEL, 3: POPULATION }));
  assert.equal(together.check.claims[0]?.status ?? "supported", "partially-supported");
  assert.match(together.check.claims[0].note!, /only together/);
  assert.match(together.markdown, /\[1\]\[3\]/);
  const blind = checkCitations("The Eiffel Tower was completed in 1889 [4].", SOURCES, evidence({}));
  assert.equal(blind.markdown, "The Eiffel Tower was completed in 1889 [4].");
  assert.equal(blind.check.claims[0].status, "not-verified");
  assert.match(blind.check.claims[0].note!, /no text for the cited page/);
  assert.equal(blind.check.summary.removedCitations, 0);
});

test("code, links, decimals and line breaks are left alone; only the mismatched markers go", () => {
  const md = "## Summary\n\n- The Eiffel Tower is 330 metres tall [1][2].\n- Use `arr[2]` here.\n\n```js\nx[2] = 1 // [2]\n```\nSee [the page](https://site1.example.com/page). Version 3.5 shipped [1].";
  const r = checkCitations(md, SOURCES, evidence({ 1: EIFFEL, 2: COFFEE }));
  // [2] on the tower sentence is the coffee page; "Version 3.5 shipped" shares nothing with the tower page, so its [1] goes too.
  assert.equal(r.markdown, md.replace("tall [1][2].", "tall [1].").replace("shipped [1].", "shipped."));
  assert.equal(r.check.summary.removedCitations, 2);
  assert.ok(r.markdown.includes("`arr[2]`") && r.markdown.includes("x[2] = 1 // [2]"));
});

test("the listed statements are capped and the most serious come first; the summary still counts all", () => {
  const lines = Array.from({ length: 15 }, (_, i) => `Brazil grew ${100 + i} tonnes of tea leaves [1].`).join(" ") + " The Eiffel Tower is 300 metres tall [1].";
  const r = checkCitations(lines, SOURCES, evidence({ 1: EIFFEL }));
  assert.equal(r.check.summary.claims, 16);
  assert.equal(r.check.claims.length, 12);
  assert.equal(r.check.claims[0].status, "conflicting");
});

test("addSources keeps a longer evidence text than the snippet it shows", () => {
  const all: ResearchSource[] = [];
  const ev = new Map<number, string>();
  addSources(all, [{ url: "https://a.example.com", title: "A", snippet: "word ".repeat(300) }, { url: "https://b.example.com", title: "B" }], 0, ev);
  assert.equal(all[0].snippet!.length, 280);
  assert.ok(ev.get(1)!.length > 1000, "the check reads more of the page than the popover shows");
  assert.equal(ev.has(2), false, "no text came back for page 2: nothing stored, so it reads as unchecked");
});

test("the answer card shows the server check: header counts, the statements, and how many citations were removed", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { CitationChecks, ResearchHead } = await import("../src/components/app-ui/research/Research");
  const r = checkCitations("The Eiffel Tower was completed in 1889 [2]. Brazil is the largest coffee producer [2]. The tower is 330 metres tall [1].", SOURCES, evidence({ 1: EIFFEL, 2: COFFEE }));
  const research = { queries: ["q"], sources: SOURCES, cited: citedPages(r.markdown, SOURCES), checked: r.check };
  const head = renderToStaticMarkup(createElement(ResearchHead, { research }));
  assert.match(head, /Citations: 2 supported · 1 not verified/);
  const html = renderToStaticMarkup(createElement(CitationChecks, { checked: r.check, via: "server" }));
  assert.match(html, /data-citation-checks="server"/);
  assert.match(html, /1 statement needs a closer look/);
  assert.match(html, /Keplar compared each cited sentence with the text the search returned/);
  assert.match(html, /1 citation was removed because the page didn&#x27;t mention the sentence\./);
  assert.match(html, /Not verified/, "the status is a word, not only a colour");
  assert.doesNotMatch(html, /desktop app/, "the server check never claims to be the desktop's");
  const none = checkCitations("The tower is 330 metres tall [1].", SOURCES, evidence({ 1: EIFFEL }));
  assert.equal(renderToStaticMarkup(createElement(CitationChecks, { checked: none.check, via: "server" })), "", "nothing to look at: no panel");
});
