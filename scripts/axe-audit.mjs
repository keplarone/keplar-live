#!/usr/bin/env node
// axe-core (WCAG 2.0/2.1/2.2 A+AA) + heading/alt/label checks on key routes, dark and light.
//   node scripts/axe-audit.mjs <baseUrl> [--routes=/,/pricing] [--json=out.json] [--mobile]
// Prints per-route counts by impact and a total; exits 0 (it records, the e2e gate enforces serious/critical).
import fs from "node:fs";
import { createRequire } from "node:module";
import { chromium, devices } from "playwright";
const require = createRequire(import.meta.url);
const axeSource = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const a = process.argv.slice(2);
const base = (a.find((x) => !x.startsWith("--")) || "http://localhost:3000").replace(/\/$/, "");
const opt = (k, d) => (a.find((x) => x.startsWith(`--${k}=`)) || "").split("=").slice(1).join("=") || d;
const routes = opt("routes", "/,/pricing,/product,/download,/docs,/developers,/changelog,/showcase,/templates,/enterprise,/signin,/signup,/help,/security,/privacy,/terms,/about,/status,/app/ask,/app/create").split(",");
const themes = opt("themes", "dark,light").split(",");
const exe = fs.existsSync("/usr/bin/google-chrome") ? "/usr/bin/google-chrome" : undefined;
const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
const out = [];
for (const theme of themes) {
  for (const r of routes) {
    const ctx = await browser.newContext(a.includes("--mobile") ? { ...devices["Pixel 7"], colorScheme: theme, reducedMotion: "reduce" } : { viewport: { width: 1366, height: 900 }, colorScheme: theme, reducedMotion: "reduce" });
    await ctx.addCookies([{ name: "keplar-theme", value: theme, url: base }, { name: "keplar_consent", value: "1", url: base }]).catch(() => {});
    const page = await ctx.newPage();
    let status = 0;
    try {
      const res = await page.goto(base + r, { waitUntil: "domcontentloaded", timeout: 45_000 });
      status = res?.status() ?? 0;
      await page.evaluate((t) => { document.documentElement.setAttribute("data-theme", t); document.documentElement.classList.toggle("dark", t === "dark"); }, theme);
      await page.waitForTimeout(1500);
      await page.addScriptTag({ content: axeSource });
      const res2 = await page.evaluate(async () => {
        const r = await globalThis.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] }, resultTypes: ["violations"] });
        const hs = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter((h) => h.getClientRects().length).map((h) => +h.tagName[1]);
        let skips = 0;
        for (let i = 1; i < hs.length; i++) if (hs[i] > hs[i - 1] + 1) skips++;
        const noAlt = [...document.images].filter((i) => !i.hasAttribute("alt")).length;
        return {
          violations: r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, help: v.help, where: v.nodes.slice(0, 3).map((n) => n.target.join(" ")) })),
          h1: hs.filter((h) => h === 1).length,
          headingSkips: skips,
          imgNoAlt: noAlt,
        };
      });
      out.push({ route: r, theme, status, ...res2 });
    } catch (e) {
      out.push({ route: r, theme, status, error: String(e).slice(0, 200) });
    }
    await ctx.close();
  }
}
await browser.close();
const tally = { critical: 0, serious: 0, moderate: 0, minor: 0 };
for (const row of out) {
  const by = {};
  for (const v of row.violations ?? []) { by[v.impact] = (by[v.impact] || 0) + v.n; tally[v.impact] = (tally[v.impact] || 0) + v.n; }
  const ids = (row.violations ?? []).map((v) => `${v.id}(${v.impact}×${v.n})`).join(", ");
  console.log(`${row.theme.padEnd(5)} ${row.route.padEnd(14)} ${String(row.status).padEnd(4)} h1=${row.h1 ?? "?"} skips=${row.headingSkips ?? "?"} noAlt=${row.imgNoAlt ?? "?"} ${row.error ? "ERROR " + row.error : ids || "clean"}`);
}
const rules = {};
for (const row of out) for (const v of row.violations ?? []) rules[v.id] = (rules[v.id] || 0) + v.n;
console.log("\nTOTAL nodes by impact:", JSON.stringify(tally), "\nby rule:", JSON.stringify(rules));
const jf = opt("json", "");
if (jf) fs.writeFileSync(jf, JSON.stringify({ base, at: new Date().toISOString(), tally, rules, rows: out }, null, 2));
