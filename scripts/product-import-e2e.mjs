// Real-browser test of product import in Create:
//   node scripts/product-import-e2e.mjs <baseUrl> --cookies <file.json> [--live <https product url>] [--build] [--shots <dir>]
// Needs a running Keplar server and the cookies of a signed-in Plus/Pro account (see tests/helpers/session.ts or scripts/e2e-server.sh).
// Covers: photo upload (file chooser), paste and drag-and-drop; the "Imported product" card (edit fields, choose photos and the hero,
// alt text, rights gate, buy modes, full-size viewer); friendly failure + manual entry; photo reading (vision) when a model key is
// configured; link import from a real page with --live; and with --build the approved brief builds a site with the product section,
// the hero photo and the Buy button.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const base = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--cookies" && args[args.indexOf(a) - 1] !== "--live" && args[args.indexOf(a) - 1] !== "--shots") || "http://localhost:3466";
const cookies = JSON.parse(fs.readFileSync(flag("--cookies"), "utf8"));
const live = flag("--live");
const BUILD = args.includes("--build");
const shots = flag("--shots") || "/tmp/product-import-shots";
fs.mkdirSync(shots, { recursive: true });

let bad = 0;
const ok = (c, m) => { console.log(c ? "ok  " : "FAIL", m); if (!c) bad++; };

// A real PNG (a 1200x900 gradient) built without dependencies.
function png(w, h, seed = 0) {
  const crc = (buf) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let r = 0xffffffff; for (const b of buf) r = t[(r ^ b) & 255] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = (x * 255 / w + seed * 40) & 255; raw[o + 1] = (y * 255 / h) & 255; raw[o + 2] = 140 + seed * 20; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const tmp = fs.mkdtempSync("/tmp/pi-e2e-");
const files = { a: path.join(tmp, "blue-mug.png"), b: path.join(tmp, "second.png"), c: path.join(tmp, "third.png"), svg: path.join(tmp, "x.svg") };
fs.writeFileSync(files.a, png(1200, 900, 0));
fs.writeFileSync(files.b, png(800, 800, 1));
fs.writeFileSync(files.c, png(900, 600, 2));
fs.writeFileSync(files.svg, '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const sizeOf = (f) => fs.statSync(f).size;

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--no-sandbox"] });
const run = async (name, viewport, scheme, fn) => {
  const ctx = await browser.newContext({ viewport, colorScheme: scheme, isMobile: viewport.width < 500, hasTouch: viewport.width < 500 });
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push("PAGEERR " + e.message.slice(0, 160)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 160)); });
  try { await fn(page); } catch (e) { ok(false, `${name}: threw ${String(e.message).split("\n")[0]}`); }
  ok(errs.length === 0, `${name}: no console or page errors${errs.length ? " " + JSON.stringify(errs) : ""}`);
  await ctx.close();
};

async function openCreate(page) {
  await page.goto(base + "/app", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2200);
  await page.getByRole("button", { name: /reject non-essential/i }).click({ timeout: 2500 }).catch(() => {});
  // Desktop has a "Create" tab; phones show the "Create a site or image" card.
  await page.getByRole("button", { name: /^create( a site or image)?$/i }).first().click();
  await page.waitForTimeout(1200);
  const newSite = page.getByRole("button", { name: /new site/i });
  if (await newSite.isVisible().catch(() => false)) await newSite.click();
  await page.getByRole("heading", { name: /start from a product/i }).waitFor({ timeout: 15000 });
}
const card = (page) => page.getByTestId("imported-product");

/* ── desktop, light: the start panel, upload, the card ── */
await run("desktop light", { width: 1280, height: 1000 }, "light", async (page) => {
  await openCreate(page);
  ok(await page.getByLabel("Product link").isVisible(), "start panel shows the link field");
  ok(await page.getByRole("button", { name: /add a product photo/i }).isVisible(), "start panel shows the photo drop zone");
  await page.screenshot({ path: `${shots}/01-start-light.png` });

  // Failure first: a private address gives a friendly message and the manual fallback, never a stack trace.
  await page.getByLabel("Product link").fill("https://169.254.169.254/latest/meta-data/");
  await page.getByRole("button", { name: /import from link/i }).click();
  const alert = page.getByRole("alert").filter({ hasText: /public web pages/i });
  await alert.waitFor({ timeout: 15000 });
  ok(/private or internal network/.test(await alert.innerText()), "private address: plain-language refusal");
  ok(await page.getByRole("button", { name: /enter details manually/i }).isVisible(), "failure offers manual entry");
  await page.screenshot({ path: `${shots}/02-failure.png` });
  await page.getByRole("button", { name: /dismiss/i }).click();

  // Unsupported file
  await page.locator('input[type=file]').first().setInputFiles(files.svg).catch(() => {});
  // SVG is filtered by the accept attribute in the picker, but the server must still refuse it: send it via drag-and-drop.
  await page.evaluate(async () => {
    const dt = new DataTransfer();
    dt.items.add(new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], "x.svg", { type: "image/svg+xml" }));
    document.querySelector('[aria-label^="Add a product photo"]').dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(600);
  ok(!(await card(page).isVisible().catch(() => false)), "no Imported product card for a non-image");
  await page.getByRole("button", { name: /dismiss/i }).click().catch(() => {});

  // Upload through the file chooser
  await page.locator('input[type=file]').first().setInputFiles(files.a);
  await card(page).waitFor({ timeout: 20000 });
  ok(true, "photo upload opens the Imported product card");
  const img = card(page).locator("img").first();
  await img.waitFor();
  await page.waitForFunction(() => { const i = document.querySelector('[data-testid="imported-product"] img'); return i && i.complete && i.naturalWidth > 0; });
  const nat = await img.evaluate((i) => [i.naturalWidth, i.naturalHeight]);
  ok(nat[0] === 1200 && nat[1] === 900, `stored photo served back at its original size (${nat.join("×")})`);
  ok(/original quality/.test(await card(page).innerText()), "card says the photo is stored at original quality");
  ok(/hotlinked|aren.t hotlinked/.test(await card(page).innerText()), "card says images are copied to Keplar storage, not hotlinked");
  ok(/permission to use them|rights/i.test(await card(page).innerText()), "card shows the rights / copyright note");
  await page.screenshot({ path: `${shots}/03-card-top.png`, fullPage: true });

  // The rights gate
  const cont = page.getByRole("button", { name: /looks right, ask me a few questions/i });
  await card(page).getByLabel("Product name").fill("Blue Mug");
  ok(await cont.isDisabled(), "Continue is disabled until the photo rights are confirmed");
  await card(page).getByLabel(/own these photos or have permission/i).check();
  ok(await cont.isEnabled(), "Continue enables after the rights box is ticked");

  // Edit fields, photos, hero, alt
  await card(page).getByLabel(/^Brand/).fill("Kiln & Co");
  await card(page).getByLabel("Description").fill("A 350 ml stoneware mug.");
  await card(page).getByLabel(/Features, one per line/).fill("Dishwasher safe\nMicrowave safe");
  await card(page).getByLabel(/^Price/).fill("24.00");
  await card(page).getByLabel("Currency").fill("usd");
  ok((await card(page).getByLabel("Currency").inputValue()) === "USD", "currency is upper-cased");
  await card(page).getByLabel("Alt text for this photo").first().fill("A blue mug on a wooden table");
  // add two more photos
  await card(page).getByRole("button", { name: /add a photo/i }).click().catch(() => {});
  await card(page).locator('input[type=file]').setInputFiles(files.b);
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="imported-product"] li img').length >= 2, null, { timeout: 15000 });
  await card(page).locator('input[type=file]').setInputFiles(files.c);
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="imported-product"] li img').length >= 3, null, { timeout: 15000 });
  const tiles = await card(page).locator("ul li").count();
  ok(tiles === 3, "three photos shown as selectable tiles");
  // choose the second photo as hero
  await card(page).getByLabel("Hero photo").nth(1).check();
  ok(await card(page).getByLabel("Hero photo").nth(1).isChecked(), "hero can be changed");
  // unselect the third
  await card(page).getByLabel("Use this photo").nth(2).uncheck();
  ok(/2 of \d+ selected/i.test(await card(page).innerText()), "photo selection count follows the checkboxes");
  // viewer
  await card(page).getByRole("button", { name: /view photo at full size/i }).first().click();
  const dlg = page.getByRole("dialog");
  await dlg.waitFor({ timeout: 5000 });
  await page.waitForTimeout(500);
  const lb = await dlg.locator("img").evaluate((i) => [i.naturalWidth, i.naturalHeight]);
  ok(lb[0] >= 800, `full-size viewer shows the real image (${lb.join("×")})`);
  await page.keyboard.press("Escape");
  // buy modes
  await card(page).getByRole("button", { name: "Inquiry button" }).click();
  ok(/contact form/i.test(await card(page).innerText()), "inquiry mode explained");
  await card(page).getByRole("button", { name: "Link to a product or checkout page" }).click();
  ok(!(await cont.isEnabled()), "link mode without an address blocks Continue");
  await card(page).getByLabel("Buy button address").fill("https://buy.stripe.com/test_123");
  ok(await cont.isEnabled(), "a Stripe payment link is accepted as the Buy address");
  await page.screenshot({ path: `${shots}/04-card-edited.png`, fullPage: true });

  // Vision: suggest details (real model call when the server has a key; accepted gracefully either way)
  await card(page).getByLabel("Product name").fill("");
  await card(page).getByRole("button", { name: /suggest details from this photo/i }).first().click();
  await page.waitForFunction(() => /Filled in|Suggested alt|Couldn.t read|isn.t available|busy/i.test(document.querySelector('[data-testid="imported-product"]').innerText), null, { timeout: 90000 });
  const vtxt = await card(page).innerText();
  const gotVision = /Filled in/.test(vtxt);
  console.log("note vision:", gotVision ? "model filled fields" : "model unavailable/unreadable: " + (vtxt.match(/(Couldn.t read[^.]*\.|isn.t available[^.]*\.|[^.]*busy[^.]*\.)/i)?.[0] ?? "?"));
  if (gotVision) ok((await card(page).getByLabel("Product name").inputValue()).length > 2, "vision suggestion filled the empty name (editable)");
  await card(page).getByLabel("Product name").fill("Blue Mug");

  // Discovery: questions are about the page, pre-filled from the product
  await cont.click();
  await page.waitForSelector("text=/Question 1 of/");
  const qtxt = await page.locator("h3").filter({ hasText: /What should visitors do/ }).innerText();
  ok(/Blue Mug/.test(qtxt), "first question names the product");
  ok(await page.getByRole("button", { name: "Buy on the original product page" }).isVisible(), "Buy question's first choice follows the card's Buy setting");
  await page.screenshot({ path: `${shots}/05-question.png` });
  for (let i = 0; i < 8; i++) {
    if (!(await page.locator("text=/Question \\d+ of \\d+/").first().isVisible().catch(() => false))) break;
    await page.getByRole("button", { name: /^(next|see the brief)$/i }).first().click();
    await page.waitForTimeout(250);
  }
  await page.waitForSelector("text=/Here.s the brief/", { timeout: 20000 });
  ok(await card(page).isVisible(), "the review step shows the Imported product card too (still editable)");
  ok((await page.getByLabel("Goal of the site").inputValue()) !== "", "brief goal is pre-filled from the product");
  ok(/Blue Mug/.test(await page.getByLabel("What it is").inputValue()), "brief 'what it is' is pre-filled from the product");
  await page.screenshot({ path: `${shots}/06-review.png`, fullPage: true });

  if (BUILD) {
    const before = new Set(await page.evaluate(async () => (await (await fetch("/api/sites")).json()).sites.map((x) => x.id)));
    await page.getByRole("button", { name: /approve and build/i }).click();
    const t0 = Date.now();
    // The build streams in the background; poll the API until the newest site has a saved version.
    let siteId = null;
    for (let i = 0; i < 140; i++) {
      const list = await page.evaluate(async () => (await (await fetch("/api/sites")).json()).sites);
      const fresh = list.filter((x) => !before.has(x.id)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]; // the site this run created
      if (fresh?.headVersion >= 1) { siteId = fresh.id; break; }
      await page.waitForTimeout(2000);
    }
    ok(Boolean(siteId), "the build finished and saved a version");
    console.log("build took", Math.round((Date.now() - t0) / 1000), "s");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${shots}/07-built.png`, fullPage: true });
    const detail = await page.evaluate(async (id) => await (await fetch(`/api/sites/${id}`)).json(), siteId);
    const html = detail.files["index.html"] ?? "";
    ok(/id="product"/.test(html), "built site has a #product section");
    ok(/https:\/\/keplar\.one\/i\/[a-f0-9]{32}/.test(html), "built site uses the hero photo from Keplar storage");
    ok(/href="https:\/\/buy\.stripe\.com\/test_123"/.test(html), "built site's Buy button goes to the address from the card");
    ok(!/\$\s?\d/.test(html.replace(/\$24(\.00)?/g, "")), "no price other than the one entered");
    ok(/alt="[^"]+"/.test(html), "hero image has alt text");
    ok(!/images\.unsplash|picsum|placehold/.test(html), "no hotlinked stock images");
    console.log("site", siteId);
  }
});

/* ── paste (clipboard image) and manual entry, dark, mobile ── */
await run("mobile dark", { width: 390, height: 844 }, "dark", async (page) => {
  await openCreate(page);
  await page.screenshot({ path: `${shots}/08-start-mobile-dark.png`, fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  ok(!overflow, "mobile: no horizontal overflow on the start panel");
  // paste an image from the clipboard
  await page.evaluate(async (b64) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bin], "pasted.png", { type: "image/png" }));
    document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, png(700, 500, 3).toString("base64"));
  await card(page).waitFor({ timeout: 20000 });
  ok(true, "pasting an image from the clipboard imports it");
  await page.waitForFunction(() => { const i = document.querySelector('[data-testid="imported-product"] img'); return i && i.complete && i.naturalWidth === 700; });
  await page.screenshot({ path: `${shots}/09-card-mobile-dark.png`, fullPage: true });
  const o2 = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  ok(!o2, "mobile: no horizontal overflow on the card");
  // remove deletes the staged photo and returns to the start
  const id = await card(page).locator("img").first().evaluate((i) => i.getAttribute("src").split("/").pop());
  await card(page).getByRole("button", { name: /^remove$/i }).click();
  await page.getByRole("heading", { name: /start from a product/i }).waitFor();
  await page.waitForTimeout(500);
  const status = await page.evaluate(async (i) => (await fetch(`/api/sites/assets/${i}`)).status, id);
  ok(status === 404, "Remove discards the staged photo from storage");
  // manual path
  await page.getByLabel("Product link").fill("https://127.0.0.1:8080/x");
  await page.getByRole("button", { name: /import from link/i }).click();
  await page.getByRole("button", { name: /enter details manually/i }).click();
  await card(page).waitFor();
  ok(/Entered by you/.test(await card(page).innerText()), "manual entry opens an empty editable card");
  ok(await page.getByRole("button", { name: /looks right/i }).isDisabled(), "empty manual card can't continue (needs a name)");
});

/* ── real page (optional) ── */
if (live) {
  await run("live link", { width: 1280, height: 1000 }, "light", async (page) => {
    await openCreate(page);
    await page.getByLabel("Product link").fill(live);
    await page.getByRole("button", { name: /import from link/i }).click();
    await card(page).waitFor({ timeout: 90000 });
    const t = await card(page).innerText();
    ok(/From /.test(t), `live: card created from ${live}`);
    const name = await card(page).getByLabel("Product name").inputValue();
    ok(name.length > 2, `live: product name found ("${name}")`);
    const nimg = await card(page).locator("li img").count();
    console.log("live: photos found", nimg, "| price", JSON.stringify(await card(page).getByLabel(/^Price/).inputValue()), JSON.stringify(await card(page).getByLabel("Currency").inputValue()));
    ok(nimg >= 1, "live: at least one photo copied to Keplar storage");
    const srcs = await card(page).locator("li img").evaluateAll((l) => l.map((i) => i.getAttribute("src")));
    ok(srcs.every((s) => s.startsWith("/api/sites/assets/")), "live: photos are served from Keplar, not the shop");
    ok(!(await card(page).getByLabel(/own these photos/i).isChecked()), "live: rights box starts unticked");
    await page.screenshot({ path: `${shots}/10-live-card.png`, fullPage: true });
  });
}

await browser.close();
console.log(bad ? `\n${bad} FAILED` : "\nall passed");
process.exit(bad ? 1 : 0);
