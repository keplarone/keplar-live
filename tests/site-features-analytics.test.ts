import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { signIn, jsonReq, call } from "./helpers/session";
import { featureSite } from "./helpers/feature-site";
import { countable, refHost, visitorMark } from "@/lib/site-builder/features/analytics";
import { pageViewCounts, pageViews } from "@/lib/business/repo";

const CHROME = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
let n = 0;
async function visit(slug: string, path: string[] | undefined, headers: Record<string, string> = {}) {
  const route = await import("@/app/s/[slug]/[[...path]]/route");
  const h = { "user-agent": CHROME, "x-forwarded-for": `192.0.2.${(++n % 250) + 1}`, ...headers };
  return route.GET(call(null, `/s/${slug}${path ? `/${path.join("/")}` : ""}`, { headers: h }), { params: Promise.resolve({ slug, path }) });
}
type Stats = { views: number; visitors: number; counting: boolean; pages: { path: string; views: number }[]; referrers: { host: string; views?: number }[]; series: { day?: string; views: number }[] };
async function stats(cookie: string, siteId: string) {
  const route = await import("@/app/api/sites/[id]/analytics/route");
  const res = await route.GET(call(cookie, `/api/sites/${siteId}/analytics?days=30`), { params: Promise.resolve({ id: siteId }) });
  return { status: res.status, body: (await res.json()) as Stats };
}

test("what is counted: people, not bots, previews, prefetches or visitors who opt out", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  assert.equal(countable(h({ "user-agent": CHROME })), true);
  assert.equal(countable(h({})), false, "no user agent");
  assert.equal(countable(h({ "user-agent": "Googlebot/2.1 (+http://www.google.com/bot.html)" })), false);
  assert.equal(countable(h({ "user-agent": "Slackbot-LinkExpanding 1.0" })), false);
  assert.equal(countable(h({ "user-agent": "curl/8.0" })), false);
  assert.equal(countable(h({ "user-agent": CHROME, dnt: "1" })), false);
  assert.equal(countable(h({ "user-agent": CHROME, "sec-gpc": "1" })), false);
  assert.equal(countable(h({ "user-agent": CHROME, "sec-purpose": "prefetch" })), false);
  assert.equal(refHost("https://www.Google.com/search?q=secret+words#x", "mill.example"), "google.com", "host only, never the path or query");
  assert.equal(refHost("https://mill.example/other", "mill.example"), "", "own site is not a referrer");
  assert.equal(refHost("not a url", "x"), "");
  const a = visitorMark("1.2.3.4", CHROME, "2026-10-04");
  assert.equal(a, visitorMark("1.2.3.4", CHROME, "2026-10-04"));
  assert.notEqual(a, visitorMark("1.2.3.4", CHROME, "2026-10-05"), "not linkable across days");
  assert.notEqual(a, visitorMark("1.2.3.5", CHROME, "2026-10-04"));
  assert.doesNotMatch(a, /1\.2\.3\.4/);
});

test("published pages are counted; the owner sees real totals, top pages and referrers", async () => {
  const { cookie, workspaceId } = await signIn("an1@example.com");
  const s = await featureSite(cookie, workspaceId, "Mill Lane", { "index.html": "<h1>Home</h1>", "menu.html": "<h1>Menu</h1>" });
  assert.equal((await visit(s.slug, undefined, { referer: "https://www.google.com/search?q=bread" })).status, 200);
  assert.equal((await visit(s.slug, undefined)).status, 200);
  assert.equal((await visit(s.slug, ["menu.html"], { referer: "https://news.example/story/1" })).status, 200);
  // not counted
  await visit(s.slug, undefined, { "user-agent": "Googlebot/2.1" });
  await visit(s.slug, undefined, { dnt: "1" });
  await visit(s.slug, ["nope"]); // 404
  await visit(s.slug, ["_search"]);
  await visit(s.slug, ["_thanks"]);
  await visit(s.slug, ["styles.css"]);
  const { status, body } = await stats(cookie, s.id);
  assert.equal(status, 200);
  assert.equal(body.views, 3);
  assert.equal(body.visitors, 3, "three different browsers/addresses today");
  assert.deepEqual(body.pages, [{ path: "/", views: 2 }, { path: "/menu", views: 1 }]);
  assert.deepEqual(body.referrers.map((r) => r.host).sort(), ["google.com", "news.example"]);
  assert.equal(body.series.length, 30);
  assert.equal(body.series.at(-1)?.views, 3);
  assert.equal(body.counting, true);
  // stored as per-day counters (no row per view), and nothing identifying is stored: no IP, browser, visitor mark or full referrer URL
  assert.equal((await pageViews().list(workspaceId, (v) => v.projectId === s.id)).length, 0, "no legacy per-view rows are written");
  const rows = await pageViewCounts().list(workspaceId, (v) => v.projectId === s.id);
  assert.deepEqual(rows.map((r) => `${r.kind}:${r.key}:${r.views}`).sort(), ["day::3", "path:/:2", "path:/menu:1", "ref:google.com:1", "ref:news.example:1"]);
  assert.doesNotMatch(JSON.stringify(rows), /192\.0\.2\.|Mozilla|search\?q|bread/);
  for (const mark of ["192.0.2.", "203.0.113."]) assert.ok(!JSON.stringify(rows).includes(mark));
});

test("the same visitor is one daily visitor; reloading in a loop can't inflate the count forever", async () => {
  const { cookie, workspaceId } = await signIn("an2@example.com");
  const s = await featureSite(cookie, workspaceId, "Loop", { "index.html": "<h1>Home</h1>" });
  for (let i = 0; i < 3; i++) await visit(s.slug, undefined, { "x-forwarded-for": "203.0.113.50" });
  const b = (await stats(cookie, s.id)).body;
  assert.equal(b.views, 3);
  assert.equal(b.visitors, 1);
  for (let i = 0; i < 210; i++) await visit(s.slug, undefined, { "x-forwarded-for": "203.0.113.51" });
  const c = (await stats(cookie, s.id)).body;
  assert.ok(c.views <= 3 + 200, `one visitor is capped (${c.views})`);
});

test("switching it off stops counting; sites never see each other's numbers; deleting the site deletes its views", async () => {
  const a = await signIn("an3a@example.com");
  const b = await signIn("an3b@example.com");
  const sa = await featureSite(a.cookie, a.workspaceId, "Alpha", { "index.html": "<h1>A</h1>" });
  const sb = await featureSite(b.cookie, b.workspaceId, "Beta", { "index.html": "<h1>B</h1>" });
  await visit(sa.slug, undefined);
  await visit(sb.slug, undefined);
  await visit(sb.slug, undefined);
  assert.equal((await stats(a.cookie, sa.id)).body.views, 1);
  assert.equal((await stats(b.cookie, sb.id)).body.views, 2);
  assert.equal((await stats(b.cookie, sa.id)).status, 404, "another owner can't read it");
  assert.equal((await stats("", sa.id)).status, 401);
  // off
  const siteRoute = await import("@/app/api/sites/[id]/route");
  const off = await siteRoute.PATCH(jsonReq(a.cookie, `/api/sites/${sa.id}`, "PATCH", { featureSettings: { analytics: false } }), { params: Promise.resolve({ id: sa.id }) });
  assert.equal(off.status, 200);
  await visit(sa.slug, undefined);
  const after = (await stats(a.cookie, sa.id)).body;
  assert.equal(after.views, 1);
  assert.equal(after.counting, false);
  // when the site's data is removed, its views go too; the other site's stay
  const { deleteSiteRecords } = await import("@/lib/site-builder/features/records");
  await pageViews().insert({ id: "pv_legacy_an3", workspaceId: a.workspaceId, projectId: sa.id, path: "/", day: new Date().toISOString().slice(0, 10), at: new Date().toISOString() }); // a legacy per-view row
  assert.equal((await pageViewCounts().list(a.workspaceId, (v) => v.projectId === sa.id)).length, 2);
  await deleteSiteRecords(a.workspaceId, sa.id);
  assert.equal((await pageViewCounts().list(a.workspaceId, (v) => v.projectId === sa.id)).length, 0);
  assert.equal((await pageViews().list(a.workspaceId, (v) => v.projectId === sa.id)).length, 0);
  assert.equal((await pageViewCounts().list(b.workspaceId, (v) => v.projectId === sb.id && v.kind === "day"))[0]?.views, 2);
});
