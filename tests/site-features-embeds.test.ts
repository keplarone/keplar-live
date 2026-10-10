import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { signIn } from "./helpers/session";
import { featureSite, getPage } from "./helpers/feature-site";
import { parseCalendar, parseEmbed, parseVideo } from "@/lib/site-builder/features/embeds";
import { FEATURE_ATTRS } from "@/lib/site-builder/features/catalog";

test("video links: only YouTube and Vimeo, rebuilt from the id", () => {
  assert.deepEqual(parseVideo("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=x"), { provider: "YouTube", href: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", thumb: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg" });
  assert.equal(parseVideo("https://youtu.be/dQw4w9WgXcQ?t=5")?.href, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(parseVideo("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ")?.provider, "YouTube");
  assert.deepEqual(parseVideo("https://vimeo.com/123456789"), { provider: "Vimeo", href: "https://vimeo.com/123456789" });
  for (const bad of ["http://youtu.be/dQw4w9WgXcQ", "https://evil.example/watch?v=dQw4w9WgXcQ", "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ", "javascript:alert(1)", "https://youtube.com/watch?v=short", "https://user:pw@youtu.be/dQw4w9WgXcQ", "https://vimeo.com/abc"]) assert.equal(parseVideo(bad), null, bad);
});

test("calendar links: only known booking hosts", () => {
  assert.equal(parseCalendar("https://calendly.com/anna/30min?hide_gdpr_banner=1"), "https://calendly.com/anna/30min?hide_gdpr_banner=1");
  assert.equal(parseCalendar("https://cal.com/anna"), "https://cal.com/anna");
  assert.equal(parseCalendar("https://anna.cal.com/x"), "https://anna.cal.com/x");
  for (const bad of ["https://calendly.com.evil.example/x", "https://evil.example/calendly.com", "http://calendly.com/x", "ftp://cal.com/x", "https://evilcal.com/x", "https://calendly.com:8443/x"]) assert.equal(parseCalendar(bad), null, bad);
});

test("the sanitizer keeps only valid embed attributes", () => {
  assert.equal(FEATURE_ATTRS["data-k-src"]("https://youtu.be/dQw4w9WgXcQ"), "https://youtu.be/dQw4w9WgXcQ");
  assert.equal(FEATURE_ATTRS["data-k-src"]("javascript:alert(1)"), null);
  assert.equal(FEATURE_ATTRS["data-k-src"]('https://a.example/"onload=x'), null);
  assert.equal(FEATURE_ATTRS["data-k-phone"]("+1 (555) 123-4567"), "+1 (555) 123-4567");
  assert.equal(FEATURE_ATTRS["data-k-phone"]("<x>"), null);
  assert.equal(FEATURE_ATTRS["data-k-kind"]("map"), "map");
  assert.equal(FEATURE_ATTRS["data-k-kind"]("iframe"), null);
});

test("cards on a published page: real provider links built by the server, nothing runs, unsupported links say so", async () => {
  const { cookie, workspaceId } = await signIn("emb1@example.com");
  const s = await featureSite(cookie, workspaceId, "Mill Lane", {
    "index.html": [
      '<div data-k-feature="embeds" data-k-id="v" data-k-kind="video" data-k-src="https://youtu.be/dQw4w9WgXcQ" data-k-title="Our story"></div>',
      '<div data-k-feature="embeds" data-k-id="m" data-k-kind="map" data-k-address="12 Mill Lane, Brooklyn &amp; Co" data-k-title="Visit us"></div>',
      '<div data-k-feature="embeds" data-k-id="c" data-k-kind="calendar" data-k-src="https://calendly.com/anna/30min"></div>',
      '<div data-k-feature="embeds" data-k-id="w" data-k-kind="chat" data-k-phone="+1 (555) 123-4567"></div>',
      '<div data-k-feature="embeds" data-k-id="bad" data-k-kind="video" data-k-src="https://evil.example/x" data-k-title="Evil"></div>',
    ].join(""),
  });
  const res = await getPage(s.slug);
  const html = await res.text();
  assert.match(html, /<img src="https:\/\/i\.ytimg\.com\/vi\/dQw4w9WgXcQ\/hqdefault\.jpg"/);
  assert.match(html, /href="https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ"[^>]*target="_blank" rel="noopener noreferrer">Watch on YouTube/);
  assert.match(html, /href="https:\/\/www\.google\.com\/maps\/search\/\?api=1&amp;query=12%20Mill%20Lane%2C%20Brooklyn%20%26%20Co"/);
  assert.match(html, /Visit us/);
  assert.match(html, /href="https:\/\/calendly\.com\/anna\/30min"/);
  assert.match(html, /href="https:\/\/wa\.me\/15551234567"/);
  assert.match(html, /<strong>Evil<\/strong> isn't set up/);
  assert.doesNotMatch(html, /evil\.example/);
  assert.doesNotMatch(html, /<iframe|<script/i);
  assert.doesNotMatch(res.headers.get("content-security-policy") ?? "", /frame-src|script-src/);
  assert.equal(parseEmbed({ kind: "map", address: "" }), null);
});
