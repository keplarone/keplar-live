import { test } from "node:test";
import assert from "node:assert/strict";
import { listSections, regeneratePrompt } from "../src/lib/site-builder/sections";

const html = `<!doctype html><body><header class="top"><nav>Menu</nav></header>
<main><section id="hero"><h1>Bread, before sunrise</h1><p>Baked by hand</p></section>
<section class="hours" aria-label="Opening hours"><div><section><h3>Inner</h3></div></section><p>Tue to Sun</p></section>
<section><h2>Reserve a <em>loaf</em></h2><form></form></section></main><footer><p>Mill Lane</p></footer></body>`;

test("sections: top-level blocks with titles, nested ones folded in", () => {
  const s = listSections(html);
  assert.deepEqual(s.map((x) => x.title), ["Menu", "Bread, before sunrise", "Inner", "Reserve a loaf", "Footer"].map((t, i) => (i === 0 ? "Header" : i === 2 ? "Inner" : t)));
  assert.equal(s[1].id, "hero");
  assert.equal(s.length, 5);
  assert.ok(s.every((x) => x.chars > 0));
});
test("sections: no blocks, broken markup and comments never throw", () => {
  assert.deepEqual(listSections("<p>hi</p>"), []);
  assert.doesNotThrow(() => listSections("<section><h2>Open"));
  assert.deepEqual(listSections("<!-- <section><h2>x</h2></section> -->"), []);
});
test("regenerate prompt names the page and the block and protects the rest", () => {
  const [, hero] = listSections(html);
  const p = regeneratePrompt("index.html", hero, "");
  assert.match(p, /Rewrite only the section "Bread, before sunrise" \(id="hero"\) on index\.html/);
  assert.match(p, /Do not change any other section/);
  assert.match(regeneratePrompt("menu.html", hero, "shorter and warmer"), /What I want from it: shorter and warmer/);
});

import { imageSlotPrompt, listImageSlots } from "../src/lib/site-builder/sections";
test("image slots: placeholders, missing alt, external src, good images", () => {
  const h = `<figure><div class="k-ph k-x">Photo: a loaf cooling on a rack</div></figure><img src="https://cdn.example.com/a.jpg" alt="Loaf"><img src="/p.png"><img src="/ok.png" alt="Oven"><script>"<img src=x>"</script>`;
  const s = listImageSlots(h);
  assert.deepEqual(s.map((x) => [x.kind, x.label, x.issue === null]), [["placeholder", "a loaf cooling on a rack", false], ["image", "Loaf", false], ["image", "p.png", false], ["image", "Oven", true]]);
  assert.match(s[1].issue ?? "", /another website/);
  assert.match(s[2].issue ?? "", /No alt text/);
  assert.match(imageSlotPrompt("index.html", s[0], 0), /replace the photo placeholder "a loaf cooling on a rack"/);
  assert.deepEqual(listImageSlots("<p>none</p>"), []);
});
