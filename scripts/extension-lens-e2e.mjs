#!/usr/bin/env node
/**
 * Keplar Lens end to end, in a real browser: consent once, drag an area, the search sends the words and a JPEG of the area,
 * the answer appears in the side panel, a follow-up sends the earlier turns; hovering outlines a picture or card and a click
 * searches just that, like Google Lens. Also writes screenshots of each step.
 *
 * Opening Lens needs the person's click on the menu (activeTab), which automation can't give. So this loads a COPY of the
 * extension with host access added for the test page only; the shipped manifest is never changed. The API is served from
 * extension/store/sample-answer.json (a real keplar.one answer), and every request body is checked.
 * Run: KEPLAR_SHOTS_CHANNEL=msedge node scripts/extension-lens-e2e.mjs [outDir]
 */
import { chromium } from "playwright";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";

const EXT = resolve("extension");
const OUT = resolve(process.argv[2] || join(tmpdir(), "keplar-lens-e2e"));
mkdirSync(OUT, { recursive: true });
const sample = JSON.parse(readFileSync(join(EXT, "store", "sample-answer.json"), "utf8")).answer;

const work = mkdtempSync(join(tmpdir(), "keplar-lens-ext-"));
const copy = join(work, "extension");
cpSync(EXT, copy, { recursive: true, filter: (p) => !/[\\/](dist|store|tools)([\\/]|$)/.test(p) });
const manifest = JSON.parse(readFileSync(join(copy, "manifest.json"), "utf8"));
manifest.host_permissions = ["<all_urls>"]; // test copy only: stands in for the activeTab grant a real menu click gives (tab capture needs one)
writeFileSync(join(copy, "manifest.json"), JSON.stringify(manifest, null, 2));

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Lens test</title><style>
body{margin:0;font:18px/1.6 Georgia,serif;background:#fbfaf7;color:#222}main{max-width:760px;margin:60px auto;padding:0 24px}
h1{font-size:40px;margin:0 0 18px}.card{display:flex;gap:18px;align-items:center;margin:24px 0;padding:18px;border-radius:14px;background:#fff;box-shadow:0 0 0 1px #e6e2da}
.swatch{width:120px;height:90px;border-radius:10px;background:linear-gradient(135deg,#ff9f7a,#c8c4bc)}</style></head><body><main>
<h1>The four-day week, two years in</h1>
<p>Several small companies that moved to a four-day, 32-hour week report steady output and lower staff turnover.</p>
<div class="card" id="card"><div class="swatch"></div><p>Critics point out that most trials are short, self-selected and run by firms already doing well.</p></div>
<p>Results depend on whether work is redesigned or simply squeezed into fewer days.</p>
</main></body></html>`;

const bodies = [];
const userData = join(work, "profile");
const ctx = await chromium.launchPersistentContext(userData, {
  channel: process.env.KEPLAR_SHOTS_CHANNEL || "chromium",
  headless: true,
  viewport: { width: 1280, height: 800 },
  // Software rendering: headless GPU readback fails ("image readback failed"), which tab capture needs.
  args: [`--disable-extensions-except=${copy}`, `--load-extension=${copy}`, "--use-angle=swiftshader", "--use-gl=angle"],
});
try {
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
  await ctx.route("https://lens.test/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: PAGE }));
  await ctx.route("https://keplar.one/api/v1/ask", async (r) => {
    bodies.push(JSON.parse(r.request().postData() || "{}"));
    await r.fulfill({ status: 200, headers: { "content-type": "text/event-stream" }, body: `event: progress\ndata: {"stage":"comparing"}\n\nevent: answer\ndata: ${JSON.stringify(sample)}\n\n` });
  });
  await sw.evaluate(() => chrome.storage.local.set({ apiKey: "kpl_screenshot_placeholder_000000000" }));

  const page = await ctx.newPage();
  await page.goto("https://lens.test/article");
  const open = () => sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: "https://lens.test/*" });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["lens.js"] });
  });

  // 1. First use: the consent card, and nothing sent.
  await open();
  await page.waitForSelector("#keplar-lens-host >> .consent:not([hidden])");
  await page.screenshot({ path: join(OUT, "1-consent.png") });
  assert.equal(bodies.length, 0, "nothing is sent before the person agrees");
  await page.click("#keplar-lens-host >> .consent .primary");
  await page.waitForSelector("#keplar-lens-host >> .pill:not([hidden])");
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, "2-select.png") });

  // 2. Drag over the card: the search runs on its own and the answer lands in the side panel.
  const box = await page.locator("#card").boundingBox();
  await page.mouse.move(box.x - 8, box.y - 8);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 6 });
  await page.mouse.move(box.x + box.width + 8, box.y + box.height + 8, { steps: 6 });
  await page.screenshot({ path: join(OUT, "3-dragging.png") });
  await page.mouse.up();
  await page.waitForSelector("#keplar-lens-host >> .turn");
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, "4-answer.png") });

  assert.equal(bodies.length, 1);
  const first = bodies[0];
  assert.match(first.question, /self-selected/, "the words inside the area are sent");
  assert.match(first.image?.data_url ?? "", /^data:image\/jpeg;base64,/, "a JPEG of the area is sent");
  assert.ok(first.image.width > 100 && first.image.height > 50, `image ${first.image.width}x${first.image.height}`);
  assert.ok(first.image.data_url.length < 2_800_000, "within the API's image limit");
  assert.equal(first.history, undefined, "a new search has no history");
  assert.equal(first.stream, true);

  // 3. A follow-up carries the earlier turns and the same area.
  await page.fill("#keplar-lens-host >> form input", "Which side has better evidence?");
  await page.press("#keplar-lens-host >> form input", "Enter");
  await page.waitForFunction(() => document.getElementById("keplar-lens-host")?.shadowRoot?.querySelectorAll(".turn").length === 2);
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, "5-follow-up.png") });
  assert.equal(bodies.length, 2);
  assert.equal(bodies[1].history?.length, 2, "user + assistant turn");
  assert.equal(bodies[1].history[1].role, "assistant");
  assert.ok(bodies[1].image?.data_url, "the follow-up still has the picture");
  assert.match(bodies[1].question, /Which side has better evidence\?/);

  // 4. Click to search, like Google Lens: hovering outlines what a click would choose; a click searches it, no drag needed.
  const lens = (sel) => page.locator(`#keplar-lens-host >> ${sel}`);
  const near = (a, b, what) => assert.ok(Math.abs(a - b) <= 4, `${what}: ${a} vs ${b}`);
  const swatch = await page.locator(".swatch").boundingBox();
  await page.mouse.move(swatch.x + 20, swatch.y + 20, { steps: 4 });
  await page.waitForSelector("#keplar-lens-host >> .hint:not([hidden])");
  await page.waitForTimeout(250); // the outline follows the pointer once per frame
  const hintBox = await lens(".hint").boundingBox();
  near(hintBox.width, swatch.width + 6, "the outline sits around the picture (width)");
  near(hintBox.height, swatch.height + 6, "the outline sits around the picture (height)");
  await page.mouse.click(swatch.x + swatch.width / 2, swatch.y + swatch.height / 2);
  await page.waitForFunction(() => document.getElementById("keplar-lens-host")?.shadowRoot?.querySelectorAll(".turn").length === 1);
  assert.equal(bodies.length, 3, "one click, one search");
  near(bodies[2].image?.width, swatch.width, "only the picture is sent (width)");
  near(bodies[2].image?.height, swatch.height, "only the picture is sent (height)");
  assert.match(bodies[2].question, /What is in this picture\?/, "a picture with no words in it");
  assert.equal(bodies[2].history, undefined, "a new choice starts a new search");

  // The words of a card: the whole card is chosen (as Lens picks a tile), not the paragraph and not the page.
  const words = await page.locator("#card p").boundingBox();
  await page.mouse.move(words.x + 30, words.y + 8, { steps: 4 });
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(OUT, "6-hover.png") });
  await page.mouse.click(words.x + 30, words.y + 8);
  for (let i = 0; i < 80 && bodies.length < 4; i++) await page.waitForTimeout(100);
  assert.equal(bodies.length, 4);
  assert.match(bodies[3].question, /self-selected/, "the card's words are sent");
  assert.doesNotMatch(bodies[3].question, /32-hour|redesigned/, "nothing outside the card");
  near(bodies[3].image?.width, box.width, "the picture is the card (width)");
  near(bodies[3].image?.height, box.height, "the picture is the card (height)");
  await page.waitForSelector("#keplar-lens-host >> .turn");
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, "7-clicked-card.png") });

  // A click on empty page chooses nothing and sends nothing; the drag above still worked the old way.
  await page.mouse.click(20, 760);
  await page.waitForTimeout(400);
  assert.equal(bodies.length, 4, "an empty click sends nothing");
  assert.equal(await lens(".frame:not([hidden])").count(), 0, "and clears the choice");

  // 5. Second time Lens opens: no consent card (agreed once).
  await page.keyboard.press("Escape");
  await open();
  await page.waitForSelector("#keplar-lens-host >> .pill:not([hidden])");
  assert.equal(await page.locator("#keplar-lens-host >> .consent:not([hidden])").count(), 0, "consent is asked once");
  console.log("lens e2e passed; screenshots in", OUT);
} finally {
  await ctx.close();
  rmSync(work, { recursive: true, force: true });
}
