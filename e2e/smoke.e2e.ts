import { test, expect } from "playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Smoke: every key route loads, renders its heading text, throws no uncaught page error. Routes come from scripts/smoke-routes.json (shared with the post-deploy check). */
const routes = JSON.parse(readFileSync(resolve(__dirname, "../scripts/smoke-routes.json"), "utf8")) as {
  pages: { path: string; text: string | null }[];
  api: { path: string; json: Record<string, unknown> }[];
  mustBeHidden: string[];
};

for (const p of routes.pages) {
  test(`page ${p.path} loads without a page error`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const res = await page.goto(p.path, { waitUntil: "domcontentloaded" });
    expect(res?.status(), `${p.path} status`).toBeLessThan(400);
    if (p.text) await expect(page.locator("body")).toContainText(new RegExp(p.text, "i"));
    if (p.path === "/app") await expect(page.locator("textarea").first()).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(500);
    expect(errors, `uncaught errors on ${p.path}`).toEqual([]);
  });
}

for (const a of routes.api) {
  test(`api ${a.path} answers`, async ({ request }) => {
    const res = await request.get(a.path);
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject(a.json);
  });
}

for (const h of routes.mustBeHidden) {
  test(`${h} is not exposed to signed-out visitors`, async ({ request }) => {
    const res = await request.get(h);
    expect(res.status()).toBe(404);
  });
}
