import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { attributionFromMetadata, attributionMetadata, sanitizeAttribution } from "../src/lib/seo/attribution";
import { checkoutBody, liteCheckoutBody } from "../src/lib/billing/whop";

test("attribution: only an allow-listed landing path, source class and campaign tags survive", () => {
  assert.deepEqual(sanitizeAttribution({ landing: "/ai-study-tool", src: "search", utmSource: "newsletter", utmCampaign: "oct-launch" }), { landing: "/ai-study-tool", src: "search", utmSource: "newsletter", utmCampaign: "oct-launch" });
  assert.deepEqual(sanitizeAttribution({ landing: "/pricing", src: "ai", utmSource: "<script>", utmCampaign: "x".repeat(61) }), { landing: "/pricing", src: "ai" });
  assert.equal(sanitizeAttribution({ landing: "https://evil.example/x", src: "search" }), null);
  assert.equal(sanitizeAttribution({ landing: "/pricing", src: "referrer-url" }), null);
  assert.equal(sanitizeAttribution("nope"), null);
  assert.deepEqual(attributionMetadata(null), {});
  const md = attributionMetadata({ landing: "/", src: "direct", utmCampaign: "c" });
  assert.deepEqual(md, { landing: "/", src: "direct", utm_campaign: "c" });
  assert.deepEqual(attributionFromMetadata({ ...md, email: "a@b.c", plan: "plus" }), { landing: "/", src: "direct", utmCampaign: "c" });
  assert.equal(attributionFromMetadata({ landing: "/x", src: "bogus" }), null);
});

test("attribution: hosted checkout metadata carries it, and never the browser id, referrer or email changes", () => {
  const a = { landing: "/ai-research-assistant", src: "search" as const, utmSource: "bing" };
  const body = checkoutBody({ plan: "plus", email: "Person@Example.com", workspaceId: "ws_1", attribution: a });
  assert.deepEqual(body.metadata, { email: "person@example.com", plan: "plus", workspace_id: "ws_1", source: "keplar.one", landing: "/ai-research-assistant", src: "search", utm_source: "bing" });
  const lite = liteCheckoutBody({ plan: "lite", email: "p@example.com", workspaceId: "ws_1", attribution: null });
  assert.deepEqual(lite.metadata, { email: "p@example.com", plan: "lite", workspace_id: "ws_1", source: "keplar.one" });
});
