import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { signIn } from "./helpers/session";
import { featureSite, getPage } from "./helpers/feature-site";
import { highlight, plainText, search, terms } from "@/lib/site-builder/features/search";

const SEARCH = '<div data-k-feature="search" data-k-id="find" data-k-title="Find it"></div>';
const GATE = '<div data-k-feature="members" data-k-id="area" data-k-gate="page"></div>';

test("plain text, terms and ranking", () => {
  assert.equal(plainText("<head><title>x</title></head><h1>Rye &amp; seed</h1><script>alert(1)</script><style>p{}</style><p>Fresh&nbsp;bread</p>"), "Rye & seed Fresh bread");
  assert.deepEqual(terms("  Rye, BREAD! a "), ["rye", "bread"]);
  const files = {
    "index.html": "<title>Home</title><h1>Welcome</h1><p>We bake rye bread daily.</p>",
    "menu.html": "<title>Menu</title><h1>Rye menu</h1><p>Rye loaf, rye rolls, rye crackers.</p>",
    "404.html": "<h1>Not found</h1><p>rye</p>",
    "members.html": `<h1>Secret rye starter</h1>${GATE}`,
  };
  const hits = search(files, "rye");
  assert.deepEqual(hits.map((h) => h.file), ["menu.html", "index.html"], "title hits first; 404 and members-only pages never appear");
  assert.deepEqual(search(files, "rye bread").map((h) => h.file), ["index.html"], "all words must match");
  assert.deepEqual(search(files, "zzz"), []);
  assert.deepEqual(search(files, "a"), []);
  assert.equal(highlight("Rye <b>x</b> & rye", ["rye"]), "<mark>Rye</mark> &lt;b&gt;x&lt;/b&gt; &amp; <mark>rye</mark>");
});

test("the search box renders a GET form; results come inside the site's own page, escaped, and respect members-only pages", async () => {
  const { cookie, workspaceId } = await signIn("srch1@example.com");
  const s = await featureSite(cookie, workspaceId, "Mill Lane", {
    "index.html": `<h1>Mill Lane</h1><p>Sourdough, rye and seeded loaves.</p>${SEARCH}`,
    "story.html": "<h1>Our story</h1><p>Since 1998 we have baked <b>rye</b> bread on Mill Lane.</p>",
    "members.html": `<h1>Starter</h1><p>The secret rye starter recipe.</p>${GATE}`,
  });
  const home = await (await getPage(s.slug)).text();
  assert.match(home, new RegExp(`<form class="k-form k-feat k-feat--search" method="get" action="/s/${s.slug}/_search"`));
  assert.match(home, /name="q"/);
  const res = await getPage(s.slug, ["_search"], "?q=rye");
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /<title>Search - Mill Lane<\/title>/);
  assert.match(html, /2 results for “rye”/);
  assert.match(html, /href="\/s\/[^"]+\/story"/);
  assert.match(html, /<mark>rye<\/mark>/i);
  assert.doesNotMatch(html, /secret rye starter/i, "text behind a members gate is never searchable");
  assert.match(html, /<meta name="robots" content="noindex">/);
  // hostile queries stay text
  const evil = await (await getPage(s.slug, ["_search"], "?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E")).text();
  assert.doesNotMatch(evil, /<script>alert/);
  assert.match(evil, /Nothing on this site matches/);
  assert.match(await (await getPage(s.slug, ["_search"], "?q=")).text(), /Type a word/);
});

test("search never reaches another site's pages or a site that isn't published", async () => {
  const a = await signIn("srch2a@example.com");
  const b = await signIn("srch2b@example.com");
  const sa = await featureSite(a.cookie, a.workspaceId, "Alpha", { "index.html": `<h1>Alpha</h1><p>unicorn-ledger</p>${SEARCH}` });
  const sb = await featureSite(b.cookie, b.workspaceId, "Beta", { "index.html": `<h1>Beta</h1><p>walrus-ledger</p>${SEARCH}` });
  assert.match(await (await getPage(sa.slug, ["_search"], "?q=ledger")).text(), /1 result for/);
  assert.doesNotMatch(await (await getPage(sa.slug, ["_search"], "?q=ledger")).text(), /walrus/);
  assert.doesNotMatch(await (await getPage(sb.slug, ["_search"], "?q=ledger")).text(), /unicorn/);
  assert.equal((await getPage("no-such-site", ["_search"], "?q=x")).status, 404);
});

test("search is rate limited per visitor", async () => {
  const { cookie, workspaceId } = await signIn("srch3@example.com");
  const s = await featureSite(cookie, workspaceId, "Gamma", { "index.html": `<h1>Gamma</h1>${SEARCH}` });
  const route = await import("@/app/s/[slug]/[[...path]]/route");
  const { call } = await import("./helpers/session");
  const codes: number[] = [];
  for (let i = 0; i < 65; i++) codes.push((await route.GET(call(null, `/s/${s.slug}/_search?q=x`, { headers: { "x-forwarded-for": "198.51.100.77" } }), { params: Promise.resolve({ slug: s.slug, path: ["_search"] }) })).status);
  assert.ok(codes.includes(429), codes.slice(55).join(","));
});
