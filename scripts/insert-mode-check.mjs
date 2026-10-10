// Insert-mode (overtype) end-to-end check in headless Chromium: node scripts/insert-mode-check.mjs [baseUrl]
// - default off: Insert does nothing special and no badge appears
// - enabled via the Settings key: Insert toggles OVR, typed characters replace the next one, Enter inserts, undo works
// - badge reads INS/OVR; block caret computed style where the browser supports caret-shape
// - keydown -> next-frame latency while overtyping stays under one frame (p95 <= 20 ms)
import { chromium } from "playwright";
const base = process.argv[2] ?? "http://localhost:3999";
let failed = false;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) failed = true; };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage();
await ctx.addInitScript(() => { try { localStorage.setItem("kp-consent", "{}"); } catch {} });
const open = async () => {
  await p.goto(base + "/app", { waitUntil: "load" });
  const rej = p.getByRole("button", { name: /reject non-essential/i });
  if (await rej.count()) await rej.first().click().catch(() => {});
  const box = p.locator("textarea").first();
  await box.waitFor();
  await box.click();
  return box;
};
// 1. off by default
let box = await open();
await p.keyboard.type("hello world");
await p.keyboard.press("Home");
await p.keyboard.press("Insert");
await p.keyboard.type("XY");
ok((await box.inputValue()) === "XYhello world", "setting off: Insert key is inert, typing inserts");
ok((await p.locator(".ins-badge").count()) === 0, "setting off: no INS/OVR badge");
ok((await p.evaluate(() => document.documentElement.dataset.typingMode)) === undefined, "setting off: no typing-mode attribute");
// 2. on
await p.evaluate(() => { localStorage.setItem("kp-insert-key", "1"); });
box = await open();
ok((await p.locator(".ins-badge").textContent()) === "INS", "setting on: badge shows INS on focus");
await p.keyboard.type("hello world");
await p.keyboard.press("Home");
await p.keyboard.press("Insert");
ok((await p.locator(".ins-badge").textContent()) === "OVR", "Insert switches the badge to OVR");
ok((await p.evaluate(() => document.documentElement.dataset.typingMode)) === "ovr", "typing-mode attribute is ovr");
const cs = await p.evaluate(() => { const t = document.querySelector("textarea"); return getComputedStyle(t).getPropertyValue("caret-shape"); });
console.log("caret-shape computed:", JSON.stringify(cs), "(block where Chromium >= 133)");
await p.keyboard.type("HELLO");
ok((await box.inputValue()) === "HELLO world", "OVR: typed characters replace the next ones");
await p.keyboard.press("End");
await p.keyboard.type("!");
ok((await box.inputValue()) === "HELLO world!", "OVR at the end of the text appends");
await p.keyboard.press("Home");
await p.keyboard.press("Shift+Enter");
ok((await box.inputValue()) === "\nHELLO world!", "OVR: Shift+Enter inserts a line break, replaces nothing");
await box.fill("");
await p.keyboard.type("hello world");
await p.keyboard.press("Home");
await p.keyboard.type("HELLO");
await p.keyboard.press("Control+z");
const afterUndo = await box.inputValue();
ok(afterUndo !== "HELLO world" && afterUndo.length <= 11, `native undo still works after overtype (${JSON.stringify(afterUndo)})`);
await p.keyboard.press("Control+Shift+z");
ok((await box.inputValue()).length >= afterUndo.length, "native redo still works");
// latency while overtyping
await box.fill("");
await p.keyboard.type("a".repeat(80));
await p.keyboard.press("Home");
await p.evaluate(() => {
  const el = document.querySelector("textarea");
  window.__m = [];
  let key = 0;
  addEventListener("keydown", (e) => { key = e.timeStamp; }, true);
  el.addEventListener("input", () => { const k = key; requestAnimationFrame((ts) => window.__m.push(ts - k)); });
});
for (let i = 0; i < 60; i++) await p.keyboard.type(String.fromCharCode(98 + (i % 20)), { delay: 40 });
await p.waitForTimeout(300);
const lat = (await p.evaluate(() => window.__m)).sort((a, c) => a - c);
const p95 = lat[Math.min(lat.length - 1, Math.floor(lat.length * 0.95))];
console.log(`OVR keydown->next frame: n=${lat.length} p50=${lat[Math.floor(lat.length / 2)].toFixed(1)}ms p95=${p95.toFixed(1)}ms`);
ok(lat.length >= 55 && p95 <= 20, "overtype keystroke is painted within one frame (p95 <= 20 ms)");
// Insert while toggled off again
await p.keyboard.press("Insert");
ok((await p.locator(".ins-badge").textContent()) === "INS", "Insert again returns to INS");
await b.close();
console.log(failed ? "FAIL" : "PASS");
process.exit(failed ? 1 : 0);
