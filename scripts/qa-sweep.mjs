// Live QA sweep: routes x widths x themes. Checks load status/time, page errors, console errors,
// sideways overflow, Google Sans, h1/main count, data-theme, and mid-word line breaks (a Range per word:
// a word whose client rects span 2+ lines without a hyphen/soft break is a mid-word split).
// node scripts/qa-sweep.mjs [base] [--widths=1920,1366,390,320] [--themes=dark,light,auto,default] [--os=dark|light] [--routes=/a,/b] [--links] [--out=file.json]
import { chromium } from "playwright";
import fs from "node:fs";
const a = process.argv.slice(2);
const opt = (k, d) => { const f = a.find((x) => x.startsWith(`--${k}=`)); return f ? f.slice(k.length + 3) : d; };
const base = a.find((x) => x.startsWith("http")) || "https://keplar.one";
const widths = opt("widths", "1920,1366,390,320").split(",").map(Number);
const themes = opt("themes", "dark,light,auto").split(",");
const ROUTES = opt("routes", "/,/app/ask,/app/create,/pricing,/help,/signin,/signup,/forgot-password,/account,/status,/contact,/security,/product,/simulation,/agents,/blogs,/privacy,/terms,/about,/changelog,/templates").split(",");
const wantLinks = a.includes("--links");
const out = opt("out", "");
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const rows = []; const links = new Set();
for (const theme of themes) for (const w of widths) {
  const mobile = w < 600;
  const ctx = await b.newContext({ viewport: { width: w, height: mobile ? 844 : (w >= 1900 ? 1080 : 768) }, isMobile: mobile, hasTouch: mobile, colorScheme: opt("os", "dark") });
  await ctx.addInitScript((t) => { try { if (t !== "default") localStorage.setItem("keplar-theme", t); localStorage.setItem("keplar_consent", encodeURIComponent(JSON.stringify({ version: "v1-analytics", at: Date.now(), choices: { analytics: false } }))); } catch {} }, theme);
  for (const route of ROUTES) {
    const p = await ctx.newPage(); const cons = []; const perr = [];
    p.on("console", (m) => { if (m.type() === "error") cons.push(m.text().slice(0, 160)); });
    p.on("pageerror", (e) => perr.push(String(e).slice(0, 160)));
    let status = 0, ms = 0; const t0 = Date.now();
    try { const r = await p.goto(base + route, { waitUntil: "load", timeout: 45000 }); status = r?.status() ?? 0; ms = Date.now() - t0; } catch (e) { perr.push("goto " + String(e).slice(0, 100)); }
    await p.waitForTimeout(900);
    const info = await p.evaluate(() => {
      const de = document.documentElement;
      const overflowX = Math.max(de.scrollWidth, document.body.scrollWidth) - innerWidth;
      const fam = getComputedStyle(document.body).fontFamily;
      const breaks = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        const el = n.parentElement; if (!el) continue;
        if (el.closest("script,style,noscript,[aria-hidden='true'],pre,code,textarea,.visually-hidden,svg")) continue;
        const cs = getComputedStyle(el); if (cs.display === "none" || cs.visibility === "hidden") continue;
        const txt = n.textContent; const re = /[A-Za-z]{4,}/g; let m;
        while ((m = re.exec(txt))) {
          const r = document.createRange(); r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length);
          const rects = [...r.getClientRects()].filter((q) => q.width > 0.5);
          if (rects.length < 2) continue;
          const tops = new Set(rects.map((q) => Math.round(q.top / 4)));
          if (tops.size > 1) { const bb = r.getBoundingClientRect(); if (bb.bottom < -5000) continue; breaks.push(`${m[0]} @${el.tagName.toLowerCase()}.${(el.className && typeof el.className === "string" ? el.className.split(" ")[0] : "")}`); }
        }
        if (breaks.length > 15) break;
      }
      const hrefs = [...document.querySelectorAll("a[href]")].map((x) => x.href).filter((h) => h.startsWith(location.origin));
      return { overflowX, google: /Google Sans/i.test(fam), h1: document.querySelectorAll("h1").length, main: document.querySelectorAll("main").length, dataTheme: de.dataset.theme || de.getAttribute("data-theme"), path: location.pathname, breaks, hrefs };
    }).catch((e) => ({ err: String(e).slice(0, 100) }));
    if (wantLinks && info.hrefs) info.hrefs.forEach((h) => links.add(h.split("#")[0]));
    delete info.hrefs;
    rows.push({ theme, w, route, status, ms, cons: [...new Set(cons)], perr, ...info });
    await p.close();
  }
  await ctx.close();
}
const bad = rows.filter((r) => r.status >= 400 || r.perr.length || r.overflowX > 1 || r.google === false || (r.breaks && r.breaks.length) || r.main !== 1 || r.h1 !== 1);
const consAll = {}; rows.forEach((r) => r.cons.forEach((c) => { consAll[c] = consAll[c] || []; consAll[c].push(`${r.route}@${r.w}/${r.theme}`); }));
console.log(`loads: ${rows.length}, flagged: ${bad.length}`);
for (const r of bad) console.log(JSON.stringify({ route: r.route, w: r.w, theme: r.theme, status: r.status, path: r.path, perr: r.perr, overflowX: r.overflowX, google: r.google, h1: r.h1, main: r.main, breaks: r.breaks }));
console.log("console errors:"); for (const [k, v] of Object.entries(consAll)) console.log(`  ${k} :: ${v.length}x e.g. ${v.slice(0, 3).join(", ")}`);
const dtm = {}; rows.forEach((r) => { const k = `${r.theme} -> ${r.dataTheme}`; dtm[k] = (dtm[k] || 0) + 1; });
console.log("data-theme per pref: " + JSON.stringify(dtm));
const timing = rows.filter((r) => r.theme === themes[0]).map((r) => `${r.route}@${r.w}=${r.ms}`);
console.log("load ms (" + themes[0] + "): " + timing.join(" "));
if (out) fs.writeFileSync(out, JSON.stringify({ rows, links: [...links] }, null, 1));
await b.close();
