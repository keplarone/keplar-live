import "./setup";
import { signIn, jsonReq } from "./helpers/session";
import assert from "node:assert/strict";
import { test } from "node:test";
import { GET, POST, DELETE } from "../src/app/api/share/route";
import { createShare, liveSharesOf, openShare, revokeShare, sanitizeSnapshot, SHARE_LIMITS, shareStats, validToken } from "../src/lib/growth/share";

const answer = {
  markdown: "Use JSONB for the preferences that change shape.\n\n<script>alert(1)</script>",
  consensus: { level: "partial", agree: 2, disagree: 1, responded: 3, consulted: 3, score: 0.87 },
  models: [{ name: "Model A", provider: "Prov", slot: "panel", status: "responded", stance: "JSONB" }, { name: "Model B", provider: "Prov", slot: "evil", status: "responded" }],
  disagreements: [{ topic: "Indexing", positions: [{ stance: "Index it", models: ["Model A"], summary: "s" }], resolution: "Measure first." }],
};

test("snapshot: question only when the owner includes it; no percentage is stored; unknown slot falls back; short answers refused", () => {
  const a = sanitizeSnapshot({ ...answer, question: "my private question" }, false);
  assert.ok(typeof a !== "string");
  assert.equal(a.question, undefined);
  assert.equal(JSON.stringify(a).includes("private"), false);
  assert.equal("score" in a.consensus, false);
  assert.equal(a.models[1].slot, "panel");
  const b = sanitizeSnapshot({ ...answer, question: "my private question" }, true);
  assert.ok(typeof b !== "string" && b.question === "my private question");
  assert.equal(typeof sanitizeSnapshot({ markdown: "hi" }, false), "string");
  assert.equal(typeof sanitizeSnapshot(null, false), "string");
});

test("route: signed-out is 401, consent is required, create -> open -> revoke -> gone", async () => {
  assert.equal((await POST(jsonReq(null, "/api/share", "POST", { answer, consent: true }))).status, 401);
  assert.equal((await GET(jsonReq(null, "/api/share", "GET"))).status, 401);
  const u = await signIn("share-owner@example.com", "free");
  assert.equal((await POST(jsonReq(u.cookie, "/api/share", "POST", { answer }))).status, 400);
  const res = await POST(jsonReq(u.cookie, "/api/share", "POST", { answer, question: "private q", includeQuestion: false, consent: true }));
  assert.equal(res.status, 201);
  const { token, url } = (await res.json()) as { token: string; url: string };
  assert.ok(validToken(token));
  assert.ok(url.endsWith(`/r/${token}`));
  const open = await openShare(token, { count: true });
  assert.ok(open);
  assert.equal(open.question, undefined);
  assert.equal(open.views, 0);
  assert.equal((await openShare(token, { count: true }))?.views, 1);
  assert.ok((await shareStats(30)).views >= 1);
  const list = (await (await GET(jsonReq(u.cookie, "/api/share", "GET"))).json()) as { links: { token: string }[] };
  assert.equal(list.links.length, 1);
  // another account can't revoke it
  const other = await signIn("share-other@example.com", "free");
  assert.equal((await DELETE(jsonReq(other.cookie, "/api/share", "DELETE", { token }))).status, 404);
  assert.ok(await openShare(token));
  assert.equal((await DELETE(jsonReq(u.cookie, "/api/share", "DELETE", { token }))).status, 200);
  assert.equal(await openShare(token), null);
  assert.equal((await DELETE(jsonReq(u.cookie, "/api/share", "DELETE", { token }))).status, 404);
});

test("expiry, live-link cap and hourly cap", async () => {
  const snap = sanitizeSnapshot(answer, false) as Exclude<ReturnType<typeof sanitizeSnapshot>, string>;
  const ws = "ws_share_caps";
  const long = Date.now() - 100 * 864e5;
  const old = await createShare(ws, snap, long);
  assert.equal(await openShare(old.token), null); // expired after 90 days
  assert.equal((await liveSharesOf(ws)).length, 0);
  for (let i = 0; i < SHARE_LIMITS.live; i++) await createShare(ws, snap, Date.now() - (SHARE_LIMITS.live + 2 - i) * 3_700_000); // spaced more than an hour apart
  await assert.rejects(createShare(ws, snap, Date.now()), /live links/);
  for (const r of await liveSharesOf(ws)) await revokeShare(ws, r.token);
  const ws2 = "ws_share_hour";
  for (let i = 0; i < SHARE_LIMITS.perHour; i++) await createShare(ws2, snap);
  await assert.rejects(createShare(ws2, snap), /last hour/);
  assert.equal(validToken("short"), false);
});
