import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// QA 2026-10-05 14:20: at 320px the answer card's "Reasoning summary" label was overlapped by its preview text
// ("I asked 2 models (Nem…"): the meta had max-width 40vw (128px) in a 1fr column that was narrower, and with
// justify-self: end it spilled left over the title.
test("answer sections: the meta preview stays inside its grid column", () => {
  const css = readFileSync(new URL("../src/components/app-ui/KeplarTurn.module.css", import.meta.url), "utf8");
  const btn = css.match(/\.sectionBtn\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(btn, /grid-template-columns:\s*auto\s+minmax\(0,\s*1fr\)\s+16px/);
  const metas = [...css.matchAll(/\.sectionMeta\s*\{([^}]*)\}/g)].map((m) => m[1]);
  assert.ok(metas.length >= 2);
  assert.match(metas[0], /max-width:\s*100%/);
  for (const m of metas.slice(1)) {
    const mw = m.match(/max-width:\s*([^;]+);/)?.[1] ?? "";
    if (mw) assert.match(mw, /100%/, `phone max-width must be capped by the column: ${mw}`);
  }
});
