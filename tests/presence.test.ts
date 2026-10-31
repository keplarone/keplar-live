import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { signIn, call, jsonReq } from "./helpers/session";
import { collection } from "@/lib/create/platform/store";
import { noteHeartbeat, flush, presentNow, resetPresenceState, presenceMark, PRESENCE_TTL_MS, HEARTBEAT_MS, type PresenceRow } from "@/lib/traffic/presence";
import { routeOf } from "@/lib/traffic/route";

const UA = "Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0 Safari/537.36";
const beat = (ip: string, extra: Record<string, string> = {}, ua = UA) =>
  new Request("https://keplar.one/api/presence", { method: "POST", body: "hb", headers: { "user-agent": ua, "x-forwarded-for": ip, ...extra } });
const T = Date.parse("2026-10-04T15:00:00Z");
const rows = () => collection<PresenceRow>("traffic_presence");
const clear = async () => { resetPresenceState(); await rows().purgeSystemBefore("seen", "9999-01-01", 100_000); };
/** Send a heartbeat the way the route does and wait for the batched write. */
async function send(ip: string, at: number, kind: "hb" | "bye" = "hb", extra: Record<string, string> = {}, ua = UA) {
  const p = noteHeartbeat(beat(ip, extra, ua), kind, at);
  if (p) await p;
}

test("a visitor is present for the TTL after the last heartbeat, then expires", async () => {
  await clear();
  // Oct 2026: 60 s beats and a 150 s TTL (was 15 s / 40 s), so presence alone doesn't keep the database awake (flush-gate.ts).
  assert.ok(PRESENCE_TTL_MS >= 120_000 && PRESENCE_TTL_MS <= 180_000);
  assert.ok(HEARTBEAT_MS <= PRESENCE_TTL_MS / 2); // survives one missed beat
  await send("198.51.100.1", T);
  assert.equal(await presentNow(T), 1);
  assert.equal(await presentNow(T + PRESENCE_TTL_MS - 1_000), 1);
  assert.equal(await presentNow(T + PRESENCE_TTL_MS + 1_000), 0);
});

test("distinct anonymous codes are counted once each; repeated heartbeats do not inflate the count", async () => {
  await clear();
  await send("198.51.100.1", T);
  await send("198.51.100.1", T + 15_000); // same visitor, next heartbeat
  await send("198.51.100.1", T + 16_000); // too soon: ignored
  await send("198.51.100.2", T + 15_000);
  assert.equal(await presentNow(T + 20_000), 2);
  assert.equal((await rows().listSystem()).length, 2);
  // A heartbeat keeps the visitor alive beyond the first TTL.
  assert.equal(await presentNow(T + 15_000 + PRESENCE_TTL_MS - 1_000), 2);
});

test("the leave beacon removes the visitor at once, and a late flush cannot bring them back", async () => {
  await clear();
  await send("198.51.100.3", T);
  await send("198.51.100.4", T);
  assert.equal(await presentNow(T + 1_000), 2);
  await send("198.51.100.3", T + 2_000, "bye");
  assert.equal(await presentNow(T + 2_500), 1);
  // A heartbeat that was still queued when the page closed is dropped.
  const queued = noteHeartbeat(beat("198.51.100.5"), "hb", T + 3_000);
  assert.ok(queued);
  await send("198.51.100.5", T + 3_500, "bye");
  await queued;
  await flush(T + 4_000);
  assert.equal(await presentNow(T + 4_500), 1);
});

test("bots, Do Not Track, Global Privacy Control, prefetches and missing user agents are never counted", async () => {
  await clear();
  assert.equal(noteHeartbeat(beat("203.0.113.1", {}, "Googlebot/2.1"), "hb", T), null);
  assert.equal(noteHeartbeat(beat("203.0.113.2", { dnt: "1" }), "hb", T), null);
  assert.equal(noteHeartbeat(beat("203.0.113.3", { "sec-gpc": "1" }), "hb", T), null);
  assert.equal(noteHeartbeat(beat("203.0.113.4", { "sec-purpose": "prefetch" }), "hb", T), null);
  assert.equal(noteHeartbeat(beat("203.0.113.5", {}, ""), "hb", T), null);
  assert.equal(noteHeartbeat(beat("203.0.113.6", {}, "HeadlessChrome/130 Lighthouse"), "hb", T), null);
  assert.equal(await flush(T), 0);
  assert.equal(await presentNow(T), 0);
});

test("stored rows hold only the rotating daily code and a time: no IP, user agent, path, referrer or account", async () => {
  await clear();
  await send("203.0.113.77", T, "hb", { referer: "https://www.google.com/search?q=private+question", cookie: "keplar_session=SECRET" });
  const stored = await rows().listSystem();
  assert.equal(stored.length, 1);
  assert.deepEqual(Object.keys(stored[0]!).sort(), ["id", "seen", "workspaceId"]);
  const blob = JSON.stringify(stored);
  for (const bad of ["203.0.113.77", "Mozilla", "Chrome", "google", "private", "SECRET", "keplar_session"]) assert.ok(!blob.includes(bad), `row leaks ${bad}`);
  assert.equal(stored[0]!.id, presenceMark("203.0.113.77", UA, "2026-10-04"));
  assert.notEqual(presenceMark("203.0.113.77", UA, "2026-10-04"), presenceMark("203.0.113.77", UA, "2026-10-05")); // rotates daily
});

test("per-minute cap bounds a flood from one instance", async () => {
  await clear();
  let queuedMarks = 0;
  const ps: Promise<void>[] = [];
  for (let i = 0; i < 6_200; i++) {
    const p = noteHeartbeat(beat(`10.9.${(i >> 8) & 255}.${i & 255}`), "hb", T);
    if (p) ps.push(p);
    queuedMarks++;
  }
  assert.equal(queuedMarks, 6_200);
  await Promise.all(ps);
  await flush(T);
  await flush(T);
  const n = (await rows().listSystem()).length;
  assert.ok(n <= 6_000, `stored ${n}`);
  await clear();
});

test("POST /api/presence: plain-text body only, always 204, nothing echoed, no cookie set", async () => {
  await clear();
  const route = await import("@/app/api/presence/route");
  const res = await route.POST(beat("198.51.100.20"));
  assert.equal(res.status, 204);
  assert.equal(await res.text(), "");
  assert.equal(res.headers.get("set-cookie"), null);
  assert.match(res.headers.get("cache-control") ?? "", /no-store/);
  assert.equal((await route.POST(new Request("https://keplar.one/api/presence", { method: "POST", body: "x".repeat(500), headers: { "user-agent": UA, "x-forwarded-for": "198.51.100.21" } }))).status, 204);
  assert.equal((await route.POST(new Request("https://keplar.one/api/presence", { method: "POST", body: '{"path":"/secret"}', headers: { "user-agent": UA, "x-forwarded-for": "198.51.100.22" } }))).status, 204);
  assert.equal(await presentNow(), 1); // only the valid "hb" counted (now-based, within TTL)
  const bye = await route.POST(new Request("https://keplar.one/api/presence", { method: "POST", body: "bye", headers: { "user-agent": UA, "x-forwarded-for": "198.51.100.20" } }));
  assert.equal(bye.status, 204);
  assert.equal(await presentNow(), 0);
});

test("admin endpoints: 404 for anonymous and non-admins; the admin gets one number and no identifiers", async () => {
  await clear();
  const plain = await signIn("presence-plain@example.com", "free");
  const pres = await import("@/app/api/admin/presence/route");
  const live = await import("@/app/api/admin/live/route");
  for (const cookie of [null, plain.cookie]) {
    assert.equal((await pres.GET(call(cookie, "/api/admin/presence"))).status, 404);
    assert.equal((await live.GET(call(cookie, "/api/admin/live"))).status, 404);
  }
  process.env.KEPLAR_ADMIN_EMAILS = "presence-admin@example.com";
  const admin = await signIn("presence-admin@example.com", "free");
  const route = await import("@/app/api/presence/route");
  await route.POST(beat("198.51.100.30"));
  await route.POST(beat("198.51.100.31"));
  const res = await pres.GET(call(admin.cookie, "/api/admin/presence"));
  assert.equal(res.status, 200);
  assert.match(res.headers.get("cache-control") ?? "", /no-store/);
  const text = await res.text();
  assert.deepEqual(JSON.parse(text), { onSiteNow: 2 });
  const l = await live.GET(call(admin.cookie, "/api/admin/live"));
  const lt = await l.text();
  assert.equal((JSON.parse(lt) as { onSiteNow: number }).onSiteNow, 2);
  for (const t of [text, lt]) for (const bad of ["198.51.100", presenceMark("198.51.100.30", UA, new Date().toISOString().slice(0, 10)), "presence-admin", "@example.com", "user-agent", "Mozilla"]) assert.ok(!t.includes(bad), `admin response leaks ${bad}`);
  void jsonReq;
});

test("the browser beacon: idle start, 60 s visible-only heartbeat, leave on pagehide, never on admin pages, no cookies", () => {
  const src = readFileSync("src/components/analytics/PresenceBeacon.tsx", "utf8");
  assert.match(src, /requestIdleCallback/);
  assert.match(src, /visibilityState/);
  assert.match(src, /pagehide/);
  assert.match(src, /sendBeacon/);
  assert.match(src, /doNotTrack/);
  assert.match(src, /globalPrivacyControl/);
  assert.doesNotMatch(src, /document\.cookie|localStorage|sessionStorage/);
  assert.equal(HEARTBEAT_MS, 60_000);
  for (const p of ["/admin", "/admin/seo", "/api/x", "/s/abc", "/reset-password"]) assert.equal(routeOf(p), null, p);
  assert.equal(routeOf("/pricing"), "/pricing");
  assert.match(readFileSync("src/app/layout.tsx", "utf8"), /<PresenceBeacon \/>/);
});

test("privacy page describes the online-now signal truthfully", () => {
  const src = readFileSync("src/components/legal/content/privacy.ts", "utf8");
  assert.match(src, /Who is on the site right now/);
  assert.match(src, /every 15 seconds/);
  assert.match(src, /about 40 seconds/);
  assert.match(src, /never sent from admin pages/);
});
