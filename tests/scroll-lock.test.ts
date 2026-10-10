import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lockScroll, scrollLockHolders } from "@/lib/ui/scroll-lock";

// Minimal <html> stand-in (the lock reads `document` at call time and only touches one attribute).
const attrs = new Set<string>();
(globalThis as unknown as { document: unknown }).document = {
  documentElement: { setAttribute: (k: string) => attrs.add(k), removeAttribute: (k: string) => attrs.delete(k) },
};

test("scroll lock: stays locked until the last overlay releases, in any order", () => {
  const a = lockScroll();
  const b = lockScroll();
  assert.ok(attrs.has("data-scroll-lock"));
  a();
  assert.ok(attrs.has("data-scroll-lock"), "B is still open");
  b();
  assert.ok(!attrs.has("data-scroll-lock"), "no leak after both close out of order");
  assert.equal(scrollLockHolders(), 0);
});

test("scroll lock: release is idempotent (double cleanup can't unlock someone else's overlay)", () => {
  const a = lockScroll();
  const b = lockScroll();
  a(); a(); a();
  assert.ok(attrs.has("data-scroll-lock"));
  b();
  assert.ok(!attrs.has("data-scroll-lock"));
});

test("overlays use the shared lock, not ad-hoc inline overflow writes", () => {
  for (const f of ["src/components/chrome/Nav.tsx", "src/components/nav/CommandPalette.tsx", "src/components/app-ui/Lightbox.tsx"]) {
    const s = readFileSync(f, "utf8");
    assert.match(s, /lockScroll\(\)/, f);
    assert.doesNotMatch(s, /documentElement\.style\.overflow/, f);
  }
  assert.match(readFileSync("src/styles/globals.css", "utf8"), /html\[data-scroll-lock\]\s*\{\s*overflow:\s*hidden/);
});
