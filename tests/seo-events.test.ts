import "./setup";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { SeoEventRow } from "../src/lib/seo/events";
import { consentOk, pruneSeoEvents, recordSeoEvent, retainSeoDays, sanitizeSeoEvent, seoReport, summarize } from "../src/lib/seo/events";
import { CONSENT_VERSION } from "../src/lib/consent";
import { classifySource } from "../src/lib/seo-events";

const cookie = (analytics: boolean, at = Date.now()) => `keplar_consent=${encodeURIComponent(JSON.stringify({ version: CONSENT_VERSION, at, choices: { analytics } }))}`;
const vid = "a".repeat(24);

test("sanitize keeps only allow-listed fields and rejects free text", () => {
  const ok = sanitizeSeoEvent({ e: "landing_view", landing: "/superintelligence", src: "search", vid, utmSource: "x", prompt: "my secret question", email: "a@b.co" });
  assert.deepEqual(ok, { event: "landing_view", landing: "/superintelligence", src: "search", vid, where: undefined, utmSource: "x", utmCampaign: undefined, level: undefined, dev: undefined });
  assert.equal(JSON.stringify(ok).includes("secret"), false);
  assert.equal(sanitizeSeoEvent({ e: "evil", landing: "/", src: "search", vid }), null);
  assert.equal(sanitizeSeoEvent({ e: "landing_view", landing: "https://evil.com/x?q=1", src: "search", vid }), null);
  assert.equal(sanitizeSeoEvent({ e: "landing_view", landing: "/superintelligence?q=secret", src: "search", vid }), null);
  assert.equal(sanitizeSeoEvent({ e: "landing_view", landing: "/", src: "search", vid: "short" }), null);
  assert.equal(sanitizeSeoEvent({ e: "landing_view", landing: "/", src: "weird", vid })?.src, "other");
  assert.equal(sanitizeSeoEvent({ e: "synthesis_success", landing: "(unknown)", src: "direct", vid, level: "<script>" })?.level, undefined);
  assert.equal(sanitizeSeoEvent(null), null);
});

test("events are accepted only with analytics consent and without GPC/DNT", () => {
  assert.equal(consentOk(new Headers()), false);
  assert.equal(consentOk(new Headers({ cookie: cookie(false) })), false);
  assert.equal(consentOk(new Headers({ cookie: cookie(true) })), true);
  assert.equal(consentOk(new Headers({ cookie: cookie(true), "sec-gpc": "1" })), false);
  assert.equal(consentOk(new Headers({ cookie: cookie(true), dnt: "1" })), false);
  assert.equal(consentOk(new Headers({ cookie: "keplar_consent=garbage" })), false);
});

test("route answers 204 and records only consented, valid events", async () => {
  const { POST } = await import("../src/app/api/seo/event/route");
  const call = (headers: Record<string, string>, body: unknown) => POST(new Request("https://keplar.one/api/seo/event", { method: "POST", headers: { "x-forwarded-for": "203.0.113.9", ...headers }, body: JSON.stringify(body) }));
  const before = (await seoReport(1)).length;
  const v = "b".repeat(24);
  assert.equal((await call({}, { e: "landing_view", landing: "/route-test", src: "search", vid: v })).status, 204);
  assert.equal((await seoReport(1)).length, before, "no consent: nothing stored");
  assert.equal((await call({ cookie: cookie(true) }, { e: "landing_view", landing: "/route-test", src: "search", vid: v })).status, 204);
  assert.equal((await call({ cookie: cookie(true) }, { e: "nope" })).status, 204);
  const r = (await seoReport(1)).find((x) => x.landing === "/route-test");
  assert.equal(r?.views, 1);
});

test("summarize counts distinct browsers per step and per source", () => {
  const row = (event: string, v: string, src = "search") => ({ id: v + event, workspaceId: "system", at: "2026-10-03T00:00:00.000Z", day: "2026-10-03", event, landing: "/si", src, vid: v }) as unknown as SeoEventRow;
  const s = summarize([row("landing_view", "v1"), row("landing_view", "v1"), row("landing_view", "v2", "ai"), row("cta_click", "v1"), row("signup_complete", "v1"), row("first_prompt", "v1"), row("synthesis_success", "v1")]);
  assert.equal(s.length, 1);
  assert.deepEqual({ ...s[0], landing: undefined }, { landing: undefined, views: 2, ctaClicks: 1, signups: 1, firstPrompts: 1, syntheses: 1, bySource: { search: 1, ai: 1 } });
});

test("retention: 180 days by default, env override, old rows purged", async () => {
  assert.equal(retainSeoDays({}), 180);
  assert.equal(retainSeoDays({ KEPLAR_RETAIN_SEO_EVENTS_DAYS: "30" }), 30);
  assert.equal(retainSeoDays({ KEPLAR_RETAIN_SEO_EVENTS_DAYS: "x" }), 180);
  const old = new Date(Date.now() - 400 * 864e5);
  await recordSeoEvent({ event: "landing_view", landing: "/old-page", src: "direct", vid: "c".repeat(24) }, old);
  await recordSeoEvent({ event: "landing_view", landing: "/new-page", src: "direct", vid: "c".repeat(24) });
  await pruneSeoEvents();
  const all = await seoReport(800);
  assert.ok(!all.some((x) => x.landing === "/old-page"));
  assert.ok(all.some((x) => x.landing === "/new-page"));
});

test("source classification keeps only a coarse class, never the referrer URL", () => {
  const h = "keplar.one";
  assert.equal(classifySource("", h), "direct");
  assert.equal(classifySource("https://www.google.com/search?q=secret", h), "search");
  assert.equal(classifySource("https://www.bing.com/", h), "search");
  assert.equal(classifySource("https://duckduckgo.com/", h), "search");
  assert.equal(classifySource("https://chatgpt.com/", h), "ai");
  assert.equal(classifySource("https://www.perplexity.ai/search/x", h), "ai");
  assert.equal(classifySource("https://x.com/a/status/1", h), "social");
  assert.equal(classifySource("https://news.ycombinator.com/item?id=1", h), "social");
  assert.equal(classifySource("https://keplar.one/pricing", h), "internal");
  assert.equal(classifySource("https://example.org/post", h), "other");
  assert.equal(classifySource("not a url", h), "other");
});
