import "./setup";
import { signIn, jsonReq } from "./helpers/session";
import assert from "node:assert/strict";
import { test } from "node:test";
import { POST, GET, PATCH, DELETE } from "../src/app/api/share/route";
import { GET as ogGet } from "../src/app/(marketing)/r/[token]/og/route";
import { openShare } from "../src/lib/growth/share";
import { openPublic } from "../src/lib/growth/share-public";

const long = "Use a JSONB column for preferences that change shape, and a normal column for anything you filter on. ".repeat(6);
const answer = {
  markdown: long,
  consensus: { level: "partial", agree: 2, disagree: 1, responded: 3, consulted: 3 },
  models: [{ name: "Model A", provider: "P", slot: "panel", status: "responded", stance: "JSONB" }],
  disagreements: [{ topic: "Storage", positions: [{ stance: "JSONB", models: ["Model A"], summary: "flexible" }, { stance: "Columns", models: ["Model B"], summary: "typed" }], resolution: "JSONB for variable shapes." }],
};
const Q = "Should I store user preferences as JSONB or in columns?";
const make = async (cookie: string, over: Record<string, unknown> = {}) => {
  const res = await POST(jsonReq(cookie, "/api/share", "POST", { answer, question: Q, includeQuestion: true, consent: true, ...over }));
  assert.equal(res.status, 201);
  return ((await res.json()) as { token: string }).token;
};

test("tenant isolation: another account can't list, revoke, publish or unpublish my link, and my link keeps working", async () => {
  const a = await signIn("iso-a@example.com", "free");
  const b = await signIn("iso-b@example.com", "free");
  const token = await make(a.cookie);
  const bList = (await (await GET(jsonReq(b.cookie, "/api/share", "GET"))).json()) as { links: { token: string }[] };
  assert.equal(bList.links.some((l) => l.token === token), false);
  assert.equal((await DELETE(jsonReq(b.cookie, "/api/share", "DELETE", { token }))).status, 404);
  assert.equal((await PATCH(jsonReq(b.cookie, "/api/share", "PATCH", { token, public: true, consent: true }))).status, 404);
  assert.equal((await PATCH(jsonReq(b.cookie, "/api/share", "PATCH", { token, public: false }))).status, 404);
  assert.ok(await openShare(token), "B's attempts changed nothing");
  // A publishes; B still can't switch it off, and a non-admin can't take it down.
  const pub = (await (await PATCH(jsonReq(a.cookie, "/api/share", "PATCH", { token, public: true, consent: true }))).json()) as { url: string };
  const slug = pub.url.split("/answers/")[1];
  assert.equal((await PATCH(jsonReq(b.cookie, "/api/share", "PATCH", { token, public: false }))).status, 404);
  assert.equal((await PATCH(jsonReq(b.cookie, "/api/share", "PATCH", { slug, takedown: true }))).status, 403);
  assert.ok(await openPublic(slug));
  // The owner still can.
  assert.equal((await DELETE(jsonReq(a.cookie, "/api/share", "DELETE", { token }))).status, 200);
  assert.equal(await openShare(token), null);
});

test("what is stored is only the allow-listed snapshot: smuggled fields (memory, files, email, account id) never persist", async () => {
  const a = await signIn("iso-leak@example.com", "free");
  const token = await make(a.cookie, {
    answer: { ...answer, memory: "SECRET-MEMORY-NOTE", attachments: [{ name: "passport.pdf" }], email: "iso-leak@example.com", workspaceId: "someone-else", docs: [{ text: "SECRET-DOC" }], models: [{ name: "Model A", provider: "P", slot: "panel", status: "responded", email: "x@y.z", memory: "SECRET-MEMORY-NOTE" }] },
  });
  const row = (await openShare(token))!;
  const stored = JSON.stringify(row);
  for (const bad of ["SECRET-MEMORY-NOTE", "passport.pdf", "SECRET-DOC", "someone-else", "x@y.z"]) assert.equal(stored.includes(bad), false, bad);
  assert.equal(row.workspaceId, a.workspaceId, "the owner comes from the session, never from the body");
  assert.ok(stored.includes("JSONB"));
});

test("preview card: 200 PNG for a live private link, 404 once revoked or for an unknown token; never cached by shared caches", async () => {
  const a = await signIn("iso-og@example.com", "free");
  const token = await make(a.cookie);
  const res = await ogGet(new Request(`http://localhost/r/${token}/og`), { params: Promise.resolve({ token }) });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /image\/png/);
  assert.match(res.headers.get("cache-control") ?? "", /no-store/);
  assert.equal((await DELETE(jsonReq(a.cookie, "/api/share", "DELETE", { token }))).status, 200);
  assert.equal((await ogGet(new Request(`http://localhost/r/${token}/og`), { params: Promise.resolve({ token }) })).status, 404);
  const none = "A".repeat(24);
  assert.equal((await ogGet(new Request(`http://localhost/r/${none}/og`), { params: Promise.resolve({ token: none }) })).status, 404);
});

test("abuse report from a shared page: signed-out visitors can send it, it is stored with the page reference and the start of the page, never emailed", async () => {
  const { POST: report } = await import("../src/app/api/report/route");
  const { listReports } = await import("../src/lib/safety/store");
  const slug = `${"a-long-question-slug-".repeat(3)}abc123`.slice(0, 80);
  const res = await report(new Request("https://keplar.one/api/report", { method: "POST", headers: { "content-type": "application/json", origin: "https://keplar.one", "x-forwarded-for": "198.51.100.77" }, body: JSON.stringify({ category: "private", note: "shows my phone", answerId: `shared:p:${slug}`, excerpt: Q }) }));
  assert.equal(res.status, 200);
  const stored = (await listReports(50)).find((r) => r.answerId === `shared:p:${slug}`);
  assert.ok(stored, "stored with the shared-page reference (long public slugs fit)");
  assert.equal(stored!.accountId, null);
  assert.equal(stored!.excerpt, Q);
  assert.equal(stored!.status, "open");
});
