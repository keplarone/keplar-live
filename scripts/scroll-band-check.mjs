#!/usr/bin/env node
// Landing scroll band check: scrolls the home page in fixed steps at several viewports and themes, screenshots every step and fails
// if a light band (a run of near-full-width white / light-grey rows) shows where the page should be dark:
//   - dark (stored "dark", and the first-visit default, which must resolve to dark): anywhere on the page, top to bottom
//   - light / auto with a light OS: inside the hero, where the graphite space scene must always cover the viewport
// Regression check for the mid-scroll white band (the page-colour .bridge exposed under the see-through pinned hero).
//   node scripts/scroll-band-check.mjs [base=http://localhost:3000] [--viewports=1024x768,1280x800,1440x900,390x844m]
//     [--themes=default,dark,light,auto-light] [--step=100] [--out=test-results/scroll-band] [--shot=1024x768@300]
// WebGL is forced with ?fq=medium (headless Chromium renders with SwiftShader, which the site otherwise treats as "no GPU").
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";

const a = process.argv.slice(2);
const opt = (k, d) => (a.find((x) => x.startsWith(`--${k}=`)) || "").split("=").slice(1).join("=") || d;
const base = (a.find((x) => !x.startsWith("--")) || "http://localhost:3000").replace(/\/$/, "");
const vps = opt("viewports", "1024x768,1280x800,1440x900,390x844m").split(",").map((v) => {
  const m = /^(\d+)x(\d+)(m?)$/.exec(v);
  return { w: +m[1], h: +m[2], mobile: !!m[3], name: v };
});
const themes = opt("themes", "default,dark,light,auto-light").split(",");
const step = +opt("step", "100");
const out = opt("out", "test-results/scroll-band");
const shots = opt("shot", "").split(",").filter(Boolean).map((s) => { const [vp, y] = s.split("@"); return { vp, y: +y }; });
fs.mkdirSync(out, { recursive: true });

const exe = fs.existsSync("/usr/bin/google-chrome") ? "/usr/bin/google-chrome" : undefined;
const launch = () => chromium.launch({ executablePath: exe, args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
let failures = 0;
const fail = (m) => { failures++; console.log("FAIL", m); };

/**
 * Longest run of rows (between top and bottom) that are a flat light fill: at least 85% of the pixels white or light grey (every
 * channel >= minLo) AND within
 * a few levels of the row's median (a page-colour band is one flat colour; lit 3D surfaces such as the logo filling a phone screen
 * are shaded, so they never pass).
 */
async function lightBand(buf, top, bottom, minLo = 236) {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let run = 0, best = 0, start = -1, at = -1;
  const lum = new Uint8Array(width);
  for (let r = Math.max(0, top); r < Math.min(height, bottom); r++) {
    let light = 0;
    for (let c = 0; c < width; c++) {
      const i = (r * width + c) * channels, R = data[i], G = data[i + 1], B = data[i + 2];
      const lo = Math.min(R, G, B);
      lum[c] = Math.round((R + G + B) / 3);
      if (lo >= minLo && Math.max(R, G, B) - lo < 16) light++;
    }
    let flat = 0;
    if (light / width >= 0.85) {
      const med = Array.from(lum).sort((x, y) => x - y)[width >> 1];
      for (let c = 0; c < width; c++) if (Math.abs(lum[c] - med) <= 6) flat++;
    }
    if (flat / width >= 0.85) { if (!run) start = r; run++; if (run > best) { best = run; at = start; } } else run = 0;
  }
  return { rows: best, at };
}

for (const vp of vps) {
  // one browser per viewport, closed before the next (keeps memory flat on a shared machine)
  const browser = await launch();
  for (const theme of themes) {
    const tag = `${vp.name} ${theme}`;
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: vp.mobile, hasTouch: vp.mobile, deviceScaleFactor: 1, colorScheme: theme === "auto-light" ? "light" : "dark" });
    await ctx.addInitScript((t) => {
      try {
        localStorage.setItem("keplar_consent", encodeURIComponent(JSON.stringify({ version: "v1-analytics", at: Date.now(), choices: { analytics: false } })));
        if (t !== "default") localStorage.setItem("keplar-theme", t);
      } catch {}
    }, theme.startsWith("auto") ? "auto" : theme);
    const p = await ctx.newPage();
    const errs = [];
    p.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
    await p.goto(`${base}/?fq=medium`, { waitUntil: "load", timeout: 90000 });
    await p.waitForSelector("canvas[data-ready]", { timeout: 60000 }).catch(() => fail(`${tag} the scene never drew a frame`));
    await p.waitForTimeout(1200);
    await p.addStyleTag({ content: "html[data-band-check] canvas { visibility: hidden !important; }" });
    const env = await p.evaluate(() => ({ theme: document.documentElement.dataset.theme, mode: document.querySelector("section[aria-label='Keplar']")?.getAttribute("data-mode"), sh: document.documentElement.scrollHeight }));
    const dark = env.theme === "dark";
    if ((theme === "default" || theme === "dark") && !dark) fail(`${tag} resolved to ${env.theme}; the default must be dark`);
    if (env.mode !== "webgl") fail(`${tag} hero mode ${env.mode}, expected webgl`);
    const end = env.sh - vp.h;
    let bands = 0, checked = 0;
    const ys = [];
    for (let y = 0; y < end; y += step) ys.push(y);
    ys.push(end);
    for (const y of ys) {
      await p.evaluate((y) => window.scrollTo(0, y), y);
      // two frames for the scroll handler (sky on/off, scene pose) plus a little for the observer backstop
      await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 60)))));
      const box = await p.evaluate(() => {
        // skip the floating nav (and any other fixed strip at the top) — it is light in the light theme by design
        let navBottom = 0;
        for (const el of document.querySelectorAll("body *")) {
          const cs = getComputedStyle(el);
          if (cs.position !== "fixed" || cs.visibility === "hidden" || el.closest("[aria-hidden='true']")) continue;
          const r = el.getBoundingClientRect();
          if (r.top < 100 && r.height > 0 && r.height < 160 && r.width > innerWidth * 0.5) navBottom = Math.max(navBottom, r.bottom);
        }
        const h = document.querySelector("section[aria-label='Keplar']").getBoundingClientRect();
        return { navBottom: Math.ceil(navBottom) + 2, heroTop: Math.floor(h.top), heroBottom: Math.ceil(h.bottom) };
      });
      const top = dark ? box.navBottom : Math.max(box.navBottom, box.heroTop);
      const bottom = dark ? vp.h : Math.min(vp.h, box.heroBottom);
      if (bottom - top < 6) continue;
      checked++;
      // 1) as the visitor sees it: a tall flat white / light-grey fill (a stretched canvas gap, a wrong clear colour, an exposed page).
      //    At least 12% of the viewport tall: on phones the logo's blown-out top face can span the width for ~40px in a scene swap.
      const buf = await p.screenshot();
      const shot = shots.find((s) => s.vp === vp.name && s.y === y);
      if (shot) fs.writeFileSync(path.join(out, `${vp.name}-${theme}-y${y}.png`), buf);
      // 2) with the canvas hidden (the graphite sky base stays): ANY flat light band is page or element background showing through
      //    the see-through hero. Strict, because the shaded 3D scene (the logo can fill a phone screen, with a blown-out
      //    highlight) is out of the picture.
      await p.evaluate(() => document.documentElement.setAttribute("data-band-check", ""));
      const bare = await p.screenshot();
      await p.evaluate(() => document.documentElement.removeAttribute("data-band-check"));
      const seen = await lightBand(buf, top, bottom, 236);
      const page = await lightBand(bare, top, bottom, 200);
      const hit = page.rows >= 6 ? { ...page, kind: "page/background", img: bare } : seen.rows >= Math.max(32, Math.round(vp.h * 0.12)) ? { ...seen, kind: "on screen", img: buf } : null;
      if (hit) {
        bands++;
        const who = await p.evaluate((yy) => document.elementsFromPoint(Math.round(innerWidth / 2), yy).slice(0, 4).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).split(" ")[0].slice(0, 32)}`).join(" > "), hit.at + Math.floor(hit.rows / 2));
        const file = path.join(out, `band-${vp.name}-${theme}-y${y}.png`);
        fs.writeFileSync(file, buf);
        fail(`${tag} scrollY=${y}: light ${hit.kind} band ${hit.rows}px tall at viewport y=${hit.at} (${who}) -> ${file}`);
      }
    }
    if (errs.length) fail(`${tag} page errors: ${errs.join(" | ")}`);
    console.log(`${bands ? "BAD " : "ok  "} ${tag}: ${checked} positions checked (${dark ? "whole page" : "hero"}), ${bands} with a light band`);
    await ctx.close();
  }
  await browser.close();
}
console.log(failures ? `\n${failures} failure(s)` : "\nno light bands");
process.exit(failures ? 1 : 0);
