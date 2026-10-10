import { test, expect, type Page } from "playwright/test";

test.skip(true, "Site Create UI removed; site-builder backend remains for Apps");

/**
 * Create > Preview: the Phone / Desktop toggle morphs one frame instead of jumping.
 * Samples the frame (and everything around it) every animation frame in the page, in both directions, at a desktop and a phone-sized viewport,
 * and again with prefers-reduced-motion (instant). Needs a built site, so it uses the fake model API like create-workspace.e2e.ts.
 * The last test covers the scaled-viewport sizing: Desktop is a true 1920x1080 viewport scaled by transform to fit the stage (margins, 16:9, never above 1),
 * Phone is 390x844, and the page inside still scrolls and takes clicks.
 */
let hop = 0;
async function signIn(page: Page, email: string) {
  const ctx = page.context();
  const h = { "content-type": "application/json", origin: `http://localhost:${process.env.E2E_PORT || 3199}`, "x-forwarded-for": `10.56.${(Date.now() >> 3) & 255}.${++hop}` };
  expect((await ctx.request.post("/api/auth/sign-in/magic-link", { headers: h, data: { email, callbackURL: "/app" } })).ok()).toBeTruthy();
  const html = await (await ctx.request.get("/dev/outbox")).text();
  const link = [...html.matchAll(/href="(http[^"]*token=[^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"))[0];
  expect(link).toBeTruthy();
  expect((await ctx.request.post("/api/auth/magic-link/confirm", { headers: h, data: { token: new URL(link).searchParams.get("token") } })).ok()).toBeTruthy();
  await ctx.request.post("/api/onboarding", { headers: { "content-type": "application/json", origin: h.origin }, data: { action: "complete", answers: { name: "Alex" } } });
}

async function buildSite(page: Page) {
  await page.goto("/app", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /reject non-essential/i }).click({ timeout: 4000 }).catch(() => undefined);
  await page.getByRole("button", { name: /^create( an? (?:app|site) or image)?$/i }).first().click();
  await page.getByRole("tab", { name: /^site$/i }).click(); // App is the default Create tab; these tests cover the site builder
  await page.waitForSelector("[data-testid=workspace]", { timeout: 30_000 });
  const box = page.locator("#ws-prompt");
  await box.fill("A site for Mill Lane Bakehouse, a neighborhood bakery with opening hours and a way to reserve a loaf");
  await box.press("Enter");
  await page.getByTestId("understand").getByRole("button", { name: /just build it/i }).click();
  const review = page.getByTestId("brief-review");
  await expect(review).toBeVisible({ timeout: 20_000 });
  await review.getByText("Edit details").click();
  const pages = review.getByLabel(/^Pages/);
  await pages.fill("Home, Menu, Contact");
  await pages.blur();
  await page.getByLabel("Test after build").uncheck();
  await review.getByRole("button", { name: /approve and build/i }).click();
  // the finished build shows up as the real preview (on a phone the preview is its own pane)
  if ((page.viewportSize()?.width ?? 1440) <= 860) await page.getByRole("group", { name: "Show" }).getByRole("button", { name: "Preview" }).click({ timeout: 3_000 }).catch(() => undefined); // the app may already have switched to the preview pane
  await expect(page.getByTestId("building")).toHaveCount(0, { timeout: 150_000 });
  await expect(page.locator("iframe[title^='Preview of']")).toBeVisible({ timeout: 30_000 });
}

/** The build, its repair pass and the dissolve are over: no build panel, and the preview frame has held one size and one page version for ~4 s. */
async function settle(page: Page) {
  let same = 0; let last = "";
  await expect.poll(async () => {
    const now = await page.evaluate(() => { const d = document.querySelector("[data-device]"); const r = d?.parentElement?.getBoundingClientRect(); return document.querySelector("[data-testid=building]") || !d || !r ? "busy" : [r.x, r.y, r.width, r.height, d.getBoundingClientRect().width, d.querySelector("iframe")?.getAttribute("src")].join(","); });
    same = now !== "busy" && now === last ? same + 1 : 0; last = now;
    return same;
  }, { timeout: 150_000, intervals: [300] }).toBeGreaterThanOrEqual(14); // ~4 s: long enough for the automatic repair pass to start and finish (it swaps in a new version of the page)
}

type Sample = { t: number; w: number; h: number; r: number; pad: number; ifw: number; ifh: number; area: string; stage: string; bar: string; scrollX: number; scrollY: number; pill: number; anims: string };

/** Click `label`, then record one sample per animation frame for `ms`. Everything is read in-page so a slow test runner can't miss frames. */
async function morph(page: Page, label: "Phone" | "Desktop", ms = 1400): Promise<Sample[]> {
  return page.evaluate(({ label, ms }) => new Promise<Sample[]>((resolve) => {
    const dev = document.querySelector<HTMLElement>("[data-device]")!;
    const ifr = dev.querySelector("iframe")!;
    const area = dev.parentElement!;
    const stage = area.closest("section")!;
    const bar = stage.querySelector<HTMLElement>("[role=group][aria-label=Frame]")!;
    const pillOf = () => new DOMMatrix(getComputedStyle(bar, "::before").transform).m41;
    const rect = (e: Element) => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map((n) => Math.round(n * 10) / 10).join(","); };
    const out: Sample[] = [];
    const t0 = performance.now();
    const read = () => {
      const cs = getComputedStyle(dev); const r = dev.getBoundingClientRect(); const f = ifr.getBoundingClientRect();
      out.push({ t: performance.now() - t0, w: r.width, h: r.height, r: parseFloat(cs.borderTopLeftRadius), pad: parseFloat(cs.paddingTop), ifw: f.width, ifh: f.height, area: rect(area), stage: rect(stage), bar: rect(bar.parentElement!), scrollX: area.scrollWidth - area.clientWidth, scrollY: area.scrollHeight - area.clientHeight, pill: pillOf(),
        anims: out.length ? "" : dev.getAnimations().filter((a) => a instanceof CSSTransition).map((a) => `${(a as CSSTransition).transitionProperty}:${a.effect?.getTiming().duration}`).join(" ") });
    };
    [...bar.querySelectorAll("button")].find((b) => b.textContent === label)!.click();
    const tick = () => { read(); if (performance.now() - t0 < ms) requestAnimationFrame(tick); else resolve(out); };
    requestAnimationFrame(tick);
  }), { label, ms });
}

const uniq = (xs: string[]) => [...new Set(xs)];

for (const vp of [{ name: "desktop", width: 1440, height: 900 }, { name: "mobile", width: 390, height: 844 }]) {
  test.describe(`${vp.name} viewport`, () => {
    test(`Phone / Desktop morphs smoothly both ways (${vp.name})`, async ({ page }) => {
      test.setTimeout(240_000);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await signIn(page, `dev.${vp.name}.${Date.now().toString(36)}@example.com`);
      await buildSite(page);
      await page.getByRole("tab", { name: /^preview$/i }).click();
      const frame = page.locator("iframe[title^='Preview of']");
      await expect(frame).toBeVisible();
      // the page selector keeps its value and the iframe is the very same element (no reload, so scroll position stays) across toggles
      await page.getByLabel("Page").selectOption("menu.html");
      await expect(frame).toHaveAttribute("src", /menu\.html/);
      await settle(page);
      const src = await frame.getAttribute("src");
      await page.evaluate(() => {
        const f = document.querySelector("iframe[title^='Preview of']") as HTMLIFrameElement & { __k?: number; __loads?: number };
        f.__k = 7; f.__loads = 0; f.addEventListener("load", () => { f.__loads! += 1; });
      });
      const dev = page.locator("[data-device]").first();
      const settled = async () => { await page.waitForTimeout(600); return dev.boundingBox(); };

      const deskBox = (await settled())!;
      const area0 = await page.locator("[data-device]").evaluate((e) => e.parentElement!.getBoundingClientRect().toJSON());
      expect(deskBox.width).toBeGreaterThan(Math.min(vp.width, 700) * 0.5);

      // Desktop -> Phone
      const toPhone = await morph(page, "Phone");
      const endPhone = toPhone[toPhone.length - 1];
      expect(endPhone.w).toBeLessThanOrEqual(390.5);
      expect(endPhone.w).toBeLessThan(deskBox.width - 1 > 390 ? deskBox.width : deskBox.width + 1);
      expect(Math.abs(endPhone.h / endPhone.w - 800 / 390) < 0.02 || endPhone.h <= area0.height + 1).toBeTruthy();
      expect(endPhone.r).toBeCloseTo(40, 0);
      expect(endPhone.pad).toBeCloseTo(7, 0);
      // real CSS transitions run on the frame: width, height, radius and the bezel padding, 350-450 ms
      for (const prop of deskBox.width - endPhone.w > 40 ? ["width", "height", "border-top-left-radius", "padding-top"] : ["height", "border-top-left-radius", "padding-top"]) {
        const m = toPhone[0].anims.match(new RegExp(`(?:^| )${prop}:(\\d+)`));
        expect(m, `${prop} transition (${toPhone[0].anims})`).not.toBeNull();
        expect(Number(m![1])).toBeGreaterThanOrEqual(350); expect(Number(m![1])).toBeLessThanOrEqual(450);
      }
      // in-between frames exist: strictly between the two ends, and the size changes gradually (no single-frame jump)
      const mid = toPhone.filter((s) => s.w < deskBox.width - 4 && s.w > endPhone.w + 4);
      if (deskBox.width - endPhone.w > 40) {
        expect(mid.length, "intermediate widths while shrinking").toBeGreaterThanOrEqual(1);
        const ws = toPhone.map((s) => s.w);
        for (let i = 1; i < ws.length; i++) expect(ws[i], "width never grows while shrinking").toBeLessThanOrEqual(ws[i - 1] + 0.5);
        expect(mid.some((s) => s.r > 14.5 && s.r < 39.5), "radius animates").toBe(true);
      }
      // the page inside is laid out once, at its final size; the frame clips it
      expect(uniq(toPhone.map((s) => `${Math.round(s.ifw)}x${Math.round(s.ifh)}`)).length, "iframe size is constant during the morph").toBe(1);
      // nothing around the frame moves, no scrollbars appear
      expect(uniq(toPhone.map((s) => s.area)).length).toBe(1);
      expect(uniq(toPhone.map((s) => s.stage)).length).toBe(1);
      expect(uniq(toPhone.map((s) => s.bar)).length).toBe(1);
      expect(Math.max(...toPhone.map((s) => s.scrollX))).toBeLessThanOrEqual(0);
      // the toggle's pill slides (not jumps) to the second... first cell
      const pills = toPhone.map((s) => s.pill);
      expect(pills[pills.length - 1]).toBeCloseTo(0, 0);
      expect(pills[0]).toBeGreaterThan(5);
      expect(pills.some((x) => x > 1 && x < pills[0] - 1), "pill passes through intermediate positions").toBe(true);
      await expect(page.getByRole("button", { name: "Phone", exact: true })).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByLabel("Page")).toHaveValue("menu.html");

      // Phone -> Desktop
      await page.waitForTimeout(200);
      const toDesk = await morph(page, "Desktop");
      const endDesk = toDesk[toDesk.length - 1];
      expect(Math.abs(endDesk.w - deskBox.width)).toBeLessThan(1);
      expect(Math.abs(endDesk.h - deskBox.height)).toBeLessThan(1);
      expect(endDesk.r).toBeCloseTo(14, 0);
      expect(endDesk.pad).toBeCloseTo(0, 0);
      if (deskBox.width - endPhone.w > 40) {
        expect(toDesk.filter((s) => s.w > endPhone.w + 4 && s.w < deskBox.width - 4).length, "intermediate widths while growing").toBeGreaterThanOrEqual(1);
        const ws = toDesk.map((s) => s.w);
        for (let i = 1; i < ws.length; i++) expect(ws[i], "width never shrinks while growing").toBeGreaterThanOrEqual(ws[i - 1] - 0.5);
      }
      expect(uniq(toDesk.map((s) => `${Math.round(s.ifw)}x${Math.round(s.ifh)}`)).length).toBe(1);
      expect(uniq(toDesk.map((s) => s.area)).length).toBe(1);
      expect(uniq(toDesk.map((s) => s.stage)).length).toBe(1);
      expect(Math.max(...toDesk.map((s) => s.scrollX))).toBeLessThanOrEqual(0);
      expect(toDesk[toDesk.length - 1].pill).toBeGreaterThan(5);

      // same iframe element, never reloaded, same page
      const kept = await page.evaluate(() => { const f = document.querySelector("iframe[title^='Preview of']") as HTMLIFrameElement & { __k?: number; __loads?: number }; return [f.__k, f.__loads]; });
      expect(kept).toEqual([7, 0]);
      expect(await frame.getAttribute("src")).toBe(src);
      expect(uniq(toPhone.map((s) => s.area)).concat(uniq(toDesk.map((s) => s.area)))).toHaveLength(2); // frame area never resized at all (one rect per direction)
      await page.screenshot({ path: `test-results/device-${vp.name}.png` });
    });

    test(`prefers-reduced-motion: the switch is instant (${vp.name})`, async ({ page }) => {
      test.setTimeout(240_000);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await signIn(page, `dev.rm.${vp.name}.${Date.now().toString(36)}@example.com`);
      await buildSite(page);
      await page.getByRole("tab", { name: /^preview$/i }).click();
      await expect(page.locator("iframe[title^='Preview of']")).toBeVisible();
      await settle(page);
      const toPhone = await morph(page, "Phone", 300);
      const widths = uniq(toPhone.map((s) => String(Math.round(s.w))));
      expect(widths.length, "no in-between widths").toBe(1);
      expect(toPhone[0].pill).toBeCloseTo(0, 0);
      const toDesk = await morph(page, "Desktop", 300);
      expect(uniq(toDesk.map((s) => String(Math.round(s.w)))).length).toBe(1);
      expect(toDesk[0].pill).toBeGreaterThan(5);
    });
  });
}

type Fit = { k: number; fw: number; fh: number; dev: { x: number; y: number; w: number; h: number }; area: { x: number; y: number; w: number; h: number }; scr: { w: number; h: number }; bar: number; areaScroll: [number, number]; stageScroll: [number, number]; docScrollX: number; transform: string; scale: string };

async function fit(page: Page): Promise<Fit> {
  return page.evaluate(() => {
    const dev = document.querySelector<HTMLElement>("[data-device]")!;
    const area = dev.parentElement!;
    const stage = area.closest("section")!;
    const ifr = dev.querySelector<HTMLElement>("iframe")!;
    const r = (e: Element) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
    const scr = dev.querySelector<HTMLElement>("iframe")!.parentElement!.getBoundingClientRect();
    return { k: Number(dev.dataset.scale), fw: ifr.offsetWidth, fh: ifr.offsetHeight, dev: r(dev), area: r(area), scr: { w: scr.width, h: scr.height }, bar: dev.querySelector<HTMLElement>("span:nth-of-type(2)")!.getBoundingClientRect().height,
      areaScroll: [area.scrollWidth - area.clientWidth, area.scrollHeight - area.clientHeight], stageScroll: [stage.scrollWidth - stage.clientWidth, stage.scrollHeight - stage.clientHeight], docScrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      transform: getComputedStyle(ifr).transform, scale: getComputedStyle(ifr).transformOrigin };
  });
}


test("Desktop preview is a true 1920x1080 viewport scaled to fit, with margins; Phone is 390x844; clicks and scroll work", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await signIn(page, `dev.fit.${Date.now().toString(36)}@example.com`);
  await buildSite(page);
  await page.getByRole("tab", { name: /^preview$/i }).click();
  const frame = page.locator("iframe[title^='Preview of']");
  await expect(frame).toBeVisible();
  await settle(page);
  await page.evaluate(() => { const f = document.querySelector("iframe[title^='Preview of']") as HTMLIFrameElement & { __loads?: number }; f.__loads = 0; f.addEventListener("load", () => { f.__loads! += 1; }); });
  const inner = async () => { const h = await frame.elementHandle(); const fr = (await h!.contentFrame())!; return fr.evaluate(() => [window.innerWidth, window.innerHeight]); };

  for (const w of [1920, 1440]) {
    await page.setViewportSize({ width: w, height: w === 1920 ? 1080 : 900 });
    await expect.poll(async () => (await page.locator("[data-device]").first().getAttribute("data-device")), { timeout: 5000 }).toBe("desktop");
    await page.waitForTimeout(500);
    const f = await fit(page);
    // the page inside really is 1920x1080 (layout size and what the page itself sees), only scaled by a transform
    expect([f.fw, f.fh], `iframe layout size at ${w}`).toEqual([1920, 1080]);
    expect(await inner(), `viewport the page sees at ${w}`).toEqual([1920, 1080]);
    expect(f.k).toBeGreaterThan(0.2);
    expect(f.k).toBeLessThanOrEqual(1);
    expect(f.transform).not.toBe("none");
    expect(f.scale).toBe("0px 0px");
    // 16:9 preserved, whole frame fits inside the stage area with visible margin on every side
    expect(Math.abs(f.scr.w / f.scr.h - 16 / 9)).toBeLessThan(0.01);
    expect(Math.abs(f.scr.w - 1920 * f.k)).toBeLessThan(1.5);
    expect(f.bar).toBeCloseTo(28, 0);
    const m = { l: f.dev.x - f.area.x, r: f.area.x + f.area.w - (f.dev.x + f.dev.w), t: f.dev.y - f.area.y, b: f.area.y + f.area.h - (f.dev.y + f.dev.h) };
    for (const [side, v] of Object.entries(m)) expect(v, `margin ${side} at ${w}`).toBeGreaterThanOrEqual(11.5);
    expect(Math.abs(m.l - m.r), "centered horizontally").toBeLessThan(2);
    expect(Math.abs(m.t - m.b), "centered vertically").toBeLessThan(2);
    // no scrollbars on the stage or the page
    expect(f.areaScroll[0]).toBeLessThanOrEqual(0); expect(f.areaScroll[1]).toBeLessThanOrEqual(0);
    expect(f.stageScroll[0]).toBeLessThanOrEqual(0); expect(f.stageScroll[1]).toBeLessThanOrEqual(0);
    expect(f.docScrollX).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `test-results/fit-desktop-${w}.png` });
  }

  // resizing the window re-scales the same frame: bigger container -> bigger scale (capped at 1), no reload
  const kSmall = (await fit(page)).k;
  await page.setViewportSize({ width: 1180, height: 760 });
  await expect.poll(async () => (await fit(page)).k, { timeout: 5000 }).toBeLessThan(kSmall);
  const mid = await fit(page);
  expect([mid.fw, mid.fh]).toEqual([1920, 1080]);
  expect(mid.areaScroll[0]).toBeLessThanOrEqual(0);

  // Phone: a 390x844 viewport, scaled to fit, bezel + rounded corners
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Phone", exact: true }).click();
  await page.waitForTimeout(900);
  const ph = await fit(page);
  expect([ph.fw, ph.fh]).toEqual([390, 844]);
  expect(await inner()).toEqual([390, 844]);
  expect(ph.k).toBeLessThanOrEqual(1);
  expect(Math.abs(ph.scr.w / ph.scr.h - 390 / 844)).toBeLessThan(0.01);
  expect(ph.dev.y - ph.area.y).toBeGreaterThanOrEqual(11.5);
  expect(ph.areaScroll[1]).toBeLessThanOrEqual(0);
  await page.screenshot({ path: "test-results/fit-phone-1440.png" });

  // Small screen: 390px wide, Desktop scales down to fit the width, Phone fits too, nothing overflows
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  for (const [label, dims] of [["Phone", [390, 844]], ["Desktop", [1920, 1080]]] as const) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await page.waitForTimeout(900);
    const s = await fit(page);
    expect([s.fw, s.fh], `${label} at 390`).toEqual(dims);
    expect(s.dev.x).toBeGreaterThanOrEqual(s.area.x + 7.5);
    expect(s.dev.x + s.dev.w).toBeLessThanOrEqual(s.area.x + s.area.w - 7.5);
    expect(s.dev.y + s.dev.h).toBeLessThanOrEqual(s.area.y + s.area.h + 0.5);
    expect(s.areaScroll[0]).toBeLessThanOrEqual(0); expect(s.areaScroll[1]).toBeLessThanOrEqual(0);
    expect(s.docScrollX).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `test-results/fit-${label.toLowerCase()}-390.png` });
  }

  // the iframe was never reloaded by any of that
  expect(await page.evaluate(() => (document.querySelector("iframe[title^='Preview of']") as HTMLIFrameElement & { __loads?: number }).__loads)).toBe(0);

  // clicks and scrolling still reach the scaled page: wheel scrolls it, and a real click on a link lands (Playwright checks the hit target through the transform)
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Desktop", exact: true }).click();
  await page.waitForTimeout(900);
  const fr = (await (await frame.elementHandle())!.contentFrame())!;
  const box = (await frame.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const tall = await fr.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 50);
  if (tall) {
    await page.mouse.wheel(0, 400);
    await expect.poll(() => fr.evaluate(() => window.scrollY), { timeout: 5000 }).toBeGreaterThan(0);
  }
  // a real mouse click in the middle of the screen reaches the page at the matching UNSCALED coordinates (the transform doesn't break hit-testing)
  await fr.evaluate(() => { (window as unknown as { __c: number[][] }).__c = []; document.addEventListener("click", (e) => (window as unknown as { __c: number[][] }).__c.push([Math.round(e.clientX), Math.round(e.clientY)]), true); });
  const f2 = await fit(page);
  const scr = (await frame.boundingBox())!;
  const cx = scr.x + scr.width * 0.5, cy = scr.y + scr.height * 0.25;
  await page.mouse.click(cx, cy);
  const clicks = await fr.evaluate(() => (window as unknown as { __c: number[][] }).__c);
  expect(clicks).toHaveLength(1);
  expect(Math.abs(clicks[0][0] - 960)).toBeLessThan(3);
  expect(Math.abs(clicks[0][1] - 270)).toBeLessThan(3);
  expect(f2.k).toBeLessThan(1);
});
