// Signed-in tour against a LOCAL test server (dev outbox on): node scripts/launch-tour.mjs http://localhost:3470
// Signs up with a magic link, then visits every signed-in surface at desktop and phone width, reporting status,
// console errors, failed requests, placeholder/undefined text, horizontal scroll and visible "Not configured"/"Coming soon" labels.
import { chromium } from "playwright";
const BASE = process.argv[2] || "http://localhost:3470";
const email = `tour.${Date.now().toString(36)}@example.com`;
const BAD = [/lorem ipsum/i, /\bundefined\b/, /\[object Object\]/, /\bNaN\b/, /\bTODO\b/, /Not configured/i, /coming soon/i, /\bBETA\b/i];
const PAGES = ["/app", "/app/slides", "/app/study", "/account", "/welcome", "/checkout?plan=plus", "/checkout?plan=pro", "/checkout?plan=lite", "/pricing", "/feedback", "/download", "/inquire", "/admin"];
const b = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const out = [];
for (const [form, vp] of [["desktop", { width: 1280, height: 800 }], ["phone", { width: 390, height: 844 }]]) {
  const ctx = await b.newContext({ viewport: vp, extraHTTPHeaders: { "x-forwarded-for": `10.77.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
  const page = await ctx.newPage();
  await page.goto(BASE + "/signin?next=%2Fapp");
  await page.getByLabel(/email/i).first().fill(email.replace("tour.", `tour.${form}.`));
  await page.getByRole("button", { name: /email me a sign-in link/i }).click();
  let href;
  for (let i = 0; i < 20 && !href; i++) {
    await page.waitForTimeout(700);
    await page.goto(BASE + "/dev/outbox");
    const all = await page.locator("a[href*='/signin/verify']").evaluateAll((as) => as.map((a) => a.href));
    href = all[0];
  }
  if (!href) { console.log("FAIL: no magic link in outbox"); process.exit(1); }
  await page.goto(href);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL(/\/(app|welcome)/, { timeout: 30000 });
  console.log(form, "signed in ->", page.url());
  for (const p of PAGES) {
    const pg = await ctx.newPage();
    const errs = [];
    pg.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 140)); });
    pg.on("response", (r) => { if (r.status() >= 400 && r.url().startsWith(BASE)) errs.push(r.status() + " " + r.url().replace(BASE, "").slice(0, 80)); });
    const r = await pg.goto(BASE + p, { waitUntil: "load" }).catch((e) => ({ status: () => "ERR " + e }));
    await pg.waitForTimeout(1500);
    const d = await pg.evaluate(() => ({ t: document.body.innerText, hs: document.documentElement.scrollWidth > innerWidth + 2 })).catch(() => ({ t: "", hs: false }));
    const bad = BAD.map((re) => { const m = d.t.match(re); return m ? re.source + ": " + d.t.slice(Math.max(0, m.index - 30), m.index + 50).replace(/\s+/g, " ") : null; }).filter(Boolean);
    out.push({ form, p, status: r.status(), final: pg.url().replace(BASE, ""), errs: errs.slice(0, 4), bad, hs: d.hs });
    await pg.screenshot({ path: `/tmp/shots/tour-${form}-${p.replace(/[^a-z]/gi, "_")}.png` }).catch(() => {});
    await pg.close();
  }
  await ctx.close();
}
await b.close();
for (const o of out) console.log(o.form.padEnd(8), String(o.status).padEnd(4), o.p.padEnd(22), "->", o.final.padEnd(22), o.hs ? "HSCROLL " : "", JSON.stringify(o.errs), o.bad.length ? JSON.stringify(o.bad) : "");
