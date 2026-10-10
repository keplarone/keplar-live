// "Try Keplar" -> "Open Keplar" when signed in: node scripts/cta-e2e.mjs [baseUrl]   (signed-in part needs the local e2e server: /dev/outbox)
import { chromium } from "playwright";
const base = process.argv.slice(2).find((a) => !a.startsWith("--")) || "http://localhost:3470";
const b = await chromium.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
let bad = 0;
const ok = (c, m) => { console.log(c ? "ok  " : "FAIL", m); if (!c) bad++; };
const PAGES = ["/", "/pricing", "/about", "/download", "/how-it-works", "/guides", "/vs/chatgpt"];
const VPS = [[1366, 768, 1], [390, 844, 2], [320, 640, 1]];
const labels = (p) => p.evaluate(() => [...document.querySelectorAll("a,button")].filter((e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && /^(Try (Keplar|it)|Open Keplar)/.test(e.innerText.trim()) && !(e.getAttribute("href") || "").startsWith("#"); })
  .map((e) => { const r = e.getBoundingClientRect(); const t = [...e.querySelectorAll("span")].find((s) => s.getBoundingClientRect().width > 0 && s.children.length === 0) || e; const tr = document.createRange(); tr.selectNodeContents(e); const q = tr.getBoundingClientRect(); return { text: e.innerText.trim().replace(/\s+/g, " "), href: e.getAttribute("href"), fits: q.right <= r.right + 1.5 && q.left >= r.left - 1.5 }; }));

// signed out
for (const [w, h, dpr] of VPS) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: w < 500 });
  for (const path of PAGES) {
    const p = await ctx.newPage();
    await p.goto(base + path, { waitUntil: "load" }); await p.waitForTimeout(900);
    const l = await labels(p);
    ok(l.every((x) => x.text.startsWith("Try ")) && l.length > 0, `signed out ${w}px ${path}: CTA reads "Try Keplar" (${l.map((x) => x.text).join(" | ")})`);
    ok(l.every((x) => x.fits), `signed out ${w}px ${path}: CTA text fits its button`);
    await p.close();
  }
  await ctx.close();
}
// signed in (local server only)
const outbox = await fetch(base + "/dev/outbox").then((r) => r.status).catch(() => 0);
if (outbox !== 200) console.log(`skip signed-in CTA checks (no /dev/outbox on ${base})`);
else {
  const stamp = Date.now() % 1e6; let n = 0;
  for (const [w, h, dpr] of VPS) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: w < 500 });
    const hh = { "content-type": "application/json", origin: base, "x-forwarded-for": `10.6.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` };
    await ctx.request.post(base + "/api/auth/sign-in/magic-link", { headers: hh, data: { email: `cta${stamp}x${n++}@example.com`, callbackURL: "/app" } });
    const html = await (await ctx.request.get(base + "/dev/outbox")).text();
    const link = [...html.matchAll(/href="(http[^"]*token=[^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"))[0];
    await ctx.request.post(base + "/api/auth/magic-link/confirm", { headers: hh, data: { token: new URL(link).searchParams.get("token") } });
    await ctx.request.post(base + "/api/onboarding", { headers: { "content-type": "application/json", origin: base }, data: { action: "complete", answers: { name: "Alex" } } });
    // first visit: the hint is not stored yet, so the label corrects itself after the session check
    const first = await ctx.newPage();
    await first.goto(base + "/pricing", { waitUntil: "load" }); await first.waitForFunction(() => document.documentElement.getAttribute("data-signed") === "1", null, { timeout: 8000 }).catch(() => {});
    ok(await first.evaluate(() => localStorage.getItem("keplar-signed")) === "1", `signed in ${w}px: session state remembered for the next page`);
    await first.close();
    for (const path of PAGES) {
      const p = await ctx.newPage();
      // returning visit: data-signed is already on <html> when the document is parsed (no flash of the wrong label)
      let early = null;
      await p.addInitScript(() => { document.addEventListener("DOMContentLoaded", () => { window.__early = document.documentElement.getAttribute("data-signed"); }); });
      await p.goto(base + path, { waitUntil: "load" }); await p.waitForTimeout(900);
      early = await p.evaluate(() => window.__early);
      const l = await labels(p);
      ok(early === "1", `signed in ${w}px ${path}: label is right before first paint`);
      ok(l.length > 0 && l.every((x) => x.text.startsWith("Open Keplar") && x.href === "/app"), `signed in ${w}px ${path}: CTA reads "Open Keplar" and links to /app (${l.map((x) => x.text).join(" | ")})`);
      ok(l.every((x) => x.fits), `signed in ${w}px ${path}: CTA text fits its button`);
      await p.close();
    }
    await ctx.close();
  }
}
console.log(bad ? `\n${bad} FAIL` : "\nall ok");
await b.close();
process.exit(bad ? 1 : 0);
