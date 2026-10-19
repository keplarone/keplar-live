import { test } from "node:test";
import assert from "node:assert/strict";
import { gatePage, metadataCollisions, nearDuplicates, overlap, QUALITY, shingles } from "../src/lib/seo/quality";

const words = (n: number, seed = "alpha") => Array.from({ length: n }, (_, i) => `${seed}${i % 97} word${(i * 7) % 31}`).join(" ");

const page = (path: string, text: string, extra: Partial<Parameters<typeof gatePage>[0]> = {}) => ({
  path,
  title: `A title long enough for ${path}`.slice(0, QUALITY.titleMax),
  description: `A description of ${path} that is long enough to pass the minimum length the gate asks for in search results.`,
  text,
  ...extra,
});

test("quality: shingles ignore case and punctuation, overlap is symmetric", () => {
  const a = shingles("One, two three FOUR five six seven");
  const b = shingles("one two three four five six SEVEN!");
  assert.deepEqual([...a], [...b]);
  assert.equal(shingles("too short").size, 0);
  const x = shingles(words(60, "x"));
  const y = shingles(words(60, "x") + " " + words(60, "y"));
  const o = overlap(x, y);
  assert.deepEqual(overlap(y, x), o);
  assert.ok(o.containment > 0.9 && o.jaccard < 0.6, JSON.stringify(o));
});

test("quality: a copied page is a near-duplicate, a distinct page is not", () => {
  const original = page("/a", words(200, "a"));
  const copy = page("/b", words(200, "a") + " and a few words more");
  const other = page("/c", words(200, "c"));
  const dupes = nearDuplicates([original, copy, other]);
  assert.deepEqual(dupes.map((d) => [d.a, d.b]), [["/a", "/b"]]);
  assert.ok(dupes[0].jaccard > QUALITY.maxJaccard);
});

test("quality: metadata collisions are case-insensitive and name every page", () => {
  const c = metadataCollisions([
    page("/a", "x", { title: "Same Title Here For All", description: "Different description number one, long enough to count as a description." }),
    page("/b", "x", { title: "same title here for all", description: "Different description number two, long enough to count as a description." }),
    page("/c", "x", { title: "Another title entirely", description: "Different description number two, long enough to count as a description." }),
  ]);
  assert.deepEqual(c.map((x) => [x.kind, x.paths]), [["title", ["/a", "/b"]], ["description", ["/b", "/c"]]]);
});

test("quality: gatePage reports every failed check with a reason", () => {
  const thin = gatePage(page("/thin", "only a few words here", { title: "Short", description: "Too short", h1: 2, internalLinks: [] }), { minWords: 300, minInternalLinks: 2, banned: [/\bguaranteed\b/i] });
  assert.equal(thin.pass, false);
  assert.deepEqual(thin.checks.filter((c) => !c.ok).map((c) => c.name), ["title length", "description length", "body length", "one h1", "internal links"]);
  assert.ok(thin.reasons.every((r) => r.includes(":")));
  const good = gatePage(page("/good", words(400, "g"), { h1: 1, internalLinks: ["/docs", "/pricing", "/good"] }), { minWords: 300, minInternalLinks: 2, banned: [/\bguaranteed\b/i], others: [page("/other", words(400, "o"))] });
  assert.equal(good.pass, true, good.reasons.join("; "));
  const copied = gatePage(page("/copy", words(400, "o")), { minWords: 300, others: [page("/other", words(400, "o"))] });
  assert.equal(copied.pass, false);
  assert.match(copied.reasons.join(), /not a near-duplicate: \/other/);
  const claimed = gatePage(page("/claim", `${words(400, "q")} results are guaranteed to be right`), { minWords: 300, banned: [/\bguaranteed\b/i] });
  assert.match(claimed.reasons.join(), /banned wording/);
});
