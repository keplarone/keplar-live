import { test } from "node:test";
import assert from "node:assert/strict";
import { FEATURES, FEATURE_ATTRS, usableFeatures } from "../src/lib/site-builder/features/catalog";
import { sanitizeHtml } from "../src/lib/site-builder/sanitize";

test("catalog: every feature has an example, a prompt and an honest status", () => {
  assert.equal(new Set(FEATURES.map((f) => f.id)).size, FEATURES.length);
  for (const f of FEATURES) {
    assert.ok(f.label && f.summary && f.prompt, f.id);
    assert.ok(["live", "beta", "soon"].includes(f.status));
  }
  assert.ok(usableFeatures().every((f) => f.status !== "soon"));
});

test("attributes: only validated choices survive", () => {
  const a = FEATURE_ATTRS;
  assert.equal(a["data-k-feature"]("form"), "form");
  assert.equal(a["data-k-feature"]("exec"), null);
  assert.equal(a["data-k-id"]("contact-1"), "contact-1");
  assert.equal(a["data-k-id"]("../x"), null);
  assert.equal(a["data-k-title"]("Book a call"), "Book a call");
  assert.equal(a["data-k-title"]('x"><script>'), null);
  assert.equal(a["data-k-fields"]("name,email,message"), "name,email,message");
  assert.equal(a["data-k-fields"]("name,<b>"), null);
  assert.equal(a["data-k-hours"]("09:00-17:00"), "09:00-17:00");
  assert.equal(a["data-k-hours"]("17:00-09:00"), null);
  assert.equal(a["data-k-days"]("mon-fri"), "mon-fri");
  assert.equal(a["data-k-days"]("mon-fri,sat"), "mon-fri,sat");
  assert.equal(a["data-k-days"]("everyday"), null);
  assert.equal(a["data-k-slot"]("30"), "30");
  assert.equal(a["data-k-slot"]("7"), null);
  assert.equal(a["data-k-tz"]("America/New_York"), "America/New_York");
  assert.equal(a["data-k-tz"]("Mars/Base"), null);
});

test("sanitizer keeps feature placeholders on a div, drops bad values and other tags' data-k", () => {
  const out = sanitizeHtml('<body><div data-k-feature="form" data-k-id="contact" data-k-fields="name,email" data-k-title="Hi &quot;x"></div><p data-k-feature="form">t</p><div data-k-feature="rm -rf" data-k-id="a"></div></body>').body;
  assert.match(out, /<div data-k-feature="form" data-k-id="contact" data-k-fields="name,email"><\/div>/);
  assert.doesNotMatch(out, /<p [^>]*data-k/);
  assert.doesNotMatch(out, /rm -rf/);
});
