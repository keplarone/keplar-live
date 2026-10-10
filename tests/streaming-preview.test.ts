import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSrcdoc } from "../src/components/create/workspace/partial";
import { newForgeState } from "../src/components/create/workspace/forgeState";

const page = (extra = "") => `<!doctype html><html><head><title>x</title><link rel="stylesheet" href="styles.css">${extra}</head><body onload="steal()"><a href="javascript:alert(1)">x</a><script>alert(1)</script><iframe src="https://e.x"></iframe><h1>Hi</h1></body></html>`;

test("progressive preview: waits for the stylesheet, then inlines it and removes everything that could run", () => {
  assert.equal(buildSrcdoc({ "index.html": page() }), null, "html alone would flash unstyled; wait for the css");
  const doc = buildSrcdoc({ "index.html": page(), "styles.css": "h1{color:#111}" })!;
  assert.match(doc, /<style>h1\{color:#111\}<\/style>/);
  assert.doesNotMatch(doc, /<script|<iframe|onload|javascript:/i);
  assert.match(doc, /pointer-events:none/, "links are inert in the preview");
});

test("progressive preview: a page with no local stylesheet shows right away; no html means no preview", () => {
  assert.match(buildSrcdoc({ "index.html": "<html><head></head><body><h1>Hello</h1></body></html>" })!, /Hello/);
  assert.equal(buildSrcdoc({ "styles.css": "a{}" }), null);
  assert.match(buildSrcdoc({ "menu.html": "<h1>Menu</h1>" })!, /Menu/, "falls back to the first page that exists");
});

test("forge state starts empty: no invented files", () => {
  const f = newForgeState();
  assert.deepEqual([f.files, f.planned, f.dissolve, f.progress], [[], 0, 0, 0]);
});
