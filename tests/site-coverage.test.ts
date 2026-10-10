import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeBrief } from "../src/lib/site-builder/brief";
import { coverage } from "../src/lib/site-builder/coverage";

const brief = normalizeBrief({ name: "Mill Lane Bakehouse", idea: "A bakery site", pages: ["Home", "Menu"], sections: ["Opening hours", "Reserve a loaf", "Wedding cakes"], goal: "Reserve a loaf", accent: "#b4532a" });
const files = {
  "index.html": '<html><head><title>Mill Lane Bakehouse</title></head><body><h1>Mill Lane Bakehouse</h1><section id="hours"><h2>Opening hours</h2><p>Tue to Sun</p></section><section><h2>Reserve your loaf</h2><form><button>Reserve a loaf</button></form></section></body></html>',
  "menu.html": "<html><body><h1>Menu</h1><p>Sourdough, rye</p></body></html>",
  "styles.css": ":root{--accent:#B4532A}",
};

test("coverage: finds what was built and says what is missing", () => {
  const items = coverage(brief, files);
  const by = (s: string) => items.find((i) => i.ask.startsWith(s))!;
  assert.equal(by("Name").built, true);
  assert.equal(by("Page: Menu").built, true);
  assert.equal(by("Section: Opening hours").built, true);
  assert.equal(by("Section: Reserve a loaf").built, true);
  assert.equal(by("Section: Wedding cakes").built, false);
  assert.equal(by("Goal").built, true);
  assert.equal(by("Accent").built, true);
});

test("coverage: an empty build reports everything missing, never throws", () => {
  const items = coverage(brief, {});
  assert.ok(items.length >= 5);
  assert.ok(items.every((i) => !i.built));
});

import { fixPrompt, gapsOf } from "../src/lib/site-builder/coverage";
test("self-review: only missing pages and sections trigger a fix, and the prompt names them", () => {
  const items = coverage(brief, { "index.html": files["index.html"], "styles.css": "" });
  const gaps = gapsOf(items);
  assert.deepEqual(gaps.map((g) => g.ask), ["Page: Menu", "Section: Wedding cakes"]);
  const p = fixPrompt(gaps);
  assert.match(p, /page Menu; section Wedding cakes/);
  assert.match(p, /Keep everything else exactly as it is/);
  assert.deepEqual(gapsOf(coverage(brief, files)).map((g) => g.ask), ["Section: Wedding cakes"]);
});

import { featureDoc, usableFeatures } from "../src/lib/site-builder/features/catalog";
import { builderSystem } from "../src/lib/site-builder/generate";
test("features: the generator is taught only working features, and the checklist asks for them", async () => {
  assert.ok(usableFeatures().length >= 4);
  assert.match(builderSystem({ edit: false, motion: false }), /REAL FEATURES/);
  assert.match(featureDoc(), /data-k-feature="booking"/);
  const { FEATURES } = await import("../src/lib/site-builder/features/catalog");
  const embeds = FEATURES.find((f) => f.id === "embeds")!;
  embeds.status = "soon";
  try { assert.doesNotMatch(featureDoc(), /data-k-feature="embeds"/); } finally { embeds.status = "beta"; } // a feature marked soon is never offered to the model
  assert.match(featureDoc(), /data-k-feature="embeds"/);
  assert.match(featureDoc(), /data-k-feature="checkout"[^>]*data-k-products=/);
  assert.match(featureDoc(), /BETA/);
  const shopBrief = { ...normalizeBrief({ name: "Loaf Co" }), pages: ["Home"], sections: [], goal: "Accept payments for bread", idea: "A bakery with an online store" };
  assert.equal(coverage(shopBrief, { "index.html": "<h1>Home</h1>" }).find((i) => i.ask.startsWith("Feature: Checkout"))?.built, false);
  const brief = { ...normalizeBrief({ name: "Table Co" }), pages: ["Home"], sections: [], goal: "Let people book a table", idea: "A restaurant with bookings" };
  const none = coverage(brief, { "index.html": "<h1>Home</h1>" }).find((i) => i.ask.startsWith("Feature: Bookings"));
  assert.equal(none?.built, false);
  assert.ok(gapsOf([none!]).length === 1);
  assert.match(fixPrompt([none!]), /data-k-feature placeholder/);
  const ok = coverage(brief, { "index.html": '<div data-k-feature="booking" data-k-id="t"></div>' }).find((i) => i.ask.startsWith("Feature: Bookings"));
  assert.equal(ok?.built, true);
});
