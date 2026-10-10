import { test, expect, type Page, type BrowserContext } from "playwright/test";
import { execFileSync } from "node:child_process";
import { DATA_DIR, SECRET } from "./playwright.config";

test.skip(true, "Site Create UI removed; site-builder backend remains for Apps");

/**
 * Deleting a Create site, in a real browser: trash button per site in the Create rail and a Delete action in the site's Publish
 * tab, a confirm dialog that names the site and says what is removed and kept (never a browser alert), a 6 s Undo, the server
 * hiding the site at once (404 for the owner, 410 on its public address), deleting the open site switches to another site or to
 * the empty state, keyboard use, and phone width.
 */
const stamp = Date.now().toString(36);
const EMAIL = `sdel.${stamp}@example.com`;
const run = (script: string, ...args: string[]) =>
  execFileSync("node", ["--import", "tsx", `e2e/${script}`, ...args], { cwd: process.cwd(), env: { ...process.env, KEPLAR_DATA_DIR: DATA_DIR, BETTER_AUTH_SECRET: SECRET, BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || "http://localhost:3199" }, encoding: "utf8" }).trim();

let hop = 0;
async function signIn(page: Page, email: string) {
  const ctx = page.context();
  const h = { "content-type": "application/json", origin: `http://localhost:${process.env.E2E_PORT || 3199}`, "x-forwarded-for": `10.77.${(Date.now() >> 3) & 255}.${++hop}` };
  expect((await ctx.request.post("/api/auth/sign-in/magic-link", { headers: h, data: { email, callbackURL: "/app" } })).ok()).toBeTruthy();
  const html = await (await ctx.request.get("/dev/outbox")).text();
  const link = [...html.matchAll(/href="(http[^"]*token=[^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&")).find((l) => html.includes(email)) ?? "";
  expect(link).toBeTruthy();
  expect((await ctx.request.post("/api/auth/magic-link/confirm", { headers: h, data: { token: new URL(link).searchParams.get("token") } })).ok()).toBeTruthy();
  await ctx.request.post("/api/onboarding", { headers: { "content-type": "application/json", origin: h.origin }, data: { action: "complete", answers: { name: "Alex" } } });
}
type Sum = { id: string; slug: string; name: string };
const seed = async (ctx: BrowserContext, name: string): Promise<Sum> => {
  const r = await ctx.request.post("/api/sites", { data: { name, template: "blank" } });
  expect(r.status()).toBe(201);
  return ((await r.json()) as { site: Sum }).site;
};
const status = async (ctx: BrowserContext, path: string) => (await ctx.request.get(path, { maxRedirects: 0 })).status();
async function openCreate(page: Page) {
  await page.goto("/app", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /reject non-essential/i }).click({ timeout: 4000 }).catch(() => undefined);
  await page.getByRole("button", { name: /^create( an? (?:app|site) or image)?$/i }).first().click();
  await page.getByRole("tab", { name: /^site$/i }).click(); // App is the default Create tab; these tests cover the site builder
  await page.waitForSelector("[data-testid=workspace]", { timeout: 30_000 });
}
const rail = (page: Page) => page.getByRole("navigation", { name: "Projects" });
const rowOf = (page: Page, name: string) => rail(page).locator("li", { has: page.getByRole("button", { name: `Delete site: ${name}` }) });
const dialog = (page: Page) => page.locator("[data-delete-site-dialog]");


test.describe.serial("delete a site", () => {
  let ctx: BrowserContext;
  let page: Page;
  let alpha: Sum, bravo: Sum, charlie: Sum;
  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    page = await ctx.newPage();
    page.on("dialog", async (d) => { await d.dismiss(); throw new Error(`browser dialog used: ${d.message()}`); });
    await signIn(page, EMAIL);
    run("set-plan.ts", EMAIL, "plus");
    alpha = await seed(ctx, `Alpha ${stamp}`);
    bravo = await seed(ctx, `Bravo ${stamp}`);
    charlie = await seed(ctx, `Charlie ${stamp}`);
    expect((await ctx.request.post(`/api/sites/${bravo.id}/publish`)).status()).toBe(200);
    expect(await status(ctx, `/s/${bravo.slug}`)).toBe(200);
  });
  test.afterAll(async () => { await ctx.close(); });

  test("the dialog names the site and what goes and what stays; Cancel and Escape keep it", async () => {
    await openCreate(page);
    await expect(rowOf(page, alpha.name)).toBeVisible({ timeout: 20_000 });
    await rowOf(page, alpha.name).hover();
    await rowOf(page, alpha.name).getByRole("button", { name: `Delete site: ${alpha.name}` }).click();
    const d = dialog(page);
    await expect(d).toBeVisible();
    await expect(d.getByRole("heading", { name: `Delete “${alpha.name}”?` })).toBeVisible();
    await expect(d).toHaveAttribute("role", "alertdialog");
    await expect(d.getByText("This removes")).toBeVisible({ timeout: 10_000 });
    await expect(d.getByText("This keeps")).toBeVisible();
    await expect(d).toContainText("saved version");
    await expect(d).toContainText("draft");
    await expect(d).toContainText(`/s/${alpha.slug}`);
    await expect(d).toContainText(/form messages/i);
    await expect(d).toContainText("Create sites don't take payments");
    await expect(d).toContainText("Images you made in the Images tab stay in your library");
    await expect(d).toContainText("6 seconds to undo");
    await expect(d.getByRole("button", { name: "Cancel" })).toBeFocused(); // the safe button first
    await d.getByRole("button", { name: "Cancel" }).click();
    await expect(d).toBeHidden();
    expect(await status(ctx, `/api/sites/${alpha.id}`)).toBe(200);
    await rowOf(page, alpha.name).getByRole("button", { name: `Delete site: ${alpha.name}` }).focus();
    await page.keyboard.press("Enter");
    await expect(d).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(d).toBeHidden();
    await expect(rowOf(page, alpha.name)).toBeVisible();
    expect(await status(ctx, `/api/sites/${alpha.id}`)).toBe(200);
  });

  test("deleting the open site hides it at once (404 for you), switches to another site, and Undo brings it back and reopens it", async () => {
    await rail(page).getByRole("button", { name: new RegExp(`^${alpha.name}`) }).click();
    await expect(rail(page).getByRole("button", { name: new RegExp(`^${alpha.name}`) })).toHaveAttribute("aria-current", "true");
    await rowOf(page, alpha.name).getByRole("button", { name: `Delete site: ${alpha.name}` }).click();
    await dialog(page).getByRole("button", { name: "Delete site" }).click();
    const toast = page.locator("[data-undo-toast]");
    await expect(toast).toContainText(`Deleted “${alpha.name}”`);
    await expect(rowOf(page, alpha.name)).toHaveCount(0);
    expect(await status(ctx, `/api/sites/${alpha.id}`)).toBe(404);
    await expect(rail(page).locator('[aria-current="true"]')).toHaveCount(1); // switched to another site
    await expect(rail(page).locator('[aria-current="true"]')).not.toContainText(alpha.name);
    await toast.getByRole("button", { name: "Undo" }).click();
    await expect(toast).toHaveCount(0);
    await expect(rowOf(page, alpha.name)).toBeVisible();
    await expect(rail(page).getByRole("button", { name: new RegExp(`^${alpha.name}`) })).toHaveAttribute("aria-current", "true");
    expect(await status(ctx, `/api/sites/${alpha.id}`)).toBe(200);
  });

  test("after the 6 s window the data is gone for good; a published site answers 410 from the moment it is deleted", async () => {
    await rowOf(page, bravo.name).getByRole("button", { name: `Delete site: ${bravo.name}` }).click();
    await expect(dialog(page)).toContainText(`/s/${bravo.slug}`);
    await expect(dialog(page)).toContainText("goes offline right away");
    await dialog(page).getByRole("button", { name: "Delete site" }).click();
    await expect(page.locator("[data-undo-toast]")).toBeVisible();
    expect(await status(ctx, `/s/${bravo.slug}`)).toBe(410);
    expect(await status(ctx, `/s/${bravo.slug}/sitemap.xml`)).toBe(410);
    await expect(page.locator("[data-undo-toast]")).toHaveCount(0, { timeout: 12_000 });
    await expect.poll(async () => (await ctx.request.post(`/api/sites/${bravo.id}/restore`, { data: {} })).status(), { timeout: 10_000 }).toBe(404);
    expect(await status(ctx, `/s/${bravo.slug}`)).toBe(410); // the address stays reserved for you
    await openCreate(page);
    await expect(rowOf(page, bravo.name)).toHaveCount(0);
  });

  test("the Publish tab has its own Delete action with the same dialog; deleting the last site shows the empty state", async () => {
    await rail(page).getByRole("button", { name: new RegExp(`^${charlie.name}`) }).click();
    await page.getByRole("tab", { name: /^more/i }).click();
    await page.getByRole("tab", { name: /^publish$/i }).click();
    await page.getByRole("button", { name: /^delete site…$/i }).click();
    await expect(dialog(page).getByRole("heading", { name: `Delete “${charlie.name}”?` })).toBeVisible();
    await dialog(page).getByRole("button", { name: "Delete site" }).click();
    await expect(page.locator("[data-undo-toast]")).toBeVisible();
    // Alpha is still there: switched to it. Delete it too, from the rail: nothing is left.
    await expect(rail(page).locator('[aria-current="true"]')).toContainText(alpha.name);
    await rowOf(page, alpha.name).getByRole("button", { name: `Delete site: ${alpha.name}` }).click();
    await dialog(page).getByRole("button", { name: "Delete site" }).click();
    await expect(page.getByRole("heading", { name: "What are we building?" })).toBeVisible();
    await expect(rail(page).getByText(/nothing yet/i)).toBeVisible();
    await expect(page.locator("[data-undo-toast]")).toContainText(alpha.name);
    await page.locator("[data-undo-toast]").getByRole("button", { name: "Undo" }).click();
    await expect(rowOf(page, alpha.name)).toBeVisible();
  });

  test("a phone: the trash button is always visible and big enough, the dialog fits the screen, focus stays inside it", async ({ browser }) => {
    const m = await browser.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true, storageState: await ctx.storageState() });
    const p = await m.newPage();
    p.on("dialog", async (d) => { await d.dismiss(); throw new Error(`browser dialog used: ${d.message()}`); });
    await openCreate(p);
    await p.getByRole("button", { name: "Open the project list" }).click();
    const trash = p.getByRole("button", { name: `Delete site: ${alpha.name}` });
    await expect(trash).toBeVisible();
    const box = (await trash.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(40);
    expect(box.height).toBeGreaterThanOrEqual(40);
    await trash.tap();
    const d = dialog(p);
    await expect(d).toBeVisible();
    await expect(d.getByText("This keeps")).toBeVisible({ timeout: 10_000 });
    const db = (await d.boundingBox())!;
    expect(db.x).toBeGreaterThanOrEqual(0);
    expect(db.x + db.width).toBeLessThanOrEqual(390.5);
    expect(db.y + db.height).toBeLessThanOrEqual(780.5);
    const clipped = await d.locator("button").evaluateAll((bs) => bs.filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.textContent));
    expect(clipped).toEqual([]);
    // A modal dialog makes everything behind it inert: Tab only ever lands inside it (or leaves the page to the browser, never onto the page behind).
    for (let i = 0; i < 6; i++) {
      await p.keyboard.press("Tab");
      expect(await p.evaluate(() => { const a = document.activeElement; return !a || a === document.body || Boolean(a.closest("[data-delete-site-dialog]")); })).toBeTruthy();
    }
    await d.getByRole("button", { name: "Cancel" }).tap();
    await expect(d).toBeHidden();
    await m.close();
  });
});
