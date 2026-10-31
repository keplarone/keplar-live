import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Owner bug 2026-10-31: keplar.one runs Next.js 16.4, whose production build MINIFIES CSS-module class names ("QDraMW_sideWrap",
// not "App-module__hash__sideWrap"). Global stylesheets that found module elements by readable name substrings
// ([class*="App-module"], [class$="__sideWrap"], [class*="__composer"]) matched them in `next dev` but nothing in production, so
// the Keplar Orbit app shell lost its grid and the home composer rendered squeezed into the left column. Next 16.4 has no option
// to keep readable names. Hook module elements with a data attribute instead (data-o="<Module> <class>", targeted as
// [data-o~="sideWrap"]); see src/styles/orbit/app.css.
const HOOK = /\[class[*$^]="[^"]*(-module|__)/;

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return cssFiles(p);
    return e.name.endsWith(".css") ? [p] : [];
  });
}

test("no stylesheet targets CSS-module class names by their readable dev-mode form (Next 16.4 minifies them)", () => {
  const files = cssFiles("src");
  assert.ok(files.length > 50, "found the stylesheets");
  const bad: string[] = [];
  for (const f of files) {
    const lines = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " ")).split("\n");
    lines.forEach((line, i) => {
      if (HOOK.test(line)) bad.push(`${f}:${i + 1}: ${line.trim().slice(0, 160)}`);
    });
  }
  assert.deepEqual(
    bad,
    [],
    `These selectors find CSS-module elements by "-module" or "__name" in the class attribute. Next 16.4's production build minifies ` +
      `CSS-module class names (e.g. "QDraMW_sideWrap"), so they match in next dev but NOTHING on keplar.one. Put a data-o token on the ` +
      `element (data-o="App sideWrap") and select [data-o~="sideWrap"] instead:\n${bad.join("\n")}`,
  );
});
