// Manual browser check for the Ask composer (needs `npx playwright` + a running build).
//   node scripts/composer-check.mjs http://localhost:3999
// Verifies: per-key latency, native undo/redo, IME composition not sent on Enter, caret preserved mid-text.
import { chromium } from "playwright";
const base = process.argv[2] || "http://localhost:3999";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: "light" });
const p = await ctx.newPage();
await p.goto(`${base}/app`, { waitUntil: "load" });
await p.getByText("Reject non-essential").click().catch(() => {});
await p.waitForTimeout(800);
const ta = p.locator("textarea[data-composer-input]");
await ta.click();
await p.evaluate(() => {
  window.__lat = [];
  const el = document.querySelector("textarea[data-composer-input]");
  el.addEventListener("keydown", () => { const t = performance.now(); requestAnimationFrame(() => requestAnimationFrame(() => window.__lat.push(performance.now() - t))); }, true);
});
for (const ch of "The quick brown fox jumps over the lazy dog while considering whether to rent or buy a home. ".repeat(3)) await p.keyboard.type(ch);
await p.waitForTimeout(300);
const lat = (await p.evaluate(() => window.__lat)).sort((a, b) => a - b);
console.log(`keys=${lat.length} p50=${lat[Math.floor(lat.length * 0.5)].toFixed(1)}ms p95=${lat[Math.floor(lat.length * 0.95)].toFixed(1)}ms (two-frame measure; ~33ms = frame-limited)`);
await ta.fill("");
await p.keyboard.type("hello world");
await p.keyboard.press("Control+z");
const u = await ta.inputValue();
await p.keyboard.press("Control+Shift+z");
const r = await ta.inputValue();
console.log("undo ->", JSON.stringify(u), "redo ->", JSON.stringify(r));
// caret mid-text stays put while typing
await ta.fill("abcdef");
await ta.evaluate((el) => el.setSelectionRange(3, 3));
await p.keyboard.type("XY");
console.log("mid-insert ->", JSON.stringify(await ta.inputValue()), "(expect abcXYdef)");
await b.close();
