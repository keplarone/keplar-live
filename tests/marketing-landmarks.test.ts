import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// The (marketing) layout renders <main id="main">. A page inside it that renders its own <main> nests two main
// landmarks with a duplicate id (axe: landmark-no-duplicate-main, landmark-main-is-top-level), as /simulation did.
const root = join(process.cwd(), "src/app/(marketing)");
function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return pages(p);
    return /\.(tsx|jsx)$/.test(n) && n !== "layout.tsx" ? [p] : [];
  });
}

test("marketing layout owns the only <main>", () => {
  assert.match(readFileSync(join(root, "layout.tsx"), "utf8"), /<main id="main"/);
  const offenders = pages(root).filter((p) => /<main[\s>]/.test(readFileSync(p, "utf8")));
  assert.deepEqual(offenders.map((p) => p.slice(root.length + 1)), []);
});
