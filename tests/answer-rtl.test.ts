import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// QA 2026-10-05: an Arabic answer ("عاصمة فرنسا هي باريس.") rendered left to right with its full stop on the wrong side.
// Static guard (the renderer imports CSS modules, which the unit runner cannot load).
test("answer blocks and the question bubble carry dir=auto so right-to-left text reads right to left", () => {
  const md = readFileSync("src/components/app-ui/Markdown.tsx", "utf8");
  for (const tag of ["Tag", "p", "ul", "li", "ol", "blockquote"]) {
    const opens = [...md.matchAll(new RegExp(`return <${tag} key=\\{k\\}[^>]*>|<li key=\\{j\\}[^>]*>`, "g"))].map((m) => m[0]).filter((m) => tag === "li" ? m.startsWith("<li") : !m.startsWith("<li"));
    assert.ok(opens.length > 0, `${tag} block found`);
    for (const o of opens) assert.match(o, /dir="auto"/, `${o} has dir=auto`);
  }
  const app = readFileSync("src/components/app-ui/KeplarApp.tsx", "utf8");
  assert.match(app, /<h2 className=\{s\.userMsg\} dir="auto">/); // the question bubble is its turn's h2 heading (tests/ux-claims.test.ts)
});
