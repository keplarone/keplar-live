#!/usr/bin/env node
/**
 * Chrome Web Store images for the Keplar One extension, made from the real extension (not mock-ups):
 *   extension/store/screenshot-1-answer.png     1280x800  headline + the answer popup over a page
 *   extension/store/screenshot-2-page-text.png  1280x800  headline + page text added from the right-click menu
 *   extension/store/screenshot-3-setup.png      1280x800  headline + first run, Connect Keplar
 *   extension/store/promo-small.png              440x280  small promo tile
 *   extension/store/promo-marquee.png           1400x560  marquee promo tile
 *
 * How: loads extension/ unpacked (Playwright; Chromium, or KEPLAR_SHOTS_CHANNEL=msedge), opens the real popup page at 2x for
 * sharp text, and places it in a designed frame: headline, the Keplar One mark, and a sample article in a browser window
 * behind it. The answer is extension/store/sample-answer.json: a real keplar.one answer in the /api/v1/ask shape, served to
 * the popup's own fetch (no real API key is used). The page-text state uses the extension's real context-menu hand-off.
 * Run: node scripts/extension-store-assets.mjs
 */
import { chromium } from "playwright";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const EXT = resolve("extension");
const OUT = join(EXT, "store");
const sample = JSON.parse(readFileSync(join(OUT, "sample-answer.json"), "utf8")).answer;
const icon = `data:image/png;base64,${readFileSync(join(EXT, "icons", "icon128.png")).toString("base64")}`;

// The Keplar mark (src/components/brand/geometry.ts), for the logo lockup on each image.
const MARK = (fill) => `<svg viewBox="0 0 398 398" width="100%" height="100%" aria-hidden="true"><g fill="${fill}"><rect x="0" y="0" width="229" height="229" rx="70"/><path d="M204.95 11.95A7 7 0 0 1 209.9 0L362 0A16 16 0 0 1 378 16L378 168.1A7 7 0 0 1 366.05 173.05Z"/><circle cx="281" cy="281" r="117"/></g></svg>`;

const QUESTION = "Is a four-day work week better for small teams? Answer in 3 short sentences, then say where people disagree.";
const ARTICLE = {
  site: "Field Notes",
  title: "The four-day week, two years in",
  body: [
    "Several small companies that moved to a four-day, 32-hour week report steady output and lower staff turnover.",
    "Critics point out that most trials are short, self-selected and run by firms already doing well, and that customer-facing teams find coverage harder.",
    "Results depend on whether work is redesigned or simply squeezed into fewer days.",
  ],
};

const FONT = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&display=block">`;
const BASE = `*{box-sizing:border-box}body{margin:0;overflow:hidden;font-family:"Google Sans",system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}`;

/** A small browser window with the sample article (original text made for these images), the tab behind the popup. */
const browser = (w, h) => `
<div class="win" style="width:${w}px;height:${h}px">
  <div class="top"><span class="dots"><i></i><i></i><i></i></span><div class="url">fieldnotes.example/four-day-week</div><img class="tb" src="${icon}" alt=""></div>
  <div class="page"><div class="kicker">${ARTICLE.site} · Work</div><h2>${ARTICLE.title}</h2>${ARTICLE.body.map((p) => `<p>${p}</p>`).join("")}</div>
</div>`;
const BROWSER_CSS = `
.win{position:absolute;border-radius:18px;background:#fbfaf7;box-shadow:0 40px 90px -30px rgba(20,22,30,.35),0 0 0 1px rgba(20,22,30,.08);overflow:hidden}
.top{height:48px;display:flex;align-items:center;gap:14px;padding:0 16px;background:#eceae4;border-bottom:1px solid #e0ddd5}
.dots{display:flex;gap:7px}.dots i{width:11px;height:11px;border-radius:50%;background:#d3cfc6;display:block}
.url{flex:1;height:28px;border-radius:14px;background:#fff;border:1px solid #dedad2;font-size:13px;color:#6b6f78;display:flex;align-items:center;padding:0 14px}
.tb{width:26px;height:26px;border-radius:7px;box-shadow:0 0 0 2px #3a6df0}
.page{padding:38px 46px;font-family:Georgia,"Times New Roman",serif;color:#24262c}
.page .kicker{font:600 11px "Google Sans",system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#8a7f6c}
.page h2{font-size:30px;line-height:1.12;margin:10px 0 16px;letter-spacing:-.01em}.page p{font-size:15.5px;line-height:1.65;margin:0 0 12px;color:#3a3d45}`;

/** Logo lockup: the mark and "Keplar One". */
const lockup = (size, color) => `<div class="lockup" style="gap:${size * 0.42}px"><span style="width:${size}px;height:${size}px;display:block">${MARK(color)}</span><span style="font-size:${size * 0.82}px;font-weight:500;letter-spacing:-.02em;color:${color}">Keplar One</span></div>`;

/** A 1280x800 screenshot: headline on the left, the browser window and the real popup on the right. */
const screenshotHtml = ({ title, line, chips, popup, popupH }) => `<!doctype html><html><head><meta charset="utf-8">${FONT}<style>${BASE}${BROWSER_CSS}
body{width:1280px;height:800px;background:radial-gradient(90% 120% at 100% 0%,#e8eefc 0%,#f5f4f0 46%,#f3f1ec 100%);color:#121318;position:relative}
.lockup{position:absolute;left:72px;top:64px;display:flex;align-items:center}
.copy{position:absolute;left:72px;top:212px;width:430px}
h1{margin:0;font-size:50px;line-height:1.06;font-weight:700;letter-spacing:-.035em}
.line{margin:22px 0 0;font-size:20px;line-height:1.5;color:#4a4e58}
.chips{display:flex;flex-wrap:wrap;gap:10px;margin-top:30px}.chips span{padding:9px 15px;border-radius:999px;background:#fff;box-shadow:0 0 0 1px rgba(18,19,24,.08);font-size:14.5px;color:#30333b}
.pop{position:absolute;right:64px;top:${Math.min(170, 760 - popupH)}px;width:400px;border-radius:16px;overflow:hidden;box-shadow:0 50px 100px -30px rgba(15,18,30,.5),0 0 0 1px rgba(15,18,30,.12);background:#fff}
.pop img{display:block;width:400px}
</style></head><body>
${lockup(30, "#121318")}
<div class="copy"><h1>${title}</h1><p class="line">${line}</p><div class="chips">${chips.map((c) => `<span>${c}</span>`).join("")}</div></div>
<div style="position:absolute;left:560px;top:120px">${browser(640, 560).replace('class="win"', 'class="win" style="position:relative"')}</div>
<div class="pop"><img src="${popup}" alt=""></div>
</body></html>`;

/** A 1280x800 Keplar Lens screenshot: headline on the left, a real frame of Lens on a page (from extension-lens-e2e.mjs) on the right. */
const lensShotHtml = ({ title, line, chips, shot }) => `<!doctype html><html><head><meta charset="utf-8">${FONT}<style>${BASE}
body{width:1280px;height:800px;background:radial-gradient(90% 120% at 100% 0%,#e8eefc 0%,#f5f4f0 46%,#f3f1ec 100%);color:#121318;position:relative}
.lockup{position:absolute;left:64px;top:64px;display:flex;align-items:center}
.copy{position:absolute;left:64px;top:200px;width:340px}
h1{margin:0;font-size:44px;line-height:1.06;font-weight:700;letter-spacing:-.035em}
.line{margin:20px 0 0;font-size:18px;line-height:1.5;color:#4a4e58}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:26px}.chips span{padding:8px 14px;border-radius:999px;background:#fff;box-shadow:0 0 0 1px rgba(18,19,24,.08);font-size:14px;color:#30333b}
.win{position:absolute;left:440px;top:120px;width:800px;border-radius:16px;overflow:hidden;background:#fff;box-shadow:0 50px 100px -30px rgba(15,18,30,.45),0 0 0 1px rgba(15,18,30,.1)}
.top{height:36px;display:flex;align-items:center;gap:7px;padding:0 14px;background:#eceae4;border-bottom:1px solid #e0ddd5}.top i{width:10px;height:10px;border-radius:50%;background:#d3cfc6;display:block}
.win img{display:block;width:800px}
</style></head><body>
${lockup(30, "#121318")}
<div class="copy"><h1>${title}</h1><p class="line">${line}</p><div class="chips">${chips.map((c) => `<span>${c}</span>`).join("")}</div></div>
<div class="win"><div class="top"><i></i><i></i><i></i></div><img src="${shot}" alt=""></div>
</body></html>`;

const promoSmallHtml = () => `<!doctype html><html><head><meta charset="utf-8">${FONT}<style>${BASE}
body{width:440px;height:280px;background:radial-gradient(120% 140% at 100% 0%,#2b3a66 0%,#111319 58%);color:#fff;position:relative}
.lockup{position:absolute;left:36px;top:40px;display:flex;align-items:center}
h1{position:absolute;left:36px;top:108px;margin:0;width:370px;font-size:30px;line-height:1.12;font-weight:700;letter-spacing:-.03em}
p{position:absolute;left:36px;bottom:34px;margin:0;font-size:14.5px;color:#b8c2da}
</style></head><body>${lockup(28, "#ffffff")}<h1>Ask about any page.<br>Several AI models, one answer.</h1><p>See where the models agree and where they split.</p></body></html>`;

const marqueeHtml = (popup) => `<!doctype html><html><head><meta charset="utf-8">${FONT}<style>${BASE}
body{width:1400px;height:560px;background:radial-gradient(80% 140% at 85% 0%,#2b3a66 0%,#111319 60%);color:#fff;position:relative}
.lockup{position:absolute;left:96px;top:84px;display:flex;align-items:center}
.copy{position:absolute;left:96px;top:168px;width:660px}
h1{margin:0;font-size:52px;line-height:1.06;font-weight:700;letter-spacing:-.035em}
p{margin:24px 0 0;width:580px;font-size:21px;line-height:1.5;color:#b8c2da}
.pop{position:absolute;right:110px;top:56px;width:400px;height:520px;border-radius:16px;overflow:hidden;box-shadow:0 50px 110px -20px rgba(0,0,0,.7),0 0 0 1px rgba(255,255,255,.1)}
.pop img{display:block;width:400px}
</style></head><body>${lockup(34, "#ffffff")}<div class="copy"><h1>Ask about any page. Several AI models, one answer.</h1><p>Select text or drag over part of a tab, ask, and see how many models agreed and where they split.</p></div><div class="pop"><img src="${popup}" alt=""></div></body></html>`;

const sse = (answer) => [`event: progress\ndata: ${JSON.stringify({ stage: "answering" })}\n\n`, `event: answer\ndata: ${JSON.stringify(answer)}\n\n`].join("");

const dir = mkdtempSync(join(tmpdir(), "keplar-ext-shots-"));
const ctx = await chromium.launchPersistentContext(dir, {
  channel: process.env.KEPLAR_SHOTS_CHANNEL || "chromium",
  headless: true,
  deviceScaleFactor: 2,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
try {
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
  const id = new URL(sw.url()).host;
  await ctx.route("https://keplar.one/api/v1/ask", (route) => route.fulfill({ status: 200, headers: { "content-type": "text/event-stream" }, body: sse(sample) }));
  // The popup's account line: no credit count is invented for the pictures (left: null shows the line without one).
  await ctx.route("https://keplar.one/api/v1/usage", (route) => route.fulfill({ status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ object: "usage", plan: "plus", credits: { used: 0, total: null, left: null } }) }));

  const popup = async (query = "") => {
    const p = await ctx.newPage();
    // Chrome caps a toolbar popup at 600 px tall; longer content scrolls inside it, as here.
    await p.setViewportSize({ width: 400, height: 600 });
    await p.goto(`chrome-extension://${id}/popup.html${query}`);
    return p;
  };
  /** The real popup at 2x, as tall as its content (max 600 px), as a data URL plus its height in CSS pixels. */
  const capture = async (p) => {
    // Content height: the footer (always last) plus the body's bottom padding, not the 600 px viewport, so a short popup isn't
    // padded with empty space. A scrolled popup is clipped at the viewport, as in Chrome.
    const h = await p.evaluate(() => Math.min(600, Math.ceil(document.querySelector("footer").getBoundingClientRect().bottom + parseFloat(getComputedStyle(document.body).paddingBottom || "0"))));
    const buf = await p.screenshot({ clip: { x: 0, y: 0, width: 400, height: h }, scale: "device" });
    return { src: `data:image/png;base64,${buf.toString("base64")}`, h };
  };
  const render = async (html, w, h, file) => {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    // Exact store size: CSS pixels, not the 2x device pixels used for the popup capture.
    await page.screenshot({ path: join(OUT, file), scale: "css" });
    await page.close();
    console.log("wrote", file);
  };

  // 3: first run, not connected yet.
  let p = await popup();
  await p.waitForSelector("#setup:not([hidden])");
  const setup = await capture(p);
  // A placeholder connection (not a real credential): the popup only checks its format; the API calls are served above.
  await p.evaluate(() => chrome.storage.local.set({ apiKey: "kpl_screenshot_placeholder_000000000", account: { email: "you@example.com", connectedAt: Date.now() } }));
  await p.close();

  // 2: page text added from the right-click menu (the real storage.session hand-off), question typed.
  await sw.evaluate(({ text }) => chrome.storage.session.set({ pending: { kind: "page", text, url: "https://fieldnotes.example/four-day-week", at: Date.now() } }), { text: `${ARTICLE.title}\n\n${ARTICLE.body.join("\n\n")}` });
  p = await popup("?menu=1");
  await p.waitForSelector("#ctx:not([hidden])");
  await p.fill("#q", QUESTION);
  const added = await capture(p);

  // 1: the answer, scrolled the way the person reads it after pressing Ask.
  await p.click("#go");
  await p.waitForSelector("#result:not([hidden])");
  await p.evaluate(() => document.getElementById("result").scrollIntoView({ block: "start" }));
  const answer = await capture(p);
  await p.close();

  // Keplar Lens: real frames from scripts/extension-lens-e2e.mjs (run it first with the same folder in KEPLAR_LENS_FRAMES).
  const frames = process.env.KEPLAR_LENS_FRAMES;
  if (frames) {
    const shot = (f) => `data:image/png;base64,${readFileSync(join(frames, f)).toString("base64")}`;
    await render(lensShotHtml({ title: "Search anything on the page", line: "Drag over text or a picture. Keplar One answers in a side panel, with how many models agreed.", chips: ["Text and images", "Ask a follow-up", "Copy or translate"], shot: shot("4-answer.png") }), 1280, 800, "screenshot-1-lens.png");
    await render(lensShotHtml({ title: "Just drag over it", line: "Right-click and choose Search with Keplar One, then drag over anything on the page.", chips: ["Works on any page", "Asks before it sends"], shot: shot("3-dragging.png") }), 1280, 800, "screenshot-2-lens-select.png");
  }
  await render(screenshotHtml({ title: "One answer from several AI models", line: "Ask about the page you're on. Keplar One shows how many models agreed, and where they split.", chips: ["Agreement at a glance", "Formatted answers", "Your words only"], popup: answer.src, popupH: answer.h }), 1280, 800, "screenshot-3-answer.png");
  await render(screenshotHtml({ title: "Ask about any page in one click", line: "Right-click a page or a selection, or drag over part of the tab, and ask.", chips: ["Selected text", "Whole page", "Drag an area"], popup: added.src, popupH: added.h }), 1280, 800, "screenshot-4-page-text.png");
  await render(screenshotHtml({ title: "Connect once, use your credits", line: "Press Connect Keplar and approve on keplar.one. No key to create or paste; text is sent only when you press Ask.", chips: ["Your Keplar credits", "No tracking", "No remote code"], popup: setup.src, popupH: setup.h }), 1280, 800, "screenshot-5-setup.png");
  await render(promoSmallHtml(), 440, 280, "promo-small.png");
  await render(marqueeHtml(answer.src), 1400, 560, "promo-marquee.png");
} finally {
  await ctx.close();
  rmSync(dir, { recursive: true, force: true });
}
