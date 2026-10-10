import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { signIn, jsonReq, call } from "./helpers/session";
import { featureSite, getPage } from "./helpers/feature-site";
import { excerptOf, renderBody, slugify } from "@/lib/site-builder/features/blog";

const BLOG = '<div data-k-feature="blog" data-k-id="posts" data-k-title="Notes from the oven" data-k-seed="Hello from the bakery;We opened our doors this week.|Slow rise;Twenty hours of fermentation."></div>';
const SEARCH = '<div data-k-feature="search" data-k-id="find"></div>';

type Post = { id: string; slug: string; title: string; status: string };
type BlogBody = { post: Post; blogs: { posts: Post[] }[] };
async function api(cookie: string, siteId: string, method: "GET" | "POST" | "PATCH" | "DELETE", payload?: unknown) {
  const route = await import("@/app/api/sites/[id]/blog/route");
  const ctx = { params: Promise.resolve({ id: siteId }) };
  const res = method === "GET" ? await route.GET(call(cookie, `/api/sites/${siteId}/blog`), ctx) : await route[method](jsonReq(cookie, `/api/sites/${siteId}/blog`, method, payload), ctx);
  return { status: res.status, body: (await res.json()) as BlogBody };
}
async function publish(cookie: string, siteId: string) {
  const pub = await import("@/app/api/sites/[id]/publish/route");
  return pub.POST(jsonReq(cookie, `/api/sites/${siteId}/publish`, "POST"), { params: Promise.resolve({ id: siteId }) });
}

test("text helpers: slug, excerpt, body is escaped and shaped", () => {
  assert.equal(slugify("  Crème brûlée & Co! "), "creme-brulee-co");
  assert.equal(slugify("!!!"), "post");
  assert.equal(excerptOf("## Heading\n\nFirst paragraph here.\n\nSecond."), "First paragraph here.");
  const html = renderBody("## Big\n\nHello <script>alert(1)</script>\nline two\n\n- one\n- <b>two</b>");
  assert.equal(html, "<h2>Big</h2><p>Hello &lt;script&gt;alert(1)&lt;/script&gt;<br>line two</p><ul><li>one</li><li>&lt;b&gt;two&lt;/b&gt;</li></ul>");
});

test("a blog: seeded once on publish, drafts are private, publish/edit/delete are live at once, hostile text stays text", async () => {
  const { cookie, workspaceId } = await signIn("blog1@example.com");
  const s = await featureSite(cookie, workspaceId, "Mill Lane", { "index.html": `<h1>Home</h1>${BLOG}${SEARCH}` });
  let v = await api(cookie, s.id, "GET");
  assert.deepEqual(v.body.blogs[0].posts.map((p) => p.title).sort(), ["Hello from the bakery", "Slow rise"]);
  const home = await (await getPage(s.slug)).text();
  assert.match(home, /Notes from the oven/);
  assert.match(home, new RegExp(`href="/s/${s.slug}/_blog/posts/hello-from-the-bakery"`));
  const post = await getPage(s.slug, ["_blog", "posts", "hello-from-the-bakery"]);
  assert.equal(post.status, 200);
  const ph = await post.text();
  assert.match(ph, /<h1>Hello from the bakery<\/h1>/);
  assert.match(ph, /We opened our doors/);
  assert.match(ph, /<title>Hello from the bakery - Mill Lane<\/title>/);

  // owner deletes a seed post; republishing never brings it back
  const seed = v.body.blogs[0].posts.find((p) => p.slug === "slow-rise");
  assert.equal((await api(cookie, s.id, "DELETE", { key: "posts", id: seed?.id })).status, 200);
  await publish(cookie, s.id);
  v = await api(cookie, s.id, "GET");
  assert.equal(v.body.blogs[0].posts.length, 1);
  assert.equal((await getPage(s.slug, ["_blog", "posts", "slow-rise"])).status, 404);

  // a draft is never served
  const draft = await api(cookie, s.id, "POST", { key: "posts", title: "Secret <b>menu</b>", body: "Coming soon with <script>alert(1)</script>", publish: false });
  assert.equal(draft.status, 201);
  assert.equal(draft.body.post.status, "draft");
  assert.doesNotMatch(await (await getPage(s.slug)).text(), /Secret/);
  assert.equal((await getPage(s.slug, ["_blog", "posts", "secret-b-menu-b"])).status, 404);
  assert.doesNotMatch(await (await getPage(s.slug, ["_search"], "?q=secret")).text(), /Secret/);

  // publish: live without republishing the site; hostile text is escaped everywhere
  const up = await api(cookie, s.id, "PATCH", { key: "posts", id: draft.body.post.id, status: "published" });
  assert.equal(up.body.post.status, "published");
  const list = await (await getPage(s.slug)).text();
  assert.match(list, /Secret &lt;b&gt;menu&lt;\/b&gt;/);
  assert.doesNotMatch(list, /<b>menu/);
  const pg = await (await getPage(s.slug, ["_blog", "posts", draft.body.post.slug])).text();
  assert.doesNotMatch(pg, /<script>alert/);
  assert.match(pg, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(await (await getPage(s.slug, ["_search"], "?q=secret")).text(), /1 result/);

  // edit is live at once; same title gets a distinct slug
  await api(cookie, s.id, "PATCH", { key: "posts", id: draft.body.post.id, title: "Edited title", body: "New words." });
  assert.match(await (await getPage(s.slug)).text(), /Edited title/);
  const dup = await api(cookie, s.id, "POST", { key: "posts", title: "Hello from the bakery", body: "Again", publish: true });
  assert.equal(dup.body.post.slug, "hello-from-the-bakery-2");
  // validation
  assert.equal((await api(cookie, s.id, "POST", { key: "posts", title: "  ", body: "x" })).status, 400);
  assert.equal((await api(cookie, s.id, "POST", { key: "nope", title: "x" })).status, 404);
  // delete
  assert.equal((await api(cookie, s.id, "DELETE", { key: "posts", id: draft.body.post.id })).status, 200);
  assert.equal((await getPage(s.slug, ["_blog", "posts", draft.body.post.slug])).status, 404);
});

test("blogs are per site: another owner can't read, edit or delete my posts, and posts never cross sites", async () => {
  const a = await signIn("blog2a@example.com");
  const b = await signIn("blog2b@example.com");
  const sa = await featureSite(a.cookie, a.workspaceId, "Alpha", { "index.html": `<h1>A</h1><div data-k-feature="blog" data-k-id="posts"></div>` });
  const sb = await featureSite(b.cookie, b.workspaceId, "Beta", { "index.html": `<h1>B</h1><div data-k-feature="blog" data-k-id="posts"></div>` });
  const pa = (await api(a.cookie, sa.id, "POST", { key: "posts", title: "Alpha only", body: "alpha text", publish: true })).body.post;
  // same key, other site
  assert.equal((await getPage(sb.slug, ["_blog", "posts", "alpha-only"])).status, 404);
  assert.doesNotMatch(await (await getPage(sb.slug)).text(), /Alpha only/);
  // B using A's site id or A's post id through B's own site
  assert.equal((await api(b.cookie, sa.id, "GET")).status, 404);
  assert.equal((await api(b.cookie, sa.id, "PATCH", { key: "posts", id: pa.id, title: "hacked" })).status, 404);
  assert.equal((await api(b.cookie, sb.id, "PATCH", { key: "posts", id: pa.id, title: "hacked" })).status, 404);
  assert.equal((await api(b.cookie, sb.id, "DELETE", { key: "posts", id: pa.id })).status, 404);
  assert.equal((await api(a.cookie, sa.id, "GET")).body.blogs[0].posts[0].title, "Alpha only");
  // no cookie at all
  assert.equal((await api("", sa.id, "POST", { key: "posts", title: "x" })).status, 401);
});

test("a blog on a members-only page is not served from the public post URL", async () => {
  const { cookie, workspaceId } = await signIn("blog3@example.com");
  const s = await featureSite(cookie, workspaceId, "Club", { "index.html": "<h1>Home</h1>", "club.html": `<h1>Club</h1><div data-k-feature="blog" data-k-id="posts"></div><div data-k-feature="members" data-k-id="area" data-k-gate="page"></div>` });
  await api(cookie, s.id, "POST", { key: "posts", title: "Members news", body: "for members", publish: true });
  assert.equal((await getPage(s.slug, ["_blog", "posts", "members-news"])).status, 404);
  assert.doesNotMatch(await (await getPage(s.slug, ["_search"], "?q=members")).text(), /Members news/);
});
