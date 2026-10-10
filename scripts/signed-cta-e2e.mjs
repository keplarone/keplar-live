// Signed in (last-known-session hint): every visible call to action says "Open Keplar", never "Try Keplar". node scripts/signed-cta-e2e.mjs [base]
import { chromium } from "playwright";
const base = process.argv.slice(2).find((x) => x.startsWith("http")) || "http://localhost:3482";
const KEY = process.env.SIGNED_KEY || "keplar-signed";
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
let bad = 0;
for (const signed of [false, true]) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(([k, on]) => { try { localStorage.setItem("keplar_consent", encodeURIComponent(JSON.stringify({ version: "v1-analytics", at: Date.now(), choices: { analytics: false } }))); if (on) localStorage.setItem(k, "1"); } catch {} }, [KEY, signed]);
  const p = await ctx.newPage();
  // the nav asks /api/compute who is signed in: answer as a signed-in Plus user (or as signed out)
  await p.route("**/api/compute", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(signed ? { plan: "plus", signedIn: true, admin: false, checkout: true } : { plan: "free", signedIn: false, checkout: true }) }));
  for (const r of ["/", "/pricing", "/about", "/product", "/how-it-works", "/models", "/download", "/help"]) {
    await p.goto(base + r, { waitUntil: "load" }); await p.waitForTimeout(r === "/" ? 2500 : 1200);
    const t = await p.evaluate(() => {
      const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"; };
      const texts = [...document.querySelectorAll("a,button")].filter(vis).map((e) => e.innerText.trim()).filter(Boolean);
      return { tryN: texts.filter((x) => /^try keplar/i.test(x)).length, openN: texts.filter((x) => /^open keplar/i.test(x)).length, signed: document.documentElement.getAttribute("data-signed") };
    });
    const ok = signed ? t.tryN === 0 && t.openN > 0 : t.openN === 0 && t.tryN > 0;
    if (!ok) bad++;
    console.log(ok ? "ok  " : "FAIL", signed ? "signed-in " : "signed-out", r, JSON.stringify(t));
  }
  await ctx.close();
}
await b.close();
console.log(bad ? bad + " failures" : "all ok");
