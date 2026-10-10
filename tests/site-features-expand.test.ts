import { test } from "node:test";
import assert from "node:assert/strict";
import { expandFeatures } from "../src/lib/site-builder/features/expand";
import type { Site } from "../src/lib/site-builder/types";

const site = { id: "site_1", slug: "mill" } as Site;
const ctx = (preview = false) => ({ site, base: "/s/mill", preview, file: "contact.html" });

test("expand: an unbuilt feature shows an honest note, never a fake widget", async () => {
  const { FEATURES } = await import("@/lib/site-builder/features/catalog");
  const f = FEATURES.find((x) => x.id === "embeds")!;
  f.status = "soon";
  try {
    const out = await expandFeatures('<main><div data-k-feature="embeds" data-k-id="a"></div></main>', ctx());
    assert.match(out, /isn't available yet/);
    assert.match(out, /coming soon/);
    assert.doesNotMatch(out, /<form|<a /);
  } finally {
    f.status = "beta";
  }
});
test("expand: pages without placeholders are returned untouched", async () => {
  assert.equal(await expandFeatures("<p>hi</p>", ctx()), "<p>hi</p>");
});
