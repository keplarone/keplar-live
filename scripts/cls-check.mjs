// Layout shift on the home: static (default CPU GL) and WebGL (?fq=low), desktop + mobile, 4x CPU slowdown too. node scripts/cls-check.mjs [base]
import { chromium } from "playwright";
const base = process.argv.slice(2).find((x) => x.startsWith("http")) || "http://localhost:3482";
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
let bad = 0;
for (const [name, vp, mob] of [["desktop", { width: 1440, height: 900 }, false], ["mobile", { width: 390, height: 844 }, true]]) {
  for (const q of ["", "?fq=low"]) {
    for (const slow of [1, 4]) {
      const ctx = await b.newContext({ viewport: vp, hasTouch: mob, isMobile: mob });
      await ctx.addInitScript(() => { try { localStorage.setItem("keplar_consent", encodeURIComponent(JSON.stringify({ version: "v1-analytics", at: Date.now(), choices: { analytics: false } }))); } catch {} window.__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) { window.__cls += e.value; (window.__src = window.__src || []).push(e.sources.map((s) => (s.node && (s.node.nodeName + "." + String(s.node.className || "").slice(0, 40))) + " " + Math.round(s.previousRect.y) + "->" + Math.round(s.currentRect.y) + " h" + Math.round(s.currentRect.height)).join(" | ") + " v=" + e.value.toFixed(3)); } }).observe({ type: "layout-shift", buffered: true }); });
      const p = await ctx.newPage();
      if (slow > 1) { const c = await ctx.newCDPSession(p); await c.send("Emulation.setCPUThrottlingRate", { rate: slow }); }
      await p.goto(base + "/" + q, { waitUntil: "load" });
      await p.waitForTimeout(6000);
      const r = await p.evaluate(() => ({ cls: Math.round(window.__cls * 1000) / 1000, mode: document.querySelector("section[aria-label='Keplar']")?.getAttribute("data-mode"), src: (window.__src || []).slice(0, 4) }));
      const ok = r.cls < 0.05; if (!ok) bad++;
      console.log(ok ? "ok  " : "FAIL", name, q || "(default)", "cpu x" + slow, JSON.stringify(r));
      await ctx.close();
    }
  }
}
await b.close();
console.log(bad ? bad + " failures" : "all ok");
