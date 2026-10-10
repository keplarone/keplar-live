// No element chases the pointer: move the mouse across the page and check every fixed / absolutely positioned element stays put
// (the 3D canvas parallax is a camera move inside a fixed canvas, not an element). Also checks the smooth caret exists and tracks typing.
import { chromium } from "playwright";
const base = process.argv.slice(2).find((x) => x.startsWith("http")) || "http://localhost:3482";
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => { try { localStorage.setItem("keplar_consent", encodeURIComponent(JSON.stringify({ version: "v1-analytics", at: Date.now(), choices: { analytics: false } }))); } catch {} });
const p = await ctx.newPage();
let bad = 0;
for (const r of ["/", "/pricing", "/about", "/models", "/help", "/signin"]) {
  await p.goto(base + r, { waitUntil: "load" }); await p.waitForTimeout(1500);
  const snap = () => p.evaluate(() => [...document.querySelectorAll("body *")].filter((e) => { const cs = getComputedStyle(e); return (cs.position === "fixed" || cs.position === "absolute") && e.tagName !== "CANVAS" && !e.closest("canvas"); }).map((e) => { const b = e.getBoundingClientRect(); return [e.tagName + "." + String(e.className).slice(0, 30), Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; }));
  await p.mouse.move(100, 100); await p.waitForTimeout(300);
  const a = await snap();
  for (const [x, y] of [[1200, 200], [700, 700], [300, 500], [1300, 800]]) { await p.mouse.move(x, y, { steps: 8 }); await p.waitForTimeout(250); }
  const c = await snap();
  const moved = a.map((v, i) => (c[i] && (Math.abs(v[1] - c[i][1]) > 3 || Math.abs(v[2] - c[i][2]) > 3) ? `${v[0]} ${v[1]},${v[2]}->${c[i][1]},${c[i][2]}` : null)).filter(Boolean);
  if (a.length !== c.length || moved.length) { bad++; console.log("FAIL", r, a.length, c.length, moved.slice(0, 5)); } else console.log("ok  ", r, a.length, "positioned elements stay put");
}
// smooth caret
await p.goto(base + "/", { waitUntil: "load" }); await p.waitForTimeout(1500);
await p.click("#hero-q");
const caret0 = await p.evaluate(() => { const c = document.querySelector(".smooth-caret"); return c ? { vis: getComputedStyle(c).visibility, t: c.style.transform } : null; });
await p.keyboard.type("hello world", { delay: 25 }); await p.waitForTimeout(200);
const caret1 = await p.evaluate(() => { const c = document.querySelector(".smooth-caret"); return c ? { vis: getComputedStyle(c).visibility, t: c.style.transform } : null; });
console.log("smooth caret", JSON.stringify(caret0), "->", JSON.stringify(caret1));
if (!caret1 || caret1.vis !== "visible" || caret0?.t === caret1.t) { bad++; console.log("FAIL smooth caret did not move with typing"); }
await b.close();
console.log(bad ? bad + " failures" : "all ok");
