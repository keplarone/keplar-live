#!/usr/bin/env node
/**
 * Chrome Web Store images for the Keplar extension, made from the real extension (not mock-ups):
 *   extension/store/screenshot-1-answer.png     1280x800  an answer on a page, with the agreement line
 *   extension/store/screenshot-2-page-text.png  1280x800  page text added from the right-click menu, ready to ask
 *   extension/store/screenshot-3-setup.png      1280x800  first run: paste a key
 *   extension/store/promo-small.png              440x280  small promo tile
 *   extension/store/promo-marquee.png           1400x560  marquee promo tile
 *
 * How: loads extension/ unpacked in Playwright's Chromium, opens the popup page, and frames it over a sample article like
 * the toolbar popup. The answer is extension/store/sample-answer.json: a real keplar.one answer in the /api/v1/ask shape,
 * served to the popup's own fetch (no real API key is used). The page-text state uses the extension's real context-menu
 * hand-off (storage.session "pending").
 * Run: node scripts/extension-store-assets.mjs   (needs: npx playwright install chromium)
 */
import { chromium } from "playwright";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const EXT = resolve("extension");
const OUT = join(EXT, "store");
const sample = JSON.parse(readFileSync(join(OUT, "sample-answer.json"), "utf8")).answer;
const icon = `data:image/png;base64,${readFileSync(join(EXT, "icons", "icon128.png")).toString("base64")}`;

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

/** An original sample article page (no third-party content), as the tab behind the popup. */
const articleHtml = (shot) => `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box} body{margin:0;width:1280px;height:800px;overflow:hidden;font:16px/1.65 Georgia,serif;color:#1d1f24;background:#f6f4ef}
  .chrome{height:76px;background:#dee1e6;border-bottom:1px solid #c8ccd2;display:flex;flex-direction:column;justify-content:flex-end}
  .tabs{display:flex;padding:0 10px;gap:6px}.tab{background:#f6f4ef;border-radius:10px 10px 0 0;padding:8px 18px;font:13px system-ui,sans-serif;color:#333;width:240px}
  .bar{height:38px;background:#f6f4ef;display:flex;align-items:center;gap:10px;padding:0 12px;border-top:1px solid #e9e6df}
  .url{flex:1;height:28px;border-radius:14px;background:#fff;border:1px solid #d9d6cf;font:13px system-ui,sans-serif;color:#555;display:flex;align-items:center;padding:0 14px}
  .ext{width:26px;height:26px;border-radius:7px;background:url(${icon}) center/26px no-repeat;box-shadow:0 0 0 2px #8fb4ff}
  main{width:720px;margin:56px 0 0 120px} .kicker{font:600 12px system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#7a6f5d}
  h1{font-size:44px;line-height:1.1;margin:10px 0 18px;letter-spacing:-.01em} p{margin:0 0 16px;font-size:19px;color:#30333a}
  .by{font:14px system-ui,sans-serif;color:#6b6f78;margin-bottom:26px}
  .pop{position:absolute;top:80px;right:24px;border-radius:12px;box-shadow:0 18px 60px rgba(0,0,0,.35),0 0 0 1px rgba(0,0,0,.25);overflow:hidden;background:#111}
  .pop img{display:block;width:400px}
</style></head><body>
  <div class="chrome"><div class="tabs"><div class="tab">${ARTICLE.title}</div></div><div class="bar"><div class="url">fieldnotes.example/four-day-week</div><div class="ext" title="Keplar"></div></div></div>
  <main><div class="kicker">${ARTICLE.site} · Work</div><h1>${ARTICLE.title}</h1><div class="by">A sample article for this screenshot</div>${ARTICLE.body.map((p) => `<p>${p}</p>`).join("")}</main>
  ${shot ? `<div class="pop"><img src="${shot}" alt=""></div>` : ""}
</body></html>`;

/** Promo tiles: the mark, the name and one line; the marquee also shows the real answer popup (screenshot 1). */
const promoHtml = (w, h, shot = "") => `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:radial-gradient(120% 140% at 85% 10%,#2a3550 0%,#14161b 55%);color:#eef1f7;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;display:flex;align-items:center}
  .wrap{display:flex;align-items:center;gap:${w > 800 ? 40 : 18}px;padding:0 ${w > 800 ? 90 : 28}px}
  .mark{width:${w > 800 ? 120 : 84}px;height:${w > 800 ? 120 : 84}px} h1{margin:0;font-size:${w > 800 ? 58 : 30}px;letter-spacing:-.02em;font-weight:650}
  p{margin:${w > 800 ? 14 : 8}px 0 0;font-size:${w > 800 ? 26 : 15}px;line-height:1.35;color:#b9c3d8;max-width:${w > 800 ? 520 : 250}px}
  .shot{position:absolute;right:80px;top:40px;height:480px;width:auto;border-radius:12px;box-shadow:0 30px 80px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.08)}
</style></head><body><div class="wrap"><img class="mark" src="${icon}" alt=""><div><h1>Keplar</h1><p>Ask about any page. Several AI models, one answer, and where they disagree.</p></div></div>${shot ? `<img class="shot" src="${shot}" alt="">` : ""}</body></html>`;

const sse = (answer) => [
  `event: progress\ndata: ${JSON.stringify({ stage: "answering" })}\n\n`,
  `event: answer\ndata: ${JSON.stringify(answer)}\n\n`,
].join("");

const dir = mkdtempSync(join(tmpdir(), "keplar-ext-shots-"));
const ctx = await chromium.launchPersistentContext(dir, {
  channel: process.env.KEPLAR_SHOTS_CHANNEL || "chromium",
  headless: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
try {
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
  const id = new URL(sw.url()).host;
  await ctx.route("https://keplar.one/api/v1/ask", (route) => route.fulfill({ status: 200, headers: { "content-type": "text/event-stream" }, body: sse(sample) }));

  const popup = async (query = "") => {
    const p = await ctx.newPage();
    // Chrome caps a toolbar popup at 600 px tall; longer content scrolls inside it, as here.
    await p.setViewportSize({ width: 400, height: 600 });
    await p.goto(`chrome-extension://${id}/popup.html${query}`);
    return p;
  };
  const frame = async (shotBuf, file) => {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.setContent(articleHtml(shotBuf ? `data:image/png;base64,${shotBuf.toString("base64")}` : ""));
    await page.screenshot({ path: join(OUT, file) });
    await page.close();
    console.log("wrote", file);
  };
  /** The popup as Chrome shows it: as tall as its content, at most 600 px, scrolled where the person would be looking. */
  const crop = async (p) => {
    const h = await p.evaluate(() => Math.min(600, document.documentElement.scrollHeight));
    return p.screenshot({ clip: { x: 0, y: 0, width: 400, height: h } });
  };

  // 3: first run, no key yet.
  let p = await popup();
  await frame(await crop(p), "screenshot-3-setup.png");
  // A placeholder key (not a real credential): the popup only checks its format; the API call is served from sample-answer.json.
  await p.evaluate(() => chrome.storage.local.set({ apiKey: "kpl_screenshot_placeholder_000000000" }));
  await p.close();

  // 2: page text added from the right-click menu (the real storage.session hand-off), question typed.
  await sw.evaluate(({ text }) => chrome.storage.session.set({ pending: { kind: "page", text, url: "https://fieldnotes.example/four-day-week", at: Date.now() } }), { text: `${ARTICLE.title}\n\n${ARTICLE.body.join("\n\n")}` });
  p = await popup("?menu=1");
  await p.waitForSelector("#ctx:not([hidden])");
  await p.fill("#q", QUESTION);
  await frame(await crop(p), "screenshot-2-page-text.png");

  // 1: the answer.
  await p.click("#go");
  await p.waitForSelector("#result:not([hidden])");
  // After Ask the person reads the answer: scroll the popup so the result starts near the top, the way it looks in Chrome.
  await p.evaluate(() => document.getElementById("result").scrollIntoView({ block: "start" }));
  const answerShot = await crop(p);
  await frame(answerShot, "screenshot-1-answer.png");
  await p.close();

  for (const [w, h, file] of [[440, 280, "promo-small.png"], [1400, 560, "promo-marquee.png"]]) {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(promoHtml(w, h, w > 800 ? `data:image/png;base64,${answerShot.toString("base64")}` : ""));
    await page.screenshot({ path: join(OUT, file) });
    await page.close();
    console.log("wrote", file);
  }
} finally {
  await ctx.close();
  rmSync(dir, { recursive: true, force: true });
}
