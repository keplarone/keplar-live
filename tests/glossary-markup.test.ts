import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// axe "definition-list" / "dlitem": a <dl> may hold only <dt>/<dd>. The glossary used one <dl> around letter headings and <div> term blocks,
// which is invalid (the page markup can't be rendered here because CSS modules aren't loadable in the node test runner, so this reads the source).
test("glossary: each term is its own <dl> holding only dt/dd; no <dl> wraps headings or divs", () => {
  const src = readFileSync("src/app/(marketing)/glossary/page.tsx", "utf8");
  const dls = [...src.matchAll(/<dl\b[^>]*>([\s\S]*?)<\/dl>/g)];
  assert.equal(dls.length, 1, "one <dl> per term (inside the terms.map)");
  const inner = dls[0][1];
  assert.match(inner, /<dt>/);
  assert.match(inner, /<dd>/);
  assert.doesNotMatch(inner, /<(div|h[1-6]|section)\b/);
  assert.doesNotMatch(src, /<dl[^>]*termList/);
  const out = src.replace(/<dl\b[\s\S]*?<\/dl>/g, "");
  assert.doesNotMatch(out, /<d[td]\b/, "no dt/dd outside a dl");
});
