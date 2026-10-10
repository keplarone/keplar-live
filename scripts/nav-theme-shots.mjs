// Nav theme audit: screenshots of the top nav in Light / Dark / Auto (OS light + OS dark), 1440 + 390, signed-out + signed-in,
// across the marketing routes, plus axe color-contrast on the nav (default, hover, focus, open menu, mobile sheet).
// Usage: node scripts/nav-theme-shots.mjs [outDir] [baseUrl]      env: ROUTES=/,/pricing  THEMES=dark,light  VP=desktop|mobile  QUICK=1
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const axeSrc = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const out = process.argv[2] ?? "/workspace/shots/nav-theme";
const base = process.argv[3] ?? "http://localhost:3411";
mkdirSync(out, { recursive: true });

const routes = (process.env.ROUTES?.split(",") ?? ["/", "/pricing", "/download", "/about", "/privacy", "/terms", "/product", "/security", "/account", "/signin", "/how-it-works", "/keplar-one", "/enterprise", "/blogs", "/help", "/does-not-exist"]);
// [label, stored pref, OS scheme]
const modes = [
  ["dark", "dark", "dark"],
  ["light", "light", "light"],
  ["auto-os-dark", "auto", "dark"],
  ["auto-os-light", "auto", "light"],
].filter(([l]) => !process.env.THEMES || process.env.THEMES.split(",").includes(l));
const viewports = [["1440", { width: 1440, height: 900 }, false], ["390", { width: 390, height: 844 }, true]].filter(([n]) => !process.env.VP || process.env.VP === n);
const slug = (r) => (r === "/" ? "home" : r.replace(/^\//, "").replace(/\//g, "_"));

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const report = [];
let bad = 0;

// worst-case backdrops: pure white and pure black right behind the (translucent) nav, whatever the page really has there
async function axeBackdrops(page, tag) {
  for (const [name, col] of [["onwhite", "#fff"], ["onblack", "#000"]]) {
    await page.evaluate((c) => { const d = document.createElement("div"); d.id = "__bd"; d.style.cssText = `position:fixed;inset:0;z-index:99;background:${c}`; document.body.appendChild(d); }, col);
    await axeNav(page, `${tag}__${name}`);
    await page.evaluate(() => document.getElementById("__bd")?.remove());
  }
}

async function axeNav(page, tag) {
  await page.addScriptTag({ content: axeSrc }).catch(() => {});
  // axe cannot read a color through ::before sheens or gradient fills ("incomplete"), so for the check only: drop the sheen pseudo
  // elements and use the button's solid token instead of its gradient (tests/nav-theme.test.ts covers the gradient stops + sheen with math).
  await page.evaluate(() => {
    if (document.getElementById("__axefix")) return;
    const st = document.createElement("style"); st.id = "__axefix";
    st.textContent = "header *::before, header *::after { display: none !important } header a[class*=cta] { background: var(--nav-cta-solid) !important } header *, header { transition: none !important; animation: none !important }";
    document.head.appendChild(st);
  });
  await page.waitForTimeout(120);
  const res = await page.evaluate(async () => {
    const r = await axe.run({ include: [["header[data-keplar-drag]"]] }, { runOnly: { type: "rule", values: ["color-contrast"] }, resultTypes: ["violations", "incomplete"] });
    const pick = (a) => a.flatMap((v) => v.nodes.map((n) => ({ target: n.target.join(" "), msg: (n.any[0]?.message || "").slice(0, 160) })));
    return { violations: pick(r.violations), incomplete: pick(r.incomplete) };
  });
  // only the worst-case-backdrop passes (a solid white / black layer right behind the nav) can be fully verified by axe; the rest report violations only
  res.unverified = /__on(white|black)$/.test(tag) ? res.incomplete.filter((i) => !/only non-text/.test(i.msg)) : [];
  report.push({ tag, ...res });
  if (res.unverified.length) { bad += res.unverified.length; console.log("AXE UNVERIFIED", tag, JSON.stringify(res.unverified.slice(0, 3))); }
  if (res.violations.length) { bad += res.violations.length; console.log("AXE FAIL", tag, JSON.stringify(res.violations)); }
  return res;
}

for (const [vpName, viewport, mobile] of viewports) {
  for (const [mode, pref, os] of modes) {
    for (const signed of [false, true]) {
      const ctx = await browser.newContext({ viewport, deviceScaleFactor: mobile ? 2 : 1, hasTouch: mobile, isMobile: mobile, colorScheme: os });
      await ctx.addInitScript(([p, s]) => { try { localStorage.setItem("keplar-theme", p); if (s) localStorage.setItem("keplar-signed", "1"); } catch {} }, [pref, signed]);
      if (signed) await ctx.route("**/api/compute", (r) => r.fulfill({ json: { plan: "plus", signedIn: true, admin: false, checkout: true, liteCheckout: false } }));
      const page = await ctx.newPage();
      for (const route of routes) {
        if (signed && process.env.QUICK && !["/", "/pricing", "/download", "/about", "/privacy", "/terms"].includes(route)) continue;
        const name = `${slug(route)}__${mode}__${vpName}${signed ? "__signed" : ""}`;
        // first paint check: the theme the script resolved must already be on <html> at DOMContentLoaded
        await page.goto(base + route, { waitUntil: "domcontentloaded" });
        const early = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
        const want = pref === "auto" ? os : pref;
        if (early !== want) { bad++; console.log("THEME FLASH", name, early, "!=", want); }
        await page.waitForLoadState("networkidle").catch(() => {});
        await page.waitForTimeout(700);
        await page.mouse.move(2, 400);
        await page.screenshot({ path: `${out}/${name}.png`, clip: { x: 0, y: 0, width: viewport.width, height: 150 } });
        await axeNav(page, name);
        await axeBackdrops(page, name);
        // a scrolled state over page content
        await page.evaluate(() => window.scrollTo(0, 900)); await page.waitForTimeout(400);
        await page.screenshot({ path: `${out}/${name}__scrolled.png`, clip: { x: 0, y: 0, width: viewport.width, height: 150 } });
        await axeNav(page, name + "__scrolled");
        await axeBackdrops(page, name + "__scrolled");
        await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(200);
        if (route === "/" || route === "/pricing") {
          if (!mobile) {
            const link = page.locator('header nav a[href="/pricing"]').first();
            await link.hover(); await page.waitForTimeout(300);
            await page.screenshot({ path: `${out}/${name}__hover.png`, clip: { x: 0, y: 0, width: viewport.width, height: 150 } });
            await axeNav(page, name + "__hover");
            await page.mouse.move(2, 400);
            await page.keyboard.press("Tab"); await page.keyboard.press("Tab"); await page.keyboard.press("Tab"); await page.waitForTimeout(250);
            await page.screenshot({ path: `${out}/${name}__focus.png`, clip: { x: 0, y: 0, width: viewport.width, height: 150 } });
            await page.locator("header nav button[aria-controls=menu-product]").click(); await page.waitForTimeout(450);
            await page.screenshot({ path: `${out}/${name}__menu.png`, clip: { x: 0, y: 0, width: viewport.width, height: 380 } });
            await axeNav(page, name + "__menu");
          } else {
            await page.locator("header button[aria-controls=mobile-menu]").click(); await page.waitForTimeout(800);
            await page.screenshot({ path: `${out}/${name}__sheet.png` });
            await axeNav(page, name + "__sheet");
          }
        }
      }
      await ctx.close();
    }
  }
}
// Auto follows the OS live: flip the emulated scheme with the preference on "auto" and check the nav repaints with the new theme's tokens.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
  await ctx.addInitScript(() => { try { localStorage.setItem("keplar-theme", "auto"); } catch {} });
  const page = await ctx.newPage();
  await page.goto(base + "/pricing", { waitUntil: "networkidle" });
  const probe = () => page.evaluate(() => ({ theme: document.documentElement.dataset.theme, brand: getComputedStyle(document.querySelector("header nav a[aria-label$=home]")).color, fill: getComputedStyle(document.querySelector("header nav")).backgroundColor }));
  const a = await probe();
  await page.emulateMedia({ colorScheme: "light" }); await page.waitForTimeout(600);
  const b = await probe();
  console.log("auto live flip", JSON.stringify({ a, b }));
  if (a.theme !== "dark" || b.theme !== "light" || a.brand === b.brand || a.fill === b.fill) { bad++; console.log("AUTO LIVE FLIP FAILED"); }
  await page.screenshot({ path: `${out}/pricing__auto-live-flip-to-light__1440.png`, clip: { x: 0, y: 0, width: 1440, height: 150 } });
  await ctx.close();
}
await browser.close();
writeFileSync(`${out}/axe-report.json`, JSON.stringify(report, null, 1));
console.log(`done: ${report.length} axe passes, ${bad} problems`);
process.exit(bad ? 1 : 0);
