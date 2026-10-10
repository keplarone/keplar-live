// Cleanup pass: screenshots + automatic checks for every public template at 360/768/1440, Light and Dark.
//   node scripts/cleanup-shots.mjs <baseUrl> <outDir> [--routes=/a,/b] [--widths=360,768,1440] [--themes=light,dark]
import { chromium } from "playwright";
import fs from "node:fs";
const a = process.argv.slice(2);
const base = a[0], out = a[1];
const opt = (k, d) => (a.find((x) => x.startsWith(`--${k}=`)) || "").split("=")[1] || d;
const ROUTES = opt("routes", "/,/pricing,/about,/download,/help,/signin,/signup,/simulation,/privacy,/terms,/security,/how-it-works,/agents,/enterprise,/contact,/status,/changelog,/blogs,/blogs/what-is-mcp,/docs,/docs/get-started/quickstart,/vs,/vs/chatgpt,/compare,/use-cases,/for-founders,/models,/product,/keplar-one,/glossary,/guides,/guides/check-an-ai-answer,/prompts,/prompts/coding,/inquire,/developers,/multi-model-ai,/chatgpt-alternative,/compare-ai-models,/superintelligence,/referral-terms,/ai-fact-check").split(",");
const WIDTHS = opt("widths", "360,768,1440").split(",").map(Number);
const THEMES = opt("themes", "light,dark").split(",");
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const probe = () => {
  const vis = (el) => { const cs = getComputedStyle(el); if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity === 0) return false; const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
  const res = { over: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth, trunc: [], clipped: [], words: [], dup: [], radii: {}, fonts: [], blue: [], tiny: [] };
  const txt = (el) => (el.textContent || "").replace(/\s+/g, " ").trim();
  for (const el of document.querySelectorAll("body *")) {
    if (!vis(el) || el.closest("script,style,svg,canvas,[aria-hidden=true]")) continue;
    const cs = getComputedStyle(el);
    const direct = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (cs.textOverflow === "ellipsis" && el.scrollWidth > el.clientWidth + 1 && direct) res.trunc.push(txt(el).slice(0, 50));
    if (/-webkit-box/.test(cs.display) && cs.webkitLineClamp !== "none" && el.scrollHeight > el.clientHeight + 2) res.trunc.push("clamp:" + txt(el).slice(0, 50));
    if (/hidden|clip/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 3 && direct && !el.closest("[data-static],[class*=scatter]")) res.clipped.push(el.tagName.toLowerCase() + "." + String(el.className).replace(/.*__/, "").slice(0, 24) + ":" + txt(el).slice(0, 36));
    if (direct) {
      const t = txt(el);
      if (/coming soon|lorem|placeholder|\btodo\b|\btbd\b|xxx|\?\?\?|under construction|not yet available/i.test(t) && t.length < 200) res.words.push(el.tagName.toLowerCase() + ":" + t.slice(0, 90));
      const fam = cs.fontFamily;
      if (!/Google Sans|Keplar Sans|mono|Mono|Menlo|Consolas|ui-monospace|monospace/i.test(fam.split(",")[0]) && !/Google Sans/.test(fam)) res.fonts.push(fam.slice(0, 40) + " | " + t.slice(0, 20));
      if (parseFloat(cs.fontSize) < 11 && t.length > 3) res.tiny.push(cs.fontSize + " " + t.slice(0, 30));
      for (const prop of ["color"]) { const m = cs[prop].match(/rgba?\((\d+), (\d+), (\d+)/); if (m && +m[3] > +m[1] + 50 && +m[3] > +m[2] + 25) res.blue.push(cs[prop] + " " + t.slice(0, 24)); }
    }
    const bg = cs.backgroundColor.match(/rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?/);
    if (bg && (bg[4] === undefined || +bg[4] > 0.2) && +bg[3] > +bg[1] + 50 && +bg[3] > +bg[2] + 25) res.blue.push("bg " + cs.backgroundColor + " " + el.tagName + "." + String(el.className).replace(/.*__/, "").slice(0, 20));
    if ((el.tagName === "BUTTON" || (el.tagName === "A" && /btn|button|cta/i.test(el.className))) && el.getBoundingClientRect().height > 24) {
      const k = cs.borderTopLeftRadius === "0px" ? "0" : parseFloat(cs.borderTopLeftRadius) >= el.getBoundingClientRect().height / 2 - 1 ? "pill" : cs.borderTopLeftRadius;
      res.radii[k] = (res.radii[k] || 0) + 1;
    }
  }
  const seen = new Map();
  for (const el of document.querySelectorAll("p, li, h2, h3, summary, dd")) {
    if (!vis(el) || el.closest("nav, footer, header, [aria-hidden=true]")) continue;
    const t = txt(el); if (t.length < 45) continue;
    seen.set(t, (seen.get(t) || 0) + 1);
  }
  for (const [t, n] of seen) if (n > 1) res.dup.push(n + "x " + t.slice(0, 70));
  for (const k of ["trunc", "clipped", "words", "fonts", "blue", "tiny"]) res[k] = [...new Set(res[k])].slice(0, 6);
  return res;
};
const results = [];
for (const theme of THEMES) for (const w of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 500 ? 780 : w < 1000 ? 1000 : 900 }, deviceScaleFactor: 1, isMobile: w < 500, hasTouch: w < 800, reducedMotion: "reduce" });
  await ctx.addInitScript((t) => { try { localStorage.setItem("keplar-theme", t); } catch {} }, theme);
  for (const r of ROUTES) {
    const p = await ctx.newPage();
    await p.goto(base + r, { waitUntil: "load", timeout: 45000 }).catch(() => {});
    await p.getByRole("button", { name: /reject non-essential/i }).click({ timeout: 1200 }).catch(() => {});
    await p.waitForTimeout(900);
    // let lazy / scroll-driven sections show their final state
    await p.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 700) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } scrollTo(0, 0); }).catch(() => {});
    await p.waitForTimeout(500);
    const m = await p.evaluate(probe).catch((e) => ({ err: String(e).slice(0, 80) }));
    const name = `${r === "/" ? "home" : r.slice(1).replace(/[^a-z0-9]+/gi, "_")}-${w}-${theme}`;
    await p.screenshot({ path: `${out}/${name}.jpg`, fullPage: true, type: "jpeg", quality: 55 }).catch(() => {});
    results.push({ route: r, w, theme, ...m });
    await p.close();
  }
  await ctx.close();
}
fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 1));
console.log("done", results.length);
await browser.close();
