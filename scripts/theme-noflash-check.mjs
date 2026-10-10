import { chromium } from "playwright";
const b = await chromium.launch();
for (const [label, init] of [["first visit", null], ["stored light", "light"], ["stored auto (os light)", "auto"]]) {
  const ctx = await b.newContext({ colorScheme: "light" });
  if (init) await ctx.addInitScript((t) => localStorage.setItem("keplar-theme", t), init);
  const p = await ctx.newPage();
  // record the html theme + body background at every animation frame from document start
  await p.addInitScript(() => { window.__t = []; const f = () => { const r = document.documentElement; window.__t.push(r.dataset.theme + "|" + (document.body ? getComputedStyle(document.body).backgroundColor : "-")); requestAnimationFrame(f); }; requestAnimationFrame(f); });
  await p.goto("http://localhost:3999/pricing", { waitUntil: "load" });
  await p.waitForTimeout(600);
  const seq = [...new Set(await p.evaluate(() => window.__t))];
  console.log(label, JSON.stringify(seq));
  await ctx.close();
}
await b.close();
