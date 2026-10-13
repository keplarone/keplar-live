import "./setup";
process.env.KEPLAR_APPDB_MEMORY = "1";
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSpec } from "@/lib/app-builder/spec";
import { APP_BUILD_LIMITS } from "@/lib/app-builder/models";
import { normalizeDesign } from "@/lib/app-builder/design/tokens";
import { appCtx, type AppEnv } from "@/lib/app-runtime/context";
import { handleAppApi } from "@/lib/app-runtime/router";
import { seedDraft } from "@/lib/app-runtime/data";
import { serveApp } from "@/lib/app-runtime/serve";
import type { Site, SiteVersion } from "@/lib/site-builder/types";
import type { PlanId } from "@/lib/create/platform/plans";

const spec = normalizeSpec({
  name: "Grain", kind: "social",
  pages: [{ route: "/", title: "Feed" }],
  collections: [
    { name: "posts", label: "Posts", fields: [{ name: "caption", type: "longtext", required: true }, { name: "photo", type: "image" }, { name: "stock", type: "select", options: ["Portra 400", "HP5"] }], read: "public", create: "auth", update: "owner", delete: "owner", realtime: true, seed: [{ caption: "Dusk on Portra", stock: "Portra 400", _ownerName: "Ines" }] },
    { name: "likes", label: "Likes", fields: [{ name: "post", type: "ref", ref: "posts" }], read: "public", create: "auth", update: "none", delete: "owner", unique: ["post", "_owner"] },
    { name: "notes", label: "Notes", fields: [{ name: "body", type: "longtext" }], read: "owner", create: "auth", update: "owner", delete: "owner" },
    { name: "services", label: "Services", fields: [{ name: "title", type: "text" }], read: "public", create: "admin", update: "admin", delete: "admin" },
  ],
  auth: { enabled: true, methods: ["password", "magic"] },
  features: [{ id: "f", title: "x" }],
  files: [{ path: "app.js" }],
}, APP_BUILD_LIMITS.pro, "x");

const site = (id: string): Site => ({ id, workspaceId: "ws1", name: "Grain", slug: id, kind: "app", app: { spec, design: normalizeDesign({}), admins: ["owner@x.test"], settings: { signups: true, ai: true, uploads: true } } } as unknown as Site);

async function call(s: Site, env: AppEnv, method: string, path: string, body?: unknown, token?: string, plan: PlanId = "pro") {
  const ctx = appCtx(s, env, plan)!;
  const headers: Record<string, string> = { "x-forwarded-for": "203.0.113.9" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;
  const req = new Request(`https://keplar.one/s/x/_api/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const res = await handleAppApi(req, ctx, path.split("?")[0].split("/").filter(Boolean), "https://keplar.one/s/x/");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, any> };
}

test("runtime: accounts, data access rules, unique toggles, owner-only reads, admin role, and tenant isolation", async () => {
  const A = site("sit_appA");
  const B = site("sit_appB");
  // Sign up two members and the owner (admin by email).
  const u1 = await call(A, "draft", "POST", "auth/signup", { email: "ana@x.test", password: "correct-horse", name: "Ana" });
  assert.equal(u1.status, 200, JSON.stringify(u1.body));
  const t1 = u1.body.token as string;
  assert.equal(u1.body.user.role, "member");
  const u2 = await call(A, "draft", "POST", "auth/signup", { email: "bo@x.test", password: "correct-horse", name: "Bo" });
  const t2 = u2.body.token as string;
  const own = await call(A, "draft", "POST", "auth/signup", { email: "owner@x.test", password: "correct-horse", name: "Owner" });
  assert.equal(own.body.user.role, "admin");
  assert.equal((await call(A, "draft", "POST", "auth/signup", { email: "ana@x.test", password: "correct-horse" })).status >= 400, true, "duplicate email refused");
  assert.equal((await call(A, "draft", "POST", "auth/signin", { email: "ana@x.test", password: "wrong-pass" })).status, 401);
  assert.equal((await call(A, "draft", "GET", "auth/me", undefined, t1)).body.user.email, "ana@x.test");

  // Writes need an account; validation applies.
  assert.equal((await call(A, "draft", "POST", "db/posts", { data: { caption: "x" } })).status, 401);
  assert.equal((await call(A, "draft", "POST", "db/posts", { data: { stock: "Velvia" } }, t1)).status, 400);
  const p = await call(A, "draft", "POST", "db/posts", { data: { caption: "Rainy Tram, HP5 pushed", stock: "HP5" } }, t1);
  assert.equal(p.status, 201, JSON.stringify(p.body));
  const postId = p.body.item.id as string;
  assert.equal(p.body.item._ownerName, "Ana");

  // Only the owner may edit; anyone may read.
  assert.equal((await call(A, "draft", "PATCH", `db/posts/${postId}`, { data: { caption: "hacked" } }, t2)).status, 403);
  assert.equal((await call(A, "draft", "PATCH", `db/posts/${postId}`, { data: { caption: "Rainy tram" } }, t1)).status, 200);
  assert.equal((await call(A, "draft", "GET", `db/posts/${postId}`)).body.item.caption, "Rainy tram");

  // Likes: one per user per post, toggled.
  const l1 = await call(A, "draft", "POST", "db/likes/_toggle", { match: { post: postId } }, t2);
  assert.equal(l1.body.on, true);
  await call(A, "draft", "POST", "db/likes/_toggle", { match: { post: postId } }, t1);
  const counts = await call(A, "draft", "GET", `db/likes/_counts?field=post&values=${postId}`);
  assert.equal(counts.body.counts[postId], 2);
  assert.equal((await call(A, "draft", "POST", "db/likes/_toggle", { match: { post: postId } }, t2)).body.on, false);
  assert.equal((await call(A, "draft", "GET", `db/likes/_count?where=${encodeURIComponent(JSON.stringify({ post: postId }))}`)).body.count, 1);

  // Owner-only collection: Bo never sees Ana's notes.
  await call(A, "draft", "POST", "db/notes", { data: { body: "secret" } }, t1);
  assert.equal((await call(A, "draft", "GET", "db/notes", undefined, t2)).body.items.length, 0);
  assert.equal((await call(A, "draft", "GET", "db/notes", undefined, t1)).body.items.length, 1);
  assert.equal((await call(A, "draft", "GET", "db/notes")).status, 401);

  // Admin-only writes.
  assert.equal((await call(A, "draft", "POST", "db/services", { data: { title: "Cut" } }, t1)).status, 403);
  assert.equal((await call(A, "draft", "POST", "db/services", { data: { title: "Cut" } }, own.body.token)).status, 201);

  // Tenant isolation: app B and app A's live environment see none of it; A's token means nothing in B.
  assert.equal((await call(B, "draft", "GET", "db/posts")).body.items.length, 0);
  assert.equal((await call(A, "live", "GET", "db/posts")).body.items.length, 0);
  assert.equal((await call(B, "draft", "GET", "auth/me", undefined, t1)).body.user, null);
  assert.equal((await call(A, "live", "GET", "auth/me", undefined, t1)).body.user, null);

  // Unknown collections and the Free plan.
  assert.equal((await call(A, "draft", "GET", "db/secrets")).status, 404);
  assert.equal((await call(A, "draft", "GET", "db/posts", undefined, undefined, "free")).status, 403);
  // AI proxy without a configured action.
  assert.equal((await call(A, "draft", "POST", "ai/nothing", { input: {} }, t1)).status, 404);
});

test("runtime: seeded preview content, realtime change versions, and served pages carry the sandbox CSP", async () => {
  const C = site("sit_appC");
  const ctx = appCtx(C, "draft", "pro")!;
  await seedDraft(ctx);
  const list = await call(C, "draft", "GET", "db/posts");
  assert.equal(list.body.items.length, 1);
  assert.equal(list.body.items[0]._owner, "seed_ines", "each example author is its own read-only member");
  const author = await call(C, "draft", "GET", "users/seed_ines");
  assert.equal(author.body.user.name, "Ines");
  const v1 = (await call(C, "draft", "GET", "changes?cols=posts")).body;
  const u = await call(C, "draft", "POST", "auth/signup", { email: "c@x.test", password: "correct-horse", name: "C" });
  await call(C, "draft", "POST", "db/posts", { data: { caption: "new" } }, u.body.token);
  const v2 = (await call(C, "draft", "GET", "changes?cols=posts")).body;
  assert.notDeepEqual(v1, v2, "change version moves on write");

  const version = { files: { "index.html": `<!doctype html><html><head><title>x</title></head><body><div id="app"></div><img src="keplar-image:hero"></body></html>`, "app.js": "export {}" } } as unknown as SiteVersion;
  const res = await serveApp(new Request("https://keplar.one/s/c/"), { site: C, version, env: "live", parts: [], base: "/s/c", origin: "https://keplar.one", plan: "pro", reportHref: "/report" });
  const html = await res.text();
  const csp = res.headers.get("content-security-policy") ?? "";
  assert.match(csp, /script-src 'self'/);
  assert.match(csp, /connect-src 'self'/);
  assert.match(csp, /sandbox allow-scripts/);
  assert.doesNotMatch(csp, /allow-same-origin/);
  assert.match(html, /<meta name="k-app"/);
  assert.match(html, /\/fx\/kapp\.\d+\.js/);
  assert.match(html, /kapp\.css/);
  assert.match(html, /data:image\/svg\+xml/, "missing image slot gets a placeholder");
  assert.match(html, /<base href="\/s\/c\/">/, "relative files resolve inside the app even without the trailing slash (Next.js strips it)");
  const css = await serveApp(new Request("https://keplar.one/s/c/kapp.css"), { site: C, version, env: "live", parts: ["kapp.css"], base: "/s/c", origin: "https://keplar.one", plan: "pro", reportHref: null });
  assert.match(await css.text(), /--accent:/);
  const free = await serveApp(new Request("https://keplar.one/s/c/"), { site: C, version, env: "live", parts: [], base: "/s/c", origin: "https://keplar.one", plan: "free", reportHref: null });
  assert.match(await free.text(), /id="k-wm"/, "Free apps carry the Keplar badge");
});

test("app uploads: sniff accepts PNG/text and refuses HTML, SVG and XML disguised as text", async () => {
  const { sniff } = await import("@/lib/app-runtime/files");
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  assert.equal(sniff(png), "image/png");
  assert.equal(sniff(Buffer.from("hello notes", "utf8")), "text/plain");
  assert.equal(sniff(Buffer.from("a,b\n1,2\n", "utf8"), "data.csv"), "text/csv");
  assert.equal(sniff(Buffer.from("<!DOCTYPE html><html><script>x</script></html>", "utf8"), "page.html"), null);
  assert.equal(sniff(Buffer.from("<html><body>x</body></html>", "utf8"), "note.txt"), null);
  assert.equal(sniff(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>', "utf8"), "icon.svg"), null);
  assert.equal(sniff(Buffer.from('<?xml version="1.0"?><x/>', "utf8"), "x.xml"), null);
});
