import { execFileSync } from "node:child_process";
import { test, expect, type Page } from "playwright/test";
import { DATA_DIR, SECRET } from "./playwright.config";

/**
 * "Made with Keplar" watermark, in a real browser against a production build: a Free site and a Plus site (same template),
 * desktop and mobile, published pages, the Create preview, and an upgrade/downgrade round trip with no cache in between.
 * The strip must sit at the very bottom of the document in normal flow (not fixed, not over content) and link to keplar.one.
 */
const run = (script: string, ...args: string[]) =>
  execFileSync("node", ["--import", "tsx", `e2e/${script}`, ...args], { cwd: process.cwd(), env: { ...process.env, KEPLAR_DATA_DIR: DATA_DIR, BETTER_AUTH_SECRET: SECRET, BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || "http://localhost:3199", KEPLAR_DEV_TOOLS: "1" }, stdio: "pipe" });

const STAMP = Date.now().toString(36);
let hop = 0;
async function signIn(page: Page, email: string) {
  const ctx = page.context();
  const h = { "content-type": "application/json", origin: `http://localhost:${process.env.E2E_PORT || 3199}`, "x-forwarded-for": `10.77.${(Date.now() >> 3) & 255}.${++hop}` };
  expect((await ctx.request.post("/api/auth/sign-in/magic-link", { headers: h, data: { email, callbackURL: "/app" } })).ok()).toBeTruthy();
  const html = await (await ctx.request.get("/dev/outbox")).text();
  const link = [...html.matchAll(/href="(http[^"]*token=[^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"))[0];
  expect((await ctx.request.post("/api/auth/magic-link/confirm", { headers: h, data: { token: new URL(link).searchParams.get("token") } })).ok()).toBeTruthy();
}

async function makePublishedSite(page: Page, name: string) {
  const origin = `http://localhost:${process.env.E2E_PORT || 3199}`;
  const headers = { "content-type": "application/json", origin };
  const created = await page.context().request.post("/api/sites", { headers, data: { name, template: "business" } });
  expect(created.status()).toBe(201);
  const { site } = (await created.json()) as { site: { id: string; slug: string } };
  const detail = (await (await page.context().request.get(`/api/sites/${site.id}`)).json()) as { pages: string[]; previewToken: string };
  expect((await page.context().request.post(`/api/sites/${site.id}/publish`, { headers, data: {} })).ok()).toBeTruthy();
  return { ...site, pages: detail.pages.filter((p) => p.endsWith(".html") && p !== "404.html"), token: detail.previewToken };
}

const urlOf = (slug: string, file: string) => (file === "index.html" ? `/s/${slug}` : `/s/${slug}/${file.replace(/\.html$/, "")}`);

/** The strip is last in the document, in flow, below every other element, full width, and links to keplar.one. */
async function expectBottomStrip(page: Page, label: string) {
  const strip = page.locator("#k-wm");
  await expect(strip, label).toHaveCount(1);
  await strip.scrollIntoViewIfNeeded();
  await expect(strip, label).toBeVisible();
  const a = strip.getByRole("link", { name: "Made with Keplar" });
  await expect(a, label).toHaveAttribute("href", "https://keplar.one");
  const m = await page.evaluate(() => {
    const el = document.getElementById("k-wm")!;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const docH = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    let maxBottom = 0;
    for (const e of Array.from(document.body.querySelectorAll("*"))) {
      if (el.contains(e) || e === el) continue;
      const b = e.getBoundingClientRect();
      if (b.height > 0 && b.width > 0 && getComputedStyle(e).position !== "fixed") maxBottom = Math.max(maxBottom, b.bottom + window.scrollY);
    }
    return { vh: window.innerHeight, top: r.top + window.scrollY, bottom: r.bottom + window.scrollY, width: r.width, vw: document.documentElement.clientWidth, position: cs.position, docH, maxBottom, lastChild: document.body.lastElementChild === el, fixedCount: Array.from(document.querySelectorAll("*")).filter((e) => getComputedStyle(e).position === "fixed").length, hOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, fontPx: parseFloat(cs.fontSize) };
  });
  expect(m.position, label).toBe("static");
  expect(m.lastChild, label).toBe(true);
  expect(m.top + 1, `${label}: below all content`).toBeGreaterThanOrEqual(m.maxBottom);
  // A page taller than the window ends exactly at the strip; a short page ends right after it (it follows the content, it is not pinned to the window).
  if (m.docH > m.vh + 1) expect(Math.abs(m.bottom - m.docH), `${label}: flush with the end of the page`).toBeLessThanOrEqual(2);
  else expect(m.bottom, label).toBeLessThanOrEqual(m.docH + 1);
  expect(m.width, label).toBeGreaterThanOrEqual(m.vw - 1);
  expect(m.fontPx, "small").toBeLessThanOrEqual(13);
  expect(m.fixedCount, "not an overlay").toBe(0);
  expect(m.hOverflow, "no sideways scroll from the strip").toBe(false);
}

for (const vp of [{ name: "desktop", width: 1280, height: 800 }, { name: "mobile", width: 390, height: 844 }]) {
  test(`${vp.name}: Free shows the strip at the bottom of every published page and the preview; Plus shows none; upgrade/downgrade is instant`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const freeMail = `wm.free.${vp.name}.${STAMP}@example.com`;
    await signIn(page, freeMail);
    const site = await makePublishedSite(page, `Free ${vp.name} bikes`);
    expect(site.pages.length).toBeGreaterThanOrEqual(2);

    // Free: published pages
    for (const f of site.pages) {
      await page.goto(urlOf(site.slug, f), { waitUntil: "load" });
      await expectBottomStrip(page, `free ${vp.name} ${f}`);
    }
    await page.screenshot({ path: `/tmp/wm-free-${vp.name}.png`, fullPage: true });
    // Free: the Create preview (same renderer, sandboxed iframe route)
    await page.goto(`/sites/draft/${site.id}/1/${site.pages[0]}?t=${site.token}`, { waitUntil: "load" });
    await expectBottomStrip(page, `free ${vp.name} preview`);

    // ZIP: every HTML page carries it
    const zip = await page.context().request.get(`/api/sites/${site.id}/export`);
    expect(zip.status()).toBe(200);
    expect(Buffer.from(await zip.body()).toString("latin1").match(/data-keplar-watermark/g)?.length ?? 0).toBeGreaterThanOrEqual(site.pages.length);

    // Upgrade to Plus: gone at once (live, preview, ZIP)
    run("set-plan.ts", freeMail, "plus");
    for (const f of site.pages) {
      const res = await page.goto(urlOf(site.slug, f), { waitUntil: "load" });
      expect(res!.headers()["cache-control"]).toBe("no-store");
      await expect(page.locator("#k-wm")).toHaveCount(0);
      await expect(page.getByText("Made with Keplar")).toHaveCount(0);
      await expect(page.locator("a[href*='keplar.one']")).toHaveCount(0);
    }
    await page.screenshot({ path: `/tmp/wm-plus-${vp.name}.png`, fullPage: true });
    await page.goto(`/sites/draft/${site.id}/1/${site.pages[0]}?t=${site.token}`, { waitUntil: "load" });
    await expect(page.locator("#k-wm")).toHaveCount(0);
    const zip2 = await page.context().request.get(`/api/sites/${site.id}/export`);
    expect(Buffer.from(await zip2.body()).toString("latin1")).not.toMatch(/data-keplar-watermark|Made with Keplar/);

    // Downgrade: back at once
    run("set-plan.ts", freeMail, "free");
    await page.goto(urlOf(site.slug, site.pages[0]), { waitUntil: "load" });
    await expectBottomStrip(page, `downgraded ${vp.name}`);
  });
}

test("Plus-plan site from the start (separate account): never shows the watermark, desktop and mobile", async ({ page }) => {
  const mail = `wm.plus.${STAMP}@example.com`;
  await signIn(page, mail);
  await page.context().request.get("/api/sites"); // creates the workspace row
  run("set-plan.ts", mail, "plus");
  const site = await makePublishedSite(page, "Plus bikes");
  for (const size of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size);
    for (const f of site.pages) {
      await page.goto(urlOf(site.slug, f), { waitUntil: "load" });
      await expect(page.locator("#k-wm,[data-keplar-watermark]")).toHaveCount(0);
      await expect(page.getByText(/made with keplar/i)).toHaveCount(0);
    }
  }
});
