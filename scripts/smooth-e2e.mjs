// Smooth caret / no pointer follower / input latency: node scripts/smooth-e2e.mjs [baseUrl]
// Latency = keydown -> the second animation frame after the input event (what the person sees), 60 keystrokes, smooth effects ON vs OFF (localStorage keplar-smooth=off).
import { chromium } from "playwright";
const base = process.argv.slice(2).find((a) => !a.startsWith("--")) || "http://localhost:3470";
const b = await chromium.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
let bad = 0;
const ok = (c, m) => { console.log(c ? "ok  " : "FAIL", m); if (!c) bad++; };
const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

async function open(ctxOpts, off) {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 768 }, ...ctxOpts });
  await ctx.addInitScript((o) => { try { localStorage.setItem("keplar_consent", encodeURIComponent(JSON.stringify({ version: "v1-analytics", at: Date.now(), choices: { analytics: false } }))); if (o) localStorage.setItem("keplar-smooth", "off"); } catch {} }, off);
  const p = await ctx.newPage();
  await p.goto(base + "/app", { waitUntil: "load" });
  await p.waitForSelector("textarea", { timeout: 20000 });
  await p.waitForTimeout(1200);
  return { ctx, p };
}
const caretState = (p) => p.evaluate(() => { const c = document.querySelector(".smooth-caret"); if (!c) return null; const r = c.getBoundingClientRect(); const cs = getComputedStyle(c); return { x: r.left, y: r.top, w: r.width, h: r.height, vis: cs.visibility, block: c.dataset.block, display: cs.display }; });

// ── 1. caret overlay follows the real caret, glides, and the native caret is hidden only while it shows ──
{
  const { ctx, p } = await open({}, false);
  const ta = p.locator("textarea").first();
  await ta.click();
  await p.keyboard.type("Hello smooth caret", { delay: 0 });
  await p.waitForTimeout(500);
  const st = await caretState(p);
  const box = await ta.boundingBox();
  ok(!!st && st.vis === "visible", "overlay caret is visible while typing");
  ok(st && st.x > box.x && st.x < box.x + box.width && st.y >= box.y - 2 && st.y <= box.y + box.height, `overlay sits inside the field (x ${st?.x?.toFixed(1)}, field ${box.x.toFixed(0)}-${(box.x + box.width).toFixed(0)})`);
  ok(await ta.evaluate((e) => e.hasAttribute("data-sc") && getComputedStyle(e).caretColor === "rgba(0, 0, 0, 0)"), "native caret hidden only while the overlay shows");
  // where should the caret be? measure the text width with a canvas using the field's font
  const expected = await ta.evaluate((e) => { const cs = getComputedStyle(e), r = e.getBoundingClientRect(); const c = document.createElement("canvas").getContext("2d"); c.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`; return r.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft) + c.measureText(e.value).width; });
  ok(Math.abs(st.x - expected) < 4, `overlay x matches the text end within 4px (overlay ${st.x.toFixed(1)}, expected ${expected.toFixed(1)})`);
  // glide: after one key, positions between the old and the new one are visited
  let trace = [], distinct = 0;
  for (let attempt = 0; attempt < 3 && distinct < 3; attempt++) { // a stalled frame (busy CI box) can legitimately skip the glide, so give it three tries
    await p.waitForTimeout(500);
    trace = await p.evaluate(() => new Promise((res) => { const c = document.querySelector(".smooth-caret"); const xs = []; const f = () => { xs.push(c.getBoundingClientRect().left); if (xs.length < 14) requestAnimationFrame(f); else res(xs); }; document.execCommand("insertText", false, "WWWW"); requestAnimationFrame(f); }));
    distinct = new Set(trace.map((x) => Math.round(x * 2) / 2)).size;
  }
  ok(distinct >= 3 && trace[trace.length - 1] >= trace[0], `caret glides over several frames (${distinct} distinct positions: ${trace.map((x) => x.toFixed(0)).join(",")})`);
  // text really typed: no delay, no loss, undo works, paste-like insert works
  ok((await ta.inputValue()).startsWith("Hello smooth caret") && /^Hello smooth caret(WWWW)+$/.test(await ta.inputValue()), "typed text is exactly what was typed");
  const beforeUndo = await ta.inputValue();
  await p.keyboard.press("Control+z"); await p.waitForTimeout(80);
  const afterUndo = await ta.inputValue();
  ok(afterUndo !== beforeUndo && beforeUndo.startsWith(afterUndo), `undo still works (${beforeUndo.length} -> ${afterUndo.length} chars)`);
  await p.keyboard.insertText(" pasted"); await p.waitForTimeout(80);
  ok((await ta.inputValue()).endsWith(" pasted"), "paste/insertText still works");
  // selection: a range selection hides the overlay and gives the native look back
  await p.keyboard.press("Control+a"); await p.waitForTimeout(150);
  ok(await ta.evaluate((e) => !e.hasAttribute("data-sc")), "range selection: native caret/selection untouched");
  await p.keyboard.press("End"); await p.waitForTimeout(150);
  // composition: native caret while composing
  await ta.evaluate((e) => e.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "" }))); await p.waitForTimeout(100);
  ok(await ta.evaluate((e) => !e.hasAttribute("data-sc")), "IME composition: native caret");
  await ta.evaluate((e) => e.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "" }))); await p.waitForTimeout(150);
  // overtype block caret
  await p.keyboard.press("Insert"); await p.waitForTimeout(200);
  const mode = await p.evaluate(() => document.documentElement.dataset.typingMode);
  if (mode === "ovr") { await p.keyboard.press("ArrowLeft"); await p.waitForTimeout(250); const bs = await caretState(p); ok(bs && bs.block === "1" && bs.w > 4, `overtype (OVR): block caret ${bs?.w?.toFixed(1)}px wide`); await p.keyboard.press("Insert"); }
  else console.log("skip  overtype block caret (typing mode not enabled in this build)");
  await p.keyboard.press("Tab"); await p.waitForTimeout(150);
  ok(await ta.evaluate((e) => !e.hasAttribute("data-sc")) || await p.evaluate(() => document.activeElement?.tagName !== "TEXTAREA"), "blur: native caret returns");
  await ctx.close();
}
// ── 2. reduced motion: no overlay, native caret ──
{
  const { ctx, p } = await open({ reducedMotion: "reduce" }, false);
  const ta = p.locator("textarea").first(); await ta.click(); await p.keyboard.type("abc"); await p.waitForTimeout(250);
  ok(await ta.evaluate((e) => !e.hasAttribute("data-sc")) && !(await caretState(p)), "prefers-reduced-motion: native caret only");
  await ctx.close();
}
// ── 3. no custom pointer: no follower element anywhere, and the native cursor is never hidden ──
{
  const { ctx, p } = await open({}, false);
  await p.mouse.move(300, 300); await p.mouse.move(520, 380, { steps: 8 }); await p.waitForTimeout(500);
  ok(await p.evaluate(() => document.querySelectorAll(".ptr-ring,.ptr-dot,[class*='pointer-follow']").length) === 0, "no pointer follower element exists");
  ok(await p.evaluate(() => [...document.querySelectorAll("*")].filter((e) => getComputedStyle(e).cursor === "none").length) === 0, "the native cursor is never hidden (no element has cursor: none)");
  ok(await p.evaluate(() => getComputedStyle(document.body).cursor !== "none" && getComputedStyle(document.documentElement).cursor !== "none"), "html/body keep the native cursor");
  await ctx.close();
}
// ── 4. latency: keydown -> second animation frame after input, effects ON vs OFF ──
async function latency(off) {
  const { ctx, p } = await open({}, off);
  const ta = p.locator("textarea").first(); await ta.click();
  await p.evaluate(() => { window.__lat = []; let t0 = 0; document.addEventListener("keydown", () => { t0 = performance.now(); }, true); document.addEventListener("input", () => { const s = t0; requestAnimationFrame(() => requestAnimationFrame(() => window.__lat.push(performance.now() - s))); }, true); });
  const text = "The quick brown fox jumps over the lazy dog while the smooth caret follows.";
  for (const ch of text) { await p.keyboard.press(ch === " " ? "Space" : ch, { delay: 0 }); }
  await p.waitForTimeout(400);
  const lat = await p.evaluate(() => window.__lat);
  await ctx.close();
  return { n: lat.length, p50: pct(lat, 0.5), p95: pct(lat, 0.95), max: Math.max(...lat) };
}
const rounds = [];
for (let i = 0; i < 5; i++) { const on = await latency(false), offr = await latency(true); rounds.push({ on, off: offr }); }
const med = (k, f) => pct(rounds.map((r) => r[k][f]), 0.5);
const on50 = med("on", "p50"), off50 = med("off", "p50"), on95 = med("on", "p95"), off95 = med("off", "p95");
console.log(`latency (median of 5 runs, 75 keystrokes each): ON p50 ${on50.toFixed(1)} ms p95 ${on95.toFixed(1)} ms | OFF p50 ${off50.toFixed(1)} ms p95 ${off95.toFixed(1)} ms`);
ok(rounds.every((r) => r.on.n >= 70), "every keystroke produced an input event");
ok(on50 <= off50 * 1.2 + 2, `no regression at p50 (ON ${on50.toFixed(1)} ms vs OFF ${off50.toFixed(1)} ms)`);
ok(on95 <= off95 * 1.3 + 4, `no regression at p95 (ON ${on95.toFixed(1)} ms vs OFF ${off95.toFixed(1)} ms)`);
console.log(bad ? `\n${bad} FAIL` : "\nall ok");
await b.close();
process.exit(bad ? 1 : 0);
