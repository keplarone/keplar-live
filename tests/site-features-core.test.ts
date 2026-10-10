import { test } from "node:test";
import assert from "node:assert/strict";
import { checkToken, issueToken, linkSpam } from "../src/lib/site-builder/features/spam";
import { findIn, findPlaceholders } from "../src/lib/site-builder/features/placeholders";

test("form token: too fast, ok, expired, wrong site, tampered", () => {
  const t0 = 1_700_000_000_000;
  const tok = issueToken("site_a", t0);
  assert.equal(checkToken(tok, "site_a", t0 + 200), "too-fast");
  assert.equal(checkToken(tok, "site_a", t0 + 5000), "ok");
  assert.equal(checkToken(tok, "site_a", t0 + 25 * 3600_000), "expired");
  assert.equal(checkToken(tok, "site_b", t0 + 5000), "invalid");
  assert.equal(checkToken(tok.slice(0, -2) + "xx", "site_a", t0 + 5000), "invalid");
  assert.equal(checkToken(undefined, "site_a"), "invalid");
  assert.equal(checkToken("", "site_a"), "invalid");
});

test("link spam: a couple of links are fine, a pile is not", () => {
  assert.equal(linkSpam(["see https://a.example and https://b.example"]), false);
  assert.equal(linkSpam(["http://a http://b", "www.c.example"]), true);
});

test("placeholders: found with their validated attributes; lookups are per feature and id", () => {
  const html = '<main><div data-k-feature="form" data-k-id="contact" data-k-fields="name,email"></div><p>x</p><div data-k-feature="newsletter" data-k-id="news"> </div><div data-k-feature="form" data-k-id="x">child<b>no</b></div></main>';
  const ps = findPlaceholders(html);
  assert.deepEqual(ps.map((p) => [p.feature, p.key]), [["form", "contact"], ["newsletter", "news"]]); // a div with children is not a placeholder
  assert.equal(ps[0].attrs.fields, "name,email");
  assert.equal(findIn({ "index.html": html, "a.css": "" }, "form", "contact")?.file, "index.html");
  assert.equal(findIn({ "index.html": html }, "form", "other"), null);
});
