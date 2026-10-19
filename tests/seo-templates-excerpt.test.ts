import { test } from "node:test";
import assert from "node:assert/strict";
import { excerptPage, excerptSnapshot } from "../src/lib/templates/excerpt";

test("template excerpts: title, headings and first paragraphs as plain text, scripts and nav dropped, home first", () => {
  const html = `<html><head><title>Saltgrass &amp; Co</title><script>alert(1)</script></head><body><nav><a href="/">Home</a><p>nav text that should not count at all here</p></nav><h1>A wine bar by the sea</h1><p>Short.</p><p>Six words are needed for a paragraph to count, and this one has more than enough.</p><h2>Menu</h2><p>Small plates change weekly with what the boats bring in, and the list is short.</p><footer><p>Footer paragraph with plenty of words that must not appear in the excerpt at all.</p></footer></body></html>`;
  const e = excerptPage("index.html", html, { maxWords: 20 });
  assert.equal(e.name, "Home");
  assert.equal(e.title, "Saltgrass & Co");
  assert.deepEqual(e.headings, ["A wine bar by the sea", "Menu"]);
  assert.ok(e.text.startsWith("Six words are needed") && e.text.endsWith("…") && !e.text.includes("nav text") && !e.text.includes("Footer"));
  assert.equal(e.words, 20);
  const all = excerptSnapshot({ "menu.html": "<h1>Menu</h1>", "index.html": "<h1>Home</h1>", "404.html": "<h1>Nope</h1>" });
  assert.deepEqual(all.map((p) => p.name), ["Home", "Menu"]);
  assert.equal(excerptPage("about-us.html", "").title, "About us");
});
