import "./setup";
import { signIn, jsonReq } from "./helpers/session";
import assert from "node:assert/strict";
import { test } from "node:test";
import { POST, GET, PATCH, DELETE } from "../src/app/api/share/route";
import { GET as sitemapGet } from "../src/app/answers-sitemap.xml/route";
import { createShare, openShare, sanitizeSnapshot } from "../src/lib/growth/share";
import { findPersonalData, listPublic, openPublic, publicSummary, publicTitle, PUBLIC_LIMITS, publishShare, slugify, takeDownPublic, validPublicSlug } from "../src/lib/growth/share-public";

const long = "Use a JSONB column for preferences that change shape, and a normal column for anything you filter on. ".repeat(6);
const answer = {
  markdown: long,
  consensus: { level: "consensus", agree: 3, disagree: 0, responded: 3, consulted: 3 },
  models: [{ name: "Model A", provider: "P", slot: "panel", status: "responded", stance: "JSONB" }],
  disagreements: [],
};
const Q = "Should I store user preferences as JSONB or in columns?";

async function mk(cookie: string, over: Record<string, unknown> = {}) {
  const res = await POST(jsonReq(cookie, "/api/share", "POST", { answer, question: Q, includeQuestion: true, consent: true, ...over }));
  assert.equal(res.status, 201);
  return ((await res.json()) as { token: string }).token;
}

test("personal data detector: finds contact details, cards, keys; leaves ordinary text alone", () => {
  assert.deepEqual(findPersonalData("Use JSONB for preferences. Version 3.2.1 shipped in 2026."), []);
  assert.ok(findPersonalData("write to jane.doe@example.com").includes("an email address"));
  assert.ok(findPersonalData("call 415-555-0134 tomorrow").includes("a phone number"));
  assert.ok(findPersonalData("card 4242 4242 4242 4242").includes("a payment card number"));
  assert.equal(findPersonalData("order 1234 5678 9012 3456").includes("a payment card number"), false); // fails Luhn
  assert.ok(findPersonalData("key sk-abcdefghijklmnopqrstuvwx").includes("a key or secret"));
  assert.ok(findPersonalData("server at 192.168.10.4").includes("an IP address"));
  assert.ok(findPersonalData("I live at 221 Baker Street").includes("a street address"));
  assert.ok(findPersonalData("ssn 123-45-6789").includes("a Social Security-style number"));
});

test("slug, title and summary helpers", () => {
  assert.equal(slugify("Should I use JSONB — or columns?"), "should-i-use-jsonb-or-columns");
  assert.equal(slugify("Should I store user preferences as JSONB or in normal columns?"), "should-i-store-user-preferences-as-jsonb-or-in-normal");
  assert.equal(validPublicSlug("should-i-use-jsonb-abc123"), true);
  assert.equal(validPublicSlug("../etc/passwd"), false);
  assert.ok(publicTitle("x".repeat(200)).length <= 70);
  assert.ok(publicSummary("## Heading\n\n" + "word ".repeat(100)).length <= 160);
});

test("private by default; public needs verified email + consent; page opens, lists, sitemaps; private again and revoke give 404", async () => {
  const u = await signIn("pub-owner@example.com", "free");
  const token = await mk(u.cookie);
  // private by default
  assert.equal((await listPublic()).filter((r) => r.token === token).length, 0);
  const noConsent = await PATCH(jsonReq(u.cookie, "/api/share", "PATCH", { token, public: true }));
  assert.equal(noConsent.status, 400);
  const res = await PATCH(jsonReq(u.cookie, "/api/share", "PATCH", { token, public: true, consent: true }));
  assert.equal(res.status, 200);
  const { url } = (await res.json()) as { url: string };
  const slug = url.split("/answers/")[1];
  assert.ok(validPublicSlug(slug));
  const pub = await openPublic(slug);
  assert.ok(pub);
  assert.equal(pub.question, Q);
  assert.equal(JSON.stringify(pub).includes("pub-owner"), false);
  assert.ok((await listPublic()).some((r) => r.publicSlug === slug));
  const xml = await (await sitemapGet()).text();
  assert.ok(xml.includes(`/answers/${slug}`) && xml.includes("<lastmod>"));
  const listed = (await (await GET(jsonReq(u.cookie, "/api/share", "GET"))).json()) as { links: { token: string; public: boolean; publicUrl: string }[] };
  assert.equal(listed.links.find((l) => l.token === token)?.public, true);
  // make private: 404 at once, same URL comes back on re-publish
  assert.equal((await PATCH(jsonReq(u.cookie, "/api/share", "PATCH", { token, public: false }))).status, 200);
  assert.equal(await openPublic(slug), null);
  assert.equal((await sitemapGet().then((r) => r.text())).includes(slug), false);
  const again = (await (await PATCH(jsonReq(u.cookie, "/api/share", "PATCH", { token, public: true, consent: true }))).json()) as { url: string };
  assert.equal(again.url, url);
  // revoking the private link also removes the public page
  assert.equal((await DELETE(jsonReq(u.cookie, "/api/share", "DELETE", { token }))).status, 200);
  assert.equal(await openPublic(slug), null);
  assert.equal(await openShare(token), null);
});

test("refusals: no question, too short, personal data, other account, signed out", async () => {
  const u = await signIn("pub-refuse@example.com", "free");
  const noQ = await mk(u.cookie, { includeQuestion: false });
  const r1 = await PATCH(jsonReq(u.cookie, "/api/share", "PATCH", { token: noQ, public: true, consent: true }));
  assert.equal(r1.status, 422);
  assert.equal(((await r1.json()) as { code: string }).code, "needs_question");
  const short = await mk(u.cookie, { answer: { ...answer, markdown: "Short but valid answer text." } });
  assert.equal(((await (await PATCH(jsonReq(u.cookie, "/api/share", "PATCH", { token: short, public: true, consent: true }))).json()) as { code: string }).code, "too_short");
  const pii = await mk(u.cookie, { question: "Can you email me at jane@example.com about indexes?" });
  const r3 = await PATCH(jsonReq(u.cookie, "/api/share", "PATCH", { token: pii, public: true, consent: true }));
  assert.equal(r3.status, 422);
  assert.equal(((await r3.json()) as { code: string }).code, "personal_data");
  const ok = await mk(u.cookie);
  const other = await signIn("pub-other@example.com", "free");
  assert.equal((await PATCH(jsonReq(other.cookie, "/api/share", "PATCH", { token: ok, public: true, consent: true }))).status, 404);
  assert.equal((await PATCH(jsonReq(null, "/api/share", "PATCH", { token: ok, public: true, consent: true }))).status, 401);
});

test("per-account cap of public pages; admin takedown is final and admin-only", async () => {
  const u = await signIn("pub-cap@example.com", "free");
  const snap = sanitizeSnapshot({ ...answer, question: Q }, true) as Exclude<ReturnType<typeof sanitizeSnapshot>, string>;
  const rows: Awaited<ReturnType<typeof createShare>>[] = [];
  const N = PUBLIC_LIMITS.maxPerAccount + 1;
  for (let i = N - 1; i >= 0; i--) rows[i] = await createShare(u.workspaceId, { ...snap, question: `${Q} Variant ${i}` }, Date.now() - (i + 2) * 3_700_000); // oldest first: the hourly cap looks back from each link's own time
  for (let i = 0; i < PUBLIC_LIMITS.maxPerAccount; i++) assert.equal((await publishShare(u.workspaceId, rows[i].token)).ok, true);
  const over = await publishShare(u.workspaceId, rows[PUBLIC_LIMITS.maxPerAccount].token);
  assert.equal(over.ok === false && over.code, "limit");
  const first = (await publishShare(u.workspaceId, rows[0].token)) as { ok: true; slug: string };
  assert.equal(first.ok, true); // already public: not blocked by the cap
  const res = await PATCH(jsonReq(u.cookie, "/api/share", "PATCH", { slug: first.slug, takedown: true }));
  assert.equal(res.status, 403); // not an admin
  assert.ok(await openPublic(first.slug));
  assert.equal(await takeDownPublic(first.slug), true);
  assert.equal(await openPublic(first.slug), null);
  const again = await publishShare(u.workspaceId, rows[0].token);
  assert.equal(again.ok === false && again.code, "taken_down");
});

test("robots lists both sitemaps", async () => {
  const src = await (await import("node:fs/promises")).readFile(new URL("../src/app/robots.ts", import.meta.url), "utf8");
  assert.ok(src.includes("/answers-sitemap.xml") && src.includes("/sitemap.xml"));
  assert.equal(src.includes('"/answers'), false); // public answers are never disallowed
});
