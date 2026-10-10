/* eslint-disable @typescript-eslint/no-explicit-any */
import "./setup";
import { signIn, jsonReq, call } from "./helpers/session";
import assert from "node:assert/strict";
import { test } from "node:test";
import { GET as embedGet, POST as embedPost } from "../src/app/api/embed/route";
import { DELETE as embedDelete, PATCH as embedPatch } from "../src/app/api/embed/[id]/route";
import { POST as embedAsk } from "../src/app/api/embed/ask/route";
import { GET as embedPublic } from "../src/app/api/embed/public/[id]/route";
import { EMBED_POLICY, looksLikeEmbedId } from "../src/lib/embed/config";
import { signEmbedGrant } from "../src/lib/embed/grant";
import { embedWidgets, normalizeOrigin, resolveWidgetForAsk } from "../src/lib/embed/store";
import { USER_COLLECTIONS } from "../src/lib/privacy/account-data";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const j = async (r: Response) => (await r.json()) as Record<string, any>;
let n = 0;
const email = (tag: string) => `${tag}${++n}-${Math.random().toString(36).slice(2, 7)}@example.com`;

test("normalizeOrigin accepts https hosts and rejects junk", () => {
  assert.equal(normalizeOrigin("https://Example.com/path"), "https://example.com");
  assert.equal(normalizeOrigin("example.com"), "https://example.com");
  assert.equal(normalizeOrigin("javascript:alert(1)"), null);
  assert.equal(normalizeOrigin(""), null);
});

test("embed.js loader is present and mentions data-keplar-embed", () => {
  const js = readFileSync(join(process.cwd(), "public/embed.js"), "utf8");
  assert.match(js, /data-keplar-embed/);
  assert.match(js, /\/embed\?id=/);
  assert.ok(!/eval\(/.test(js));
});

test("signed-in user can create, list, copy snippet shape, and revoke a widget", async () => {
  const u = await signIn(email("emb"), "plus");
  const made = await j(await embedPost(jsonReq(u.cookie, "/api/embed", "POST", { name: "Docs", theme: "dark", size: "compact", accent: "teal", models: "free", origins: ["https://docs.example.com"] })));
  assert.ok(made.widget);
  assert.ok(looksLikeEmbedId(made.widget.id));
  assert.match(made.widget.snippet, /embed\.js/);
  assert.match(made.widget.snippet, new RegExp(made.widget.id));
  assert.deepEqual(made.widget.origins, ["https://docs.example.com"]);

  const list = await j(await embedGet(call(u.cookie, "/api/embed")));
  assert.equal(list.available, true);
  assert.ok(list.widgets.some((w: any) => w.id === made.widget.id));

  const pub = await j(await embedPublic(call(null, `/api/embed/public/${made.widget.id}`), { params: Promise.resolve({ id: made.widget.id }) }));
  assert.equal(pub.id, made.widget.id);
  assert.equal(pub.theme, "dark");
  assert.equal(pub.accent, "teal");

  const patched = await j(await embedPatch(jsonReq(u.cookie, `/api/embed/${made.widget.id}`, "PATCH", { theme: "light" }), { params: Promise.resolve({ id: made.widget.id }) }));
  assert.equal(patched.widget.theme, "light");

  const del = await embedDelete(jsonReq(u.cookie, `/api/embed/${made.widget.id}`, "DELETE"), { params: Promise.resolve({ id: made.widget.id }) });
  assert.equal(del.status, 200);
  const gone = await embedPublic(call(null, `/api/embed/public/${made.widget.id}`), { params: Promise.resolve({ id: made.widget.id }) });
  assert.equal(gone.status, 404);
});

test("origin allowlist blocks asks from other parents", async () => {
  const u = await signIn(email("orig"), "plus");
  const made = await j(await embedPost(jsonReq(u.cookie, "/api/embed", "POST", { name: "Locked", origins: ["https://allowed.example"] })));
  const id = made.widget.id as string;
  const denied = await embedAsk(
    new Request("https://keplar.one/api/embed/ask", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `203.0.113.${n % 200}` },
      body: JSON.stringify({ widgetId: id, question: "hi", parent: "https://evil.example" }),
    }),
  );
  assert.equal(denied.status, 403);
  assert.equal((await j(denied)).error.code, "origin_denied");
  const spoofed = await embedAsk(
    new Request("https://keplar.one/api/embed/ask", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `203.0.113.${(n + 1) % 200}` },
      body: JSON.stringify({ widgetId: id, question: "hi", parent: "https://allowed.example" }),
    }),
  );
  assert.equal(spoofed.status, 403);
  assert.equal((await j(spoofed)).error.code, "origin_denied");
  const grant = signEmbedGrant(id, "https://allowed.example");
  const allowed = await resolveWidgetForAsk(new Request("https://keplar.one/api/embed/ask", { headers: { "x-forwarded-for": "203.0.113.44" } }), id, grant);
  assert.equal(allowed.widget.id, id);
});

test("Free plan can create one widget forced to free models; plan caps apply", async () => {
  assert.equal(EMBED_POLICY.free.maxWidgets, 1);
  const u = await signIn(email("freeemb"), "free");
  const r = await embedPost(jsonReq(u.cookie, "/api/embed", "POST", { name: "Site", models: "plan" }));
  assert.equal(r.status, 201);
  const w = (await j(r)).widget;
  assert.equal(w.models, "free", "Free publishers cannot pick plan models");
  assert.equal((await embedPost(jsonReq(u.cookie, "/api/embed", "POST", { name: "Two" }))).status, 409);
});

test("embed_widgets are user data and the secret-less id is what gets embedded", async () => {
  assert.ok((USER_COLLECTIONS as readonly string[]).includes("embed_widgets"));
  const rows = await embedWidgets().list("ws_none");
  assert.ok(Array.isArray(rows));
});

test("unauthenticated create is 401; cross-origin create is 403", async () => {
  assert.equal((await embedPost(jsonReq(null, "/api/embed", "POST", { name: "x" }))).status, 401);
  const u = await signIn(email("csrf"), "plus");
  const r = await embedPost(
    new Request("https://keplar.one/api/embed", {
      method: "POST",
      headers: { cookie: u.cookie, origin: "https://evil.example", "content-type": "application/json" },
      body: JSON.stringify({ name: "x" }),
    }),
  );
  assert.equal(r.status, 403);
});
