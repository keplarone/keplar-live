import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// QA 2026-10-05: an Arabic answer ("عاصمة فرنسا هي باريس.") rendered left to right with its full stop on the wrong side.
// Static guard (the renderer imports CSS modules, which the unit runner cannot load).
test("answer blocks and the question bubble carry dir=auto so right-to-left text reads right to left", () => {
  const md = readFileSync("src/components/app-ui/Markdown.tsx", "utf8");
  // "List" is a list block's ul/ol element and "Sub" its nested list.
  for (const tag of ["Tag", "p", "List", "Sub", "li", "blockquote"]) {
    const pattern = tag === "li" ? /<li key=\{[jn]\}[^>]*>/g : tag === "Sub" ? /<Sub className[^>]*>/g : new RegExp(`<${tag} key=\\{k\\}[^>]*>`, "g");
    const opens = [...md.matchAll(pattern)].map((m) => m[0]);
    assert.ok(opens.length > 0, `${tag} block found`);
    for (const o of opens) assert.match(o, /dir="auto"/, `${o} has dir=auto`);
  }
  const app = readFileSync("src/components/app-ui/KeplarApp.tsx", "utf8");
  assert.match(app, /<h2 className=\{s\.userMsg\} data-o="App userMsg" dir="auto">/); // the question bubble is its turn's h2 heading (tests/ux-claims.test.ts)
});
