import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { realtimeAvailability, realtimeProvider, safetyId, sessionConfig, validOffer, REALTIME_LIMITS } from "@/lib/voice/realtime";
import { cleanXQuery, mapXResponse, searchRecentPosts, xConfigured } from "@/lib/providers/x-posts";

const ON = { KEPLAR_REALTIME_VOICE: "openai", OPENAI_API_KEY: "sk-test" };

test("live voice: off unless switched on with a key, and never on Free or signed out", () => {
  assert.equal(realtimeProvider({}), null);
  assert.equal(realtimeProvider({ KEPLAR_REALTIME_VOICE: "openai" }), null, "no key, no voice");
  assert.equal(realtimeProvider({ OPENAI_API_KEY: "sk" }), null, "key alone doesn't switch it on");
  assert.deepEqual(realtimeProvider(ON), { provider: "openai", model: "gpt-realtime", voice: "marin" });
  assert.equal(realtimeProvider({ ...ON, KEPLAR_REALTIME_MODEL: "gpt-realtime-2.1" })!.model, "gpt-realtime-2.1");
  assert.deepEqual(realtimeAvailability({ plan: "plus", userId: null }, ON), { available: false, reason: "signin" });
  assert.deepEqual(realtimeAvailability({ plan: "plus", userId: "u1", anonymous: true }, ON), { available: false, reason: "signin" });
  assert.deepEqual(realtimeAvailability({ plan: "plus", userId: "u1" }, {}), { available: false, reason: "not_configured" });
  assert.deepEqual(realtimeAvailability({ plan: "free", userId: "u1" }, ON), { available: false, reason: "plan" });
  assert.equal(realtimeAvailability({ plan: "plus", userId: "u1" }, ON).available, true);
});

test("live voice: only bounded audio SDP offers are forwarded; session says it's one model; safety id is a hash", () => {
  const sdp = "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n";
  assert.equal(validOffer(sdp), true);
  assert.equal(validOffer("hello"), false);
  assert.equal(validOffer({ sdp }), false);
  assert.equal(validOffer("v=0\r\nm=video 9 UDP 96\r\n" + "x".repeat(30)), false, "audio only");
  assert.equal(validOffer(sdp + "a".repeat(REALTIME_LIMITS.sdpBytes)), false, "size cap");
  const cfg = JSON.parse(sessionConfig({ model: "gpt-realtime", voice: "marin" }));
  assert.equal(cfg.type, "realtime");
  assert.match(cfg.instructions, /not Keplar's cross-checked panel/);
  assert.equal(cfg.audio.output.voice, "marin");
  const id = safetyId("user-123");
  assert.equal(id.length, 32);
  assert.ok(!id.includes("user-123"));
  assert.equal(id, safetyId("user-123"));
});

test("posts on X: not configured without a token, never fakes results", async () => {
  assert.equal(xConfigured({}), false);
  let called = false;
  const r = await searchRecentPosts("keplar", { env: {}, fetchImpl: (async () => { called = true; return new Response("{}"); }) as typeof fetch });
  assert.deepEqual(r, { ok: false, reason: "not_configured", message: "Posts from X aren't connected yet." });
  assert.equal(called, false);
  assert.equal(cleanXQuery("a"), null);
  assert.equal(cleanXQuery(5), null);
  assert.equal(cleanXQuery("  hello\n\tworld  "), "hello world");
  assert.equal(cleanXQuery("x".repeat(500))!.length, 256);
});

test("posts on X: maps the v2 recent search response with authors, links and metrics; handles 429 and errors", async () => {
  const raw = {
    data: [
      { id: "1", text: "first", author_id: "a", created_at: "2026-10-06T12:00:00.000Z", public_metrics: { like_count: 3, retweet_count: 1, reply_count: 2 } },
      { id: "2", text: "orphan" },
    ],
    includes: { users: [{ id: "a", username: "alice", name: "Alice" }] },
  };
  assert.deepEqual(mapXResponse(raw)[0], { id: "1", text: "first", author: { handle: "alice", name: "Alice" }, createdAt: "2026-10-06T12:00:00.000Z", url: "https://x.com/alice/status/1", metrics: { likes: 3, reposts: 1, replies: 2 } });
  assert.equal(mapXResponse(raw)[1].url, "https://x.com/i/web/status/2");
  let seen: { url: string; auth: string | null } | null = null;
  const env = { X_BEARER_TOKEN: "tok" };
  const ok = await searchRecentPosts("keplar ai", { env, fetchImpl: (async (u: string, init: RequestInit) => { seen = { url: String(u), auth: new Headers(init.headers).get("authorization") }; return Response.json(raw); }) as unknown as typeof fetch });
  assert.equal(ok.ok, true);
  assert.equal(ok.ok && ok.posts.length, 2);
  assert.equal(seen!.auth, "Bearer tok");
  const u = new URL(seen!.url);
  assert.equal(u.origin + u.pathname, "https://api.x.com/2/tweets/search/recent");
  assert.equal(u.searchParams.get("query"), "keplar ai -is:retweet");
  assert.equal(u.searchParams.get("max_results"), "10");
  const limited = await searchRecentPosts("keplar", { env, fetchImpl: (async () => new Response("", { status: 429 })) as typeof fetch });
  assert.equal(limited.ok === false && limited.reason, "rate_limited");
  const down = await searchRecentPosts("keplar", { env, fetchImpl: (async () => { throw new Error("net"); }) as typeof fetch });
  assert.equal(down.ok === false && down.reason, "upstream");
});
