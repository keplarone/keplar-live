// Ask start page spacing shots: node scripts/app-space-shots.mjs <base> <outDir>
import { chromium } from "playwright";
import fs from "node:fs";
const base = process.argv[2], out = process.argv[3]; fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
for (const theme of ["dark", "light"]) for (const [n, vp] of [["d", { width: 1440, height: 900 }], ["m", { width: 390, height: 844 }]]) {
  const ctx = await b.newContext({ viewport: vp, hasTouch: n === "m", isMobile: n === "m" });
  await ctx.addInitScript((t) => { try { localStorage.setItem("keplar-theme", t); localStorage.setItem("keplar_consent", encodeURIComponent(JSON.stringify({ version: "v1-analytics", at: Date.now(), choices: { analytics: false } }))); } catch {} }, theme);
  const p = await ctx.newPage();
  await p.goto(base + "/app", { waitUntil: "load" });
  await p.waitForTimeout(3500);
  const r = await p.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const rows = [...document.querySelectorAll('[data-testid="home-faq"] li button, ul[aria-label="Example questions"] li button')];
    const clipped = rows.filter((e) => e.scrollWidth > e.clientWidth + 1).length;
    const gaps = rows.map((e) => Math.round(e.getBoundingClientRect().height));
    return { faq: !!q('[data-testid="home-faq"]'), rows: rows.length, clipped, heights: gaps.join(","), hs: document.documentElement.scrollWidth > innerWidth + 1 };
  });
  console.log(theme, n, JSON.stringify(r));
  const sc = await p.$('[data-testid="home-faq"]');
  if (sc) await sc.scrollIntoViewIfNeeded();
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}/${n}-${theme}.png` });
  await p.evaluate(() => { const e = document.querySelector('ul[aria-label="Example questions"]'); e && e.scrollIntoView({ block: "center" }); });
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}/${n}-${theme}-examples.png` });
  await ctx.close();
}
await b.close();
