/**
 * Backend upgrades for generated apps: `expand` fills reference fields on the server (respecting the target collection's
 * read rules), incoming webhooks add records with a per-collection secret key, and scheduled jobs are planned only when
 * they can run, and are due daily or weekly.
 */
import "./setup";
process.env.KEPLAR_APPDB_MEMORY = "1";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeSpec } from "@/lib/app-builder/spec";
import { APP_BUILD_LIMITS } from "@/lib/app-builder/models";
import { normalizeDesign } from "@/lib/app-builder/design/tokens";
import { appCtx, type AppEnv } from "@/lib/app-runtime/context";
import { handleAppApi } from "@/lib/app-runtime/router";
import { hookKey } from "@/lib/app-runtime/hooks";
import { isDue } from "@/lib/app-runtime/schedules";
import type { Site } from "@/lib/site-builder/types";

const spec = normalizeSpec({
  name: "Teams", kind: "app",
  pages: [{ route: "/", title: "Home" }],
  collections: [
    { name: "teams", label: "Teams", fields: [{ name: "name", type: "text", required: true }], read: "public", create: "auth", update: "owner", delete: "owner" },
    { name: "secrets", label: "Secrets", fields: [{ name: "note", type: "text" }], read: "owner", create: "auth", update: "owner", delete: "owner" },
    { name: "posts", label: "Posts", fields: [{ name: "title", type: "text", required: true }, { name: "team", type: "ref", ref: "teams" }, { name: "secret", type: "ref", ref: "secrets" }, { name: "author", type: "ref", ref: "users" }], read: "public", create: "auth", update: "owner", delete: "owner" },
    { name: "digests", label: "Digests", fields: [{ name: "body", type: "longtext" }], read: "public", create: "admin", update: "admin", delete: "admin" },
  ],
  auth: { enabled: true, methods: ["password"] },
  ai: [{ name: "writeDigest", label: "Digest", purpose: "x", system: "Write a digest.", input: [{ name: "topic", max: 200 }], output: "text", maxTokens: 400, tier: "fast", auth: false }],
  schedules: [
    { name: "daily", label: "Daily digest", every: "day", ai: "writeDigest", input: { topic: "news" }, save: { collection: "digests", field: "body" } },
    { name: "broken", label: "No such action", every: "day", ai: "nope", input: {}, save: { collection: "digests", field: "body" } },
    { name: "badField", label: "Saves into a ref", every: "week", ai: "writeDigest", input: {}, save: { collection: "posts", field: "team" } },
  ],
  features: [{ id: "f", title: "x" }],
  files: [{ path: "app.js" }],
}, APP_BUILD_LIMITS.pro, "x");

const site: Site = { id: "sit_backend", workspaceId: "ws_backend", name: "Teams", slug: "teams-backend", kind: "app", app: { spec, design: normalizeDesign({}), admins: [], settings: { signups: true, ai: true, uploads: true } }, template: null, headVersion: 1, versionCount: 1, seo: { title: "", description: "", ogImage: "", indexable: false, pages: {} }, publishedVersion: 1, publishedAt: null, needsReview: false, takenDown: false, leadCount: 0, messages: [], createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z" };

async function call(env: AppEnv, method: string, path: string, body?: unknown, token?: string) {
  const ctx = appCtx(site, env, "pro")!;
  const headers: Record<string, string> = { "x-forwarded-for": "203.0.113.7" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;
  const req = new Request(`https://keplar.one/s/x/_api/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const res = await handleAppApi(req, ctx, path.split("?")[0].split("/").filter(Boolean), "https://keplar.one/s/x/");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, any> };
}

test("expand: references come back filled in, unreadable ones as null, and only ref fields can be expanded", async () => {
  const ana = await call("draft", "POST", "auth/signup", { email: "ana@t.test", password: "correct-horse", name: "Ana" });
  const bo = await call("draft", "POST", "auth/signup", { email: "bo@t.test", password: "correct-horse", name: "Bo" });
  const team = await call("draft", "POST", "db/teams", { data: { name: "Ops" } }, ana.body.token);
  const secret = await call("draft", "POST", "db/secrets", { data: { note: "Ana's only" } }, ana.body.token);
  const post = await call("draft", "POST", "db/posts", { data: { title: "Hello", team: team.body.item.id, secret: secret.body.item.id, author: ana.body.user.id } }, ana.body.token);
  assert.equal(post.status, 201, JSON.stringify(post.body));

  const asBo = await call("draft", "GET", "db/posts?expand=team,secret,author", undefined, bo.body.token);
  assert.equal(asBo.status, 200, JSON.stringify(asBo.body));
  const it = asBo.body.items[0];
  assert.equal(it.team, team.body.item.id, "the stored id is untouched");
  assert.equal(it._expand.team.name, "Ops");
  assert.equal(it._expand.secret, null, "Bo may not read Ana's secrets, so it does not leak through expand");
  assert.equal(it._expand.author.name, "Ana");

  const asAna = await call("draft", "GET", `db/posts/${post.body.item.id}?expand=secret`, undefined, ana.body.token);
  assert.equal(asAna.body.item._expand.secret.note, "Ana's only");
  assert.equal((await call("draft", "GET", "db/posts?expand=title", undefined, ana.body.token)).status, 400, "not a ref field");
  assert.equal((await call("draft", "GET", "db/posts?expand=a,b,c,d", undefined, ana.body.token)).status, 400, "at most 3");
});

test("webhooks: the right key adds a record (declared fields are validated); a wrong key, another collection's key or GET is refused", async () => {
  const key = hookKey(site.id, "live", "teams");
  const ok = await call("live", "POST", `hooks/teams?key=${key}`, { data: { name: "From Zapier", unknown: "dropped" } });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  const list = await call("live", "GET", "db/teams");
  const rec = list.body.items.find((x: { name?: string }) => x.name === "From Zapier");
  assert.ok(rec, "record created");
  assert.equal(rec.unknown, "dropped", "extra keys are kept like on any record");
  assert.equal((await call("live", "POST", `hooks/teams?key=${key}`, { data: { unknown: "no name" } })).status, 400, "a required field is still required");
  assert.equal(rec._owner, "hook");
  assert.equal((await call("live", "POST", "hooks/teams?key=nope", { name: "x" })).status, 403);
  assert.equal((await call("live", "POST", `hooks/posts?key=${key}`, { title: "x" })).status, 403, "a key opens one collection only");
  assert.equal((await call("draft", "POST", `hooks/teams?key=${key}`, { name: "x" })).status, 403, "and one environment only");
  assert.equal((await call("live", "GET", `hooks/teams?key=${key}`)).status, 405);
});

test("schedules: only jobs that can run are kept; daily and weekly due times", () => {
  assert.deepEqual((spec.schedules ?? []).map((j) => j.name), ["daily"], "unknown AI action and a non-text target are dropped");
  const daily = spec.schedules![0];
  const t = Date.parse("2026-10-14T12:00:00Z");
  assert.equal(isDue(daily, null, t), true);
  assert.equal(isDue(daily, "2026-10-14T01:00:00Z", t), false);
  assert.equal(isDue(daily, "2026-10-13T12:00:00Z", t), true);
  assert.equal(isDue({ ...daily, every: "week" }, "2026-10-10T12:00:00Z", t), false);
  assert.equal(isDue({ ...daily, every: "week" }, "2026-10-07T00:00:00Z", t), true);
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string; schedule: string }[] };
  const cron = vercel.crons.find((c) => c.path === "/api/cron/app-schedules");
  assert.ok(cron && /^\d+ \d+ \* \* \*$/.test(cron.schedule), "runs once a day (safe on every Vercel plan)");
});
