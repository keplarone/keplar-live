import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { signIn } from "./helpers/session";
import { featureSite, getPage, hidden, postFeature } from "./helpers/feature-site";
import { hashPassword, issueSession, readSession, verifyPassword } from "@/lib/site-builder/features/members";
import { records } from "@/lib/site-builder/features/records";
import { issueToken } from "@/lib/site-builder/features/spam";
import { call } from "./helpers/session";

const GATE = '<div data-k-feature="members" data-k-id="area" data-k-gate="page" data-k-title="Members only"></div>';
const SECRET = "<h1>Secret recipes</h1><p>Grandma's rye: 500g flour.</p>";
const tok = (siteId: string) => issueToken(siteId, Date.now() - 5000);

async function setup(email: string) {
  const { cookie, workspaceId } = await signIn(email);
  const s = await featureSite(cookie, workspaceId, "Mill Lane", { "index.html": "<h1>Welcome</h1>", "members.html": `${SECRET}${GATE}` });
  return { cookie, workspaceId, ...s };
}
async function page(slug: string, file: string, cookie?: string) {
  const route = await import("@/app/s/[slug]/[[...path]]/route");
  const res = await route.GET(call(null, `/s/${slug}/${file}`, cookie ? { headers: { cookie } } : undefined), { params: Promise.resolve({ slug, path: [file] }) });
  return { status: res.status, html: await res.text(), headers: res.headers };
}
const cookieOf = (res: Response) => (res.headers.get("set-cookie") ?? "").split(";")[0];

test("passwords are hashed with a salt; sessions are signed, site-bound and expire", () => {
  const h = hashPassword("correct horse");
  assert.notEqual(h, hashPassword("correct horse"));
  assert.equal(verifyPassword("correct horse", h), true);
  assert.equal(verifyPassword("wrong", h), false);
  assert.equal(h.includes("correct"), false);
  const c = issueSession({ id: "sit_a" }, "rec_1");
  assert.equal(readSession({ id: "sit_a" }, `x=1; kmem_sit_a=${c}`), "rec_1");
  assert.equal(readSession({ id: "sit_b" }, `kmem_sit_b=${c}`), null, "a cookie from another site is worthless");
  assert.equal(readSession({ id: "sit_a" }, `kmem_sit_a=${c.slice(0, -2)}xx`), null);
  assert.equal(readSession({ id: "sit_a" }, `kmem_sit_a=${c}`, Date.now() + 15 * 86400_000), null, "expired");
});

test("a members-only page never sends its content to a signed-out visitor; signing up unlocks it; sign out locks it", async () => {
  const t = await setup("mem1@example.com");
  const out = await page(t.slug, "members");
  assert.equal(out.status, 200);
  assert.doesNotMatch(out.html, /Secret recipes|Grandma/);
  assert.match(out.html, /<title>Mill Lane<\/title>/, "the page shell stays");
  assert.match(out.html, /Members only/);
  assert.match(out.html, /name="_a" value="signup"/);
  assert.match(out.headers.get("cache-control") ?? "", /no-store/);
  const base = { _id: "area", _page: "members.html", _t: tok(t.id) };
  // weak password, bad email, honeypot
  assert.equal((await postFeature(t.slug, "members", { ...base, _a: "signup", email: "a@b.co", password: "short" })).status, 400);
  assert.equal((await postFeature(t.slug, "members", { ...base, _a: "signup", email: "nope", password: "longenough1" })).status, 400);
  assert.equal((await postFeature(t.slug, "members", { ...base, _hp: "x", _a: "signup", email: "bot@b.co", password: "longenough1" })).status, 303);
  assert.equal((await records().list(t.workspaceId, (r) => r.feature === "members")).length, 0, "bots create nothing");
  const up = await postFeature(t.slug, "members", { ...base, _a: "signup", email: "Ann@Example.com", password: "correct horse" });
  assert.equal(up.status, 303);
  assert.equal(up.headers.get("location"), `/s/${t.slug}/members`);
  const cookie = cookieOf(up);
  assert.match(up.headers.get("set-cookie") ?? "", /HttpOnly; SameSite=Lax/);
  assert.match(up.headers.get("set-cookie") ?? "", new RegExp(`Path=/s/${t.slug};`));
  const stored = (await records().list(t.workspaceId, (r) => r.feature === "members"))[0];
  assert.equal(stored.data.email, "ann@example.com");
  assert.doesNotMatch(JSON.stringify(stored), /correct horse/);
  const inside = await page(t.slug, "members", cookie);
  assert.match(inside.html, /Secret recipes/);
  assert.match(inside.html, /Signed in as <strong>ann@example\.com<\/strong>/);
  // the same email can't be registered twice
  assert.equal((await postFeature(t.slug, "members", { ...base, _a: "signup", email: "ann@example.com", password: "another pass" })).status, 409);
  // sign out clears the cookie
  const bye = await postFeature(t.slug, "members", { _id: "area", _page: "members.html", _a: "logout" });
  assert.match(bye.headers.get("set-cookie") ?? "", /Max-Age=0/);
  assert.doesNotMatch((await page(t.slug, "members", cookieOf(bye))).html, /Secret recipes/);
});

test("login: right password works, wrong password and unknown email look the same, repeated tries are limited", async () => {
  const t = await setup("mem2@example.com");
  const base = { _id: "area", _page: "members.html", _t: tok(t.id) };
  await postFeature(t.slug, "members", { ...base, _a: "signup", email: "bo@example.com", password: "correct horse" });
  const ok = await postFeature(t.slug, "members", { ...base, _a: "login", email: "bo@example.com", password: "correct horse" });
  assert.equal(ok.status, 303);
  assert.match(await (await page(t.slug, "members", cookieOf(ok))).html, /Secret recipes/);
  const bad = await postFeature(t.slug, "members", { ...base, _a: "login", email: "bo@example.com", password: "wrong wrong" });
  const none = await postFeature(t.slug, "members", { ...base, _a: "login", email: "ghost@example.com", password: "wrong wrong" });
  assert.equal(bad.status, 401);
  assert.equal(none.status, 401);
  assert.equal(await bad.text(), await none.text());
  const codes: number[] = [];
  for (let i = 0; i < 10; i++) codes.push((await postFeature(t.slug, "members", { ...base, _a: "login", email: "bo@example.com", password: `guess number ${i}` })).status);
  assert.ok(codes.includes(429), codes.join(","));
});

test("accounts are per site; the owner can remove a member and their session dies; a session never opens another site's page", async () => {
  const a = await setup("mem3a@example.com");
  const b = await setup("mem3b@example.com");
  const up = await postFeature(a.slug, "members", { _id: "area", _page: "members.html", _t: tok(a.id), _a: "signup", email: "cy@example.com", password: "correct horse" });
  const cookie = cookieOf(up);
  assert.match((await page(a.slug, "members", cookie)).html, /Secret recipes/);
  // the cookie is for site A only
  assert.doesNotMatch((await page(b.slug, "members", cookie)).html, /Secret recipes/);
  // the same credentials don't log in on site B
  assert.equal((await postFeature(b.slug, "members", { _id: "area", _page: "members.html", _t: tok(b.id), _a: "login", email: "cy@example.com", password: "correct horse" })).status, 401);
  // owner list + remove
  const route = await import("@/app/api/sites/[id]/features/route");
  const { jsonReq } = await import("./helpers/session");
  const ctx = { params: Promise.resolve({ id: a.id }) };
  const view = (await (await route.GET(call(a.cookie, `/api/sites/${a.id}/features`), ctx)).json()) as { members: { id: string; email: string }[] };
  assert.deepEqual(view.members.map((m) => m.email), ["cy@example.com"]);
  assert.doesNotMatch(JSON.stringify(view), /s1\$/, "no password hash ever leaves the server");
  // another owner can't remove it
  const other = await route.DELETE(jsonReq(b.cookie, `/api/sites/${b.id}/features`, "DELETE", { id: view.members[0].id }), { params: Promise.resolve({ id: b.id }) });
  assert.equal(other.status, 404);
  const del = await route.DELETE(jsonReq(a.cookie, `/api/sites/${a.id}/features`, "DELETE", { id: view.members[0].id }), ctx);
  assert.equal(del.status, 200);
  assert.doesNotMatch((await page(a.slug, "members", cookie)).html, /Secret recipes/, "removed member is signed out at once");
});

test("a sign-in box on a public page does not lock it; in the builder preview a members-only page stays visible, with a note", async () => {
  const { cookie, workspaceId } = await signIn("mem4@example.com");
  const s = await featureSite(cookie, workspaceId, "Open Co", { "index.html": `<h1>Welcome</h1><div data-k-feature="members" data-k-id="box"></div>` });
  const html = await (await getPage(s.slug)).text();
  assert.match(html, /Welcome/);
  assert.match(html, /Create an account/);
  assert.equal(hidden(html, "_id"), "box");
  const { expandFeatures } = await import("@/lib/site-builder/features/expand");
  const { sites } = await import("@/lib/site-builder/store");
  const site = (await sites().get(workspaceId, s.id))!;
  const prev = await expandFeatures(`<main>${SECRET}${GATE}</main>`, { site, base: "/s/x", preview: true, file: "index.html" });
  assert.match(prev, /Secret recipes/);
  assert.match(prev, /Preview: signing up and logging in work once the site is published/);
});
