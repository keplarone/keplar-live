import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = () => readFileSync("src/app/(marketing)/developers/page.tsx", "utf8");
const tabs = () => readFileSync("src/components/developers/CodeTabs.tsx", "utf8");

// axe "scrollable-region-focusable": a code block that scrolls sideways must be reachable by keyboard.
test("/developers code samples are keyboard-focusable, labelled scroll regions", () => {
  const pres = [...(page().match(/<pre\b[^>]*>/g) ?? []), ...(tabs().match(/<pre\b[^>]*>/g) ?? [])];
  assert.ok(pres.length >= 4);
  for (const p of pres) {
    assert.match(p, /tabIndex=\{0\}/, p);
    assert.match(p, /aria-label(ledby)?=/, p);
  }
  assert.match(page(), /<CodeTabs\b/, "the quickstart uses the tabbed sample");
});

// Same rule for every table wrapper, which scrolls sideways on a phone.
test("/developers table wrappers that scroll are focusable labelled regions", () => {
  const wraps = page().match(/<div className=\{s\.tableWrap\}[^>]*>/g) ?? [];
  assert.ok(wraps.length >= 3);
  for (const w of wraps) {
    assert.match(w, /tabIndex=\{0\}/, w);
    assert.match(w, /role="region"/, w);
    assert.match(w, /aria-label=/, w);
  }
});

test("/developers states the free tier honestly and links every product", () => {
  const src = page();
  for (const href of ["/account#api", "/account#embed", "/account#team", "/account#invite", "/api/v1/openapi.json", "/referral-terms"]) assert.ok(src.includes(href), href);
  assert.match(src, /:free/);
  assert.doesNotMatch(src, /guarantee|testimonial|\b\d{2,3}% /i);
});
