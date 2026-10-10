import { test, expect, type Page } from "playwright/test";

test.skip(true, "Site Create UI removed; site-builder backend remains for Apps");

/**
 * The Create workspace follows the app theme: the sidebar switcher (Dark / Light / Auto) and the OS preference in Auto.
 * Checked in a real browser: the workspace's own canvas flips with the page, text keeps contrast against it, rendered pixels in the
 * three columns are dark/light as expected, the switch applies live (no reload), nothing is blue, and no text spills out of its frame.
 */
let hop = 0;
async function signIn(page: Page, email: string) {
  const ctx = page.context();
  const h = { "content-type": "application/json", origin: `http://localhost:${process.env.E2E_PORT || 3199}`, "x-forwarded-for": `10.55.${(Date.now() >> 3) & 255}.${++hop}` };
  expect((await ctx.request.post("/api/auth/sign-in/magic-link", { headers: h, data: { email, callbackURL: "/app" } })).ok()).toBeTruthy();
  const html = await (await ctx.request.get("/dev/outbox")).text();
  const link = [...html.matchAll(/href="(http[^"]*token=[^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"))[0];
  expect(link).toBeTruthy();
  expect((await ctx.request.post("/api/auth/magic-link/confirm", { headers: h, data: { token: new URL(link).searchParams.get("token") } })).ok()).toBeTruthy();
  await ctx.request.post("/api/onboarding", { headers: { "content-type": "application/json", origin: h.origin }, data: { action: "complete", answers: { name: "Alex" } } });
}

async function openCreate(page: Page) {
  await page.goto("/app", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /reject non-essential/i }).click({ timeout: 4000 }).catch(() => undefined);
  await page.getByRole("button", { name: /^create( an? (?:app|site) or image)?$/i }).first().click();
  await page.getByRole("tab", { name: /^site$/i }).click(); // App is the default Create tab; these tests cover the site builder
  await page.waitForSelector("[data-testid=workspace]", { timeout: 30_000 });
}


const nums = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number);
const lum = (c: string) => {
  const [r, g, b] = nums(c).slice(0, 3).map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

async function choose(page: Page, id: "Dark" | "Light" | "Auto") {
  await page.getByRole("radiogroup", { name: "Theme" }).getByRole("radio", { name: new RegExp(`^${id}`, "i") }).click();
}

/** mean luminance (0..1) of what is actually painted inside a region of the workspace */
async function paintedLuminance(page: Page, testid: string) {
  const el = page.getByRole("region", { name: testid });
  const box = (await el.boundingBox())!;
  const png = await page.screenshot({ clip: { x: box.x + 4, y: box.y + 4, width: Math.min(box.width - 8, 300), height: Math.min(box.height - 8, 200) } });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = "data:image/png;base64," + b64;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const x = c.getContext("2d")!;
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
    return s / (d.length / 4);
  }, png.toString("base64"));
}

async function audit(page: Page, expectDark: boolean) {
  const html = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  expect(html).toBe(expectDark ? "dark" : "light");
  const ws = page.locator("[data-testid=workspace]");
  await expect(ws).toBeVisible();
  const vars = await ws.evaluate((e) => {
    const cs = getComputedStyle(e);
    return { canvas: cs.getPropertyValue("--c-canvas").trim(), ink: cs.getPropertyValue("--c-ink").trim(), ink2: cs.getPropertyValue("--c-ink-2").trim(), ink3: cs.getPropertyValue("--c-ink-3").trim(), scheme: cs.colorScheme };
  });
  const toRgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };
  const canvas = toRgb(vars.canvas);
  expect(lum(canvas) < 0.1, `canvas ${vars.canvas}`).toBe(expectDark);
  if (expectDark) expect(vars.canvas.toLowerCase()).toBe("#0b0b0d"); // the original dark, not pure black
  const font = await ws.evaluate((e) => getComputedStyle(e).fontFamily);
  expect(font, "workspace font").not.toMatch(/Lexend/i);
  expect(font, "workspace font").toMatch(/google[ _]?sans/i);
  expect(vars.scheme).toBe(expectDark ? "dark" : "light");
  expect(contrast(toRgb(vars.ink), canvas)).toBeGreaterThan(12);
  expect(contrast(toRgb(vars.ink2), canvas)).toBeGreaterThan(7);
  expect(contrast(toRgb(vars.ink3), canvas)).toBeGreaterThan(4.5);
  // real text in the three columns uses those inks and stays readable on the workspace canvas
  for (const text of [page.getByRole("region", { name: "Conversation" }).locator("h2").first(), page.getByRole("navigation", { name: "Projects" }).getByRole("button", { name: /new chat/i })]) {
    const [color, bgc] = await text.evaluate((e) => { const cs = getComputedStyle(e); return [cs.color, cs.backgroundImage !== "none" ? (cs.backgroundImage.match(/rgb\([^)]*\)/) ?? [""])[0] : cs.backgroundColor]; });
    const under = !bgc || /, 0\)$/.test(bgc) || bgc === "rgba(0, 0, 0, 0)" ? canvas : bgc;
    expect(contrast(color, under), `${color} on ${under}`).toBeGreaterThan(4.5);
  }
  // what is actually painted: dark theme paints dark columns, light theme paints light ones
  for (const region of ["Conversation", "Preview and library"]) {
    const l = await paintedLuminance(page, region);
    if (expectDark) { expect(l, `${region} painted luminance`).toBeLessThan(0.3); expect(l, `${region} is the original dark, not pure black`).toBeGreaterThan(0.025); }
    else expect(l, `${region} painted luminance`).toBeGreaterThan(0.7);
  }
  const railL = await page.getByRole("navigation", { name: "Projects" }).evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(lum(railL) < 0.2, `rail ${railL}`).toBe(expectDark);
  // nothing blue, nothing clipped: every visible button/label fits its own box
  const bad = await ws.evaluate((root) => {
    const out: string[] = [];
    const blue = (c: string) => { const m = (c.match(/[\d.]+/g) ?? []).map(Number); return m.length >= 3 && m[2] > m[0] + 40 && m[2] > m[1] + 25; };
    for (const e of root.querySelectorAll<HTMLElement>("button, a, label, h2, h3, strong, small, p, li, span")) {
      const r = e.getBoundingClientRect();
      if (r.width <= 2 || r.height <= 2) continue; // visually-hidden labels are 1px by design
      const cs = getComputedStyle(e);
      if (blue(cs.backgroundColor) || blue(cs.color) || blue(cs.borderTopColor)) out.push("blue:" + (e.textContent || "").slice(0, 30));
      if (cs.textOverflow === "ellipsis") continue; // intentional, full text is in the title/aria
      if (e.scrollWidth > e.clientWidth + 2 && cs.overflowX !== "visible" && cs.display !== "inline") out.push("clipped:" + (e.textContent || "").slice(0, 30));
    }
    const sc = root.scrollWidth - (root as HTMLElement).clientWidth;
    if (sc > 1) out.push("workspace scrolls sideways by " + sc);
    return out;
  });
  expect(bad).toEqual([]);
}


test.describe.serial("Create workspace follows the theme", () => {
  test("Dark, Light and Auto (both OS settings) at desktop width, switching live", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, `theme.${Date.now().toString(36)}@example.com`);
    await page.emulateMedia({ colorScheme: "dark" });
    await openCreate(page);

    await choose(page, "Dark");
    await audit(page, true);

    await choose(page, "Light"); // live, no reload
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await audit(page, false);
    await page.screenshot({ path: "test-results/create-light.png" });

    await choose(page, "Auto");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await audit(page, true);
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await audit(page, false);

    // the choice survives a reload and still reaches the workspace
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /reject non-essential/i }).click({ timeout: 3000 }).catch(() => undefined);
    await page.getByRole("button", { name: /^create( an? (?:app|site) or image)?$/i }).first().click();
    await page.getByRole("tab", { name: /^site$/i }).click(); // App is the default Create tab; these tests cover the site builder
    await page.waitForSelector("[data-testid=workspace]", { timeout: 30_000 });
    await audit(page, false);
    expect(errors).toEqual([]);
  });

  test("phone width: light theme fits too", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await signIn(page, `theme.m.${Date.now().toString(36)}@example.com`);
    await page.emulateMedia({ colorScheme: "light" });
    await page.addInitScript(() => { try { localStorage.setItem("keplar-theme", "light"); } catch { /* */ } });
    await openCreate(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    const l = await page.evaluate(() => getComputedStyle(document.querySelector("[data-testid=workspace]")!).backgroundImage);
    expect(l).toContain("rgb(255, 255, 255)");
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over).toBeLessThanOrEqual(0);
  });
});
