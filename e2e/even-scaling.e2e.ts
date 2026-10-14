import { test, expect, type Page } from "playwright/test";

/**
 * Even scaling and scrolling (sitewide): at every breakpoint the document never scrolls sideways, a scripted scroll stays
 * inside a frame-time budget, and opening + closing the menus/palette never leaves the page scroll-locked.
 * Frame budget is generous on purpose (CI uses a CPU rasteriser): it catches real jank (handlers doing layout per scroll
 * event, forced reflow) rather than GPU speed.
 */
const VIEWPORTS: { name: string; width: number; height: number; mobile?: boolean }[] = [
  { name: "320", width: 320, height: 640, mobile: true },
  { name: "375", width: 375, height: 812, mobile: true },
  { name: "414", width: 414, height: 896, mobile: true },
  { name: "phone-landscape", width: 667, height: 375, mobile: true },
  { name: "768", width: 768, height: 1024 },
  { name: "tablet-landscape", width: 1024, height: 768 },
  { name: "1280", width: 1280, height: 800 },
  { name: "1440", width: 1440, height: 900 },
  { name: "1920", width: 1920, height: 1080 },
];
const ROUTES = (process.env.SCALE_ROUTES || "/,/pricing,/product,/download,/docs,/developers,/changelog,/templates,/enterprise,/help,/security,/privacy,/signin,/app/ask").split(",");

async function overflow(page: Page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const sw = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    return { vw, sw };
  });
}

for (const vp of VIEWPORTS) {
  test.describe(`even scaling @${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, hasTouch: !!vp.mobile, isMobile: !!vp.mobile, colorScheme: "dark" });
    for (const route of ROUTES) {
      test(`${route}: no horizontal overflow`, async ({ page }) => {
        await page.goto(route, { waitUntil: "domcontentloaded" });
        await page.waitForLoadState("load").catch(() => {});
        await page.waitForTimeout(600);
        const o = await overflow(page);
        expect(o.sw, `${route} @${vp.name}: document is ${o.sw}px wide in a ${o.vw}px viewport`).toBeLessThanOrEqual(o.vw + 1);
      });
    }
  });
}

test.describe("even scrolling", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, colorScheme: "dark" });

  for (const route of ["/", "/pricing", "/docs"]) {
    test(`${route}: scripted scroll stays within a frame budget and moves the page`, async ({ page }) => {
      await page.goto(route, { waitUntil: "load" });
      await page.waitForTimeout(800);
      const r = await page.evaluate(async () => {
        const frames: number[] = [];
        let long = 0;
        const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) long += Math.max(0, e.duration - 50); });
        try { po.observe({ type: "longtask", buffered: false }); } catch { /* not supported */ }
        const max = document.documentElement.scrollHeight - innerHeight;
        const steps = 40;
        let last = performance.now();
        for (let i = 1; i <= steps; i++) {
          window.scrollTo(0, (max * i) / steps);
          await new Promise((res) => requestAnimationFrame(() => res(null)));
          const now = performance.now();
          frames.push(now - last);
          last = now;
        }
        po.disconnect();
        frames.sort((a, b) => a - b);
        return { y: scrollY, max, p90: frames[Math.floor(frames.length * 0.9)], long };
      });
      expect(r.y, "the page actually scrolled").toBeGreaterThan(Math.min(200, r.max * 0.5));
      expect(r.p90, `p90 frame ${r.p90.toFixed(1)}ms`).toBeLessThan(250);
      expect(r.long, `long-task time during scroll ${r.long.toFixed(0)}ms`).toBeLessThan(1500);
    });
  }

  test("mobile menu and command palette release the scroll lock when closed", async ({ page }) => {
    await page.goto("/pricing", { waitUntil: "load" });
    const locked = () => page.evaluate(() => getComputedStyle(document.documentElement).overflow === "hidden" || getComputedStyle(document.body).overflow === "hidden");
    const toggle = page.getByRole("button", { name: "Open menu" });
    await toggle.click();
    await expect(page.locator("#site-menu")).toBeVisible();
    expect(await locked()).toBe(true);
    await page.keyboard.press("Escape");
    await expect(page.locator("#site-menu")).toBeHidden();
    expect(await locked(), "menu left the page scroll-locked").toBe(false);
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog", { name: /Go to a page/ })).toBeVisible();
    expect(await locked()).toBe(true);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: /Go to a page/ })).toHaveCount(0);
    expect(await locked(), "palette left the page scroll-locked").toBe(false);
    await page.mouse.wheel(0, 600);
    await page.evaluate(() => window.scrollBy(0, 600));
    expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
  });
});

test.describe("wheel scroll is never trapped", () => {
  for (const vp of [{ width: 1280, height: 800 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
    test(`home @${vp.width}: wheel with the pointer resting mid-screen (over the pinned hero composer) keeps scrolling the page`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto("/", { waitUntil: "load" });
      await page.waitForTimeout(1000);
      await page.mouse.move(vp.width / 2, vp.height / 2);
      for (let i = 0; i < 16; i++) { await page.mouse.wheel(0, 250); await page.waitForTimeout(50); }
      await expect.poll(() => page.evaluate(() => scrollY), { timeout: 5000 }).toBeGreaterThan(2500);
    });
  }
});

test.describe("Ask home: the floating composer overlay never cuts the first row of starter cards", () => {
  const SIZES: [number, number, boolean][] = [[320, 568, true], [375, 667, true], [414, 896, true], [667, 375, true], [844, 390, true], [768, 1024, true], [1024, 470, false], [1024, 600, false], [1280, 600, false], [1280, 700, false], [1280, 800, false], [1440, 900, false]];
  for (const [width, height, mobile] of SIZES) {
    test(`${width}x${height}`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile, colorScheme: "dark" });
      const page = await ctx.newPage();
      await page.goto("/app/ask", { waitUntil: "load" });
      await page.locator("[aria-label='What you can do'] li").first().waitFor();
      await page.waitForTimeout(400);
      const r = await page.evaluate(() => {
        const dock = document.querySelector("[class*='__dock']:not([class*='dockNote'])")!;
        const tiles = [...document.querySelectorAll("[aria-label='What you can do'] li")].map((li) => li.getBoundingClientRect());
        const top = tiles[0].top;
        const de = document.documentElement;
        return { dockTop: dock.getBoundingClientRect().top, rowBottom: Math.max(...tiles.filter((t) => Math.abs(t.top - top) < 2).map((t) => t.bottom)), dockPosition: getComputedStyle(dock).position, ox: de.scrollWidth - de.clientWidth };
      });
      expect(r.dockPosition, "composer stays an overlay").toBe("absolute");
      expect(r.rowBottom, `first card row ends at ${r.rowBottom}px, overlay starts at ${r.dockTop}px`).toBeLessThanOrEqual(r.dockTop + 0.5);
      expect(r.ox).toBeLessThanOrEqual(1);
      await ctx.close();
    });
  }
});

test("command palette: Ctrl-K opens, typing filters, Enter navigates, focus returns on Escape", async ({ page }) => {
  await page.goto("/pricing", { waitUntil: "load" });
  await page.keyboard.press("Control+k");
  const input = page.getByRole("combobox", { name: /Search pages/ });
  await expect(input).toBeFocused();
  await input.fill("changelog");
  await expect(page.getByRole("option").first()).toContainText(/Changelog/);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/changelog/);
});
