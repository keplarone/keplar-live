// Every route renders: status < 400 (404 only for the bogus one), an h1 or main, no page errors, no sideways scroll. node scripts/route-smoke.mjs [base] [--shots=dir]
import { chromium } from "playwright";
import fs from "node:fs";
const args = process.argv.slice(2);
const base = args.find((a) => a.startsWith("http")) || "http://localhost:3482";
const shots = (args.find((a) => a.startsWith("--shots=")) || "").slice(8);
if (shots) fs.mkdirSync(shots, { recursive: true });
const ROUTES = ["/", "/about", "/product", "/pricing", "/how-it-works", "/keplar-one", "/models", "/download", "/compare", "/compare-ai-models", "/multi-model-ai", "/ai-answer-engine", "/chatgpt-alternative", "/for-you", "/for-students", "/for-developers", "/use-cases", "/guides", "/glossary", "/blogs", "/docs", "/enterprise", "/agents", "/prompts", "/vs", "/privacy", "/terms", "/status", "/signin", "/signup", "/forgot-password", "/feedback", "/inquire", "/welcome", "/account", "/checkout", "/simulation", "/superintelligence", "/si-vs-ai", "/app", "/app/slides", "/app/study", "/app/create", "/admin", "/does-not-exist-404"];
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
let bad = 0;
for (const [n, vp] of [["d", { width: 1280, height: 800 }], ["m", { width: 390, height: 844 }]]) {
  const ctx = await b.newContext({ viewport: vp, hasTouch: n === "m", isMobile: n === "m" });
  await ctx.addInitScript(() => { try { localStorage.setItem("keplar_consent", encodeURIComponent(JSON.stringify({ version: "v1-analytics", at: Date.now(), choices: { analytics: false } }))); } catch {} });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
  for (const r of ROUTES) {
    errs.length = 0;
    let res; try { res = await p.goto(base + r, { waitUntil: "load", timeout: 60000 }); } catch (e) { bad++; console.log("FAIL", n, r, "goto", String(e).slice(0, 80)); continue; }
    await p.waitForTimeout(r === "/" ? 3000 : 700);
    const info = await p.evaluate(() => ({ h1: !!document.querySelector("h1"), main: !!document.querySelector("main"), hs: document.documentElement.scrollWidth > innerWidth + 1, canvas: document.querySelectorAll("canvas").length, len: document.body.innerText.length }));
    const st = res ? res.status() : 0;
    const expect404 = r === "/admin" || r.includes("404");
    const okStatus = expect404 ? st === 404 : st < 400;
    const fails = [];
    if (!okStatus) fails.push("status " + st);
    if (!expect404 && !info.main && !info.h1) fails.push("no main/h1");
    if (!expect404 && info.len < 40) fails.push("empty page");
    if (info.hs) fails.push("sideways scroll");
    if (errs.length) fails.push("errors " + errs.join(";"));
    if (shots && (r === "/" || n === "d") && ["/", "/about", "/pricing", "/app", "/app/create", "/does-not-exist-404"].includes(r)) await p.screenshot({ path: `${shots}/${n}-${r === "/" ? "home" : r.slice(1).replace(/\//g, "_")}.png`, timeout: 90000 }).catch((e) => console.log("shot skipped", r, String(e).slice(0, 50)));
    if (fails.length) { bad++; console.log("FAIL", n, r, fails.join(" | ")); }
  }
  await ctx.close();
}
await b.close();
console.log(bad ? `${bad} failures` : `all ${ROUTES.length * 2} route loads ok`);
process.exit(bad ? 1 : 0);
