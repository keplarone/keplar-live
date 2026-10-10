import { test, expect, type Page } from "playwright/test";
import { readFileSync } from "node:fs";

/** Create > Mobile (BETA) in a real browser: the store limits are on screen, bad keys are refused with a reason, the project downloads. */
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

async function openMobile(page: Page) {
  await page.goto("/app", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /reject non-essential/i }).click({ timeout: 4000 }).catch(() => undefined);
  await page.getByRole("button", { name: /^create( an? (?:app|site) or image)?$/i }).first().click();
  await page.getByRole("tab", { name: /^mobile/i }).click();
  await expect(page.getByTestId("mobile-studio")).toBeVisible();
}



test("Mobile (Beta): honest limits, refused bad keys, project download", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, `mob.${Date.now().toString(36)}@example.com`);
  await openMobile(page);
  const studio = page.getByTestId("mobile-studio");
  await expect(studio.getByText("BETA", { exact: true })).toBeVisible();
  await expect(studio.getByText(/has not yet built or submitted an app/i)).toBeVisible();
  // steps fold: only step 1 is open at first
  await studio.getByText(/Store accounts and keys/).click();
  await expect(studio.getByText(/\$99 per year/)).toBeVisible();
  await expect(studio.getByText(/can NOT create the app record/)).toBeVisible();
  await expect(studio.getByText(/\$25 one-time/)).toBeVisible();
  await expect(studio.getByText(/can NOT create a new app/)).toBeVisible();
  // a bad Apple key is refused with a reason, and nothing is stored
  await studio.getByLabel("Issuer ID").fill("not-an-id");
  await studio.getByLabel("Key ID").fill("ABCDE12345");
  await studio.getByLabel(/\.p8 private key/).fill("-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----");
  await studio.getByRole("button", { name: /save and check with apple/i }).click();
  await expect(studio.getByRole("alert")).toContainText(/Issuer ID/);
  expect(((await (await page.request.get("/api/mobile/credentials")).json()) as { credentials: unknown[] }).credentials).toEqual([]);
  // the project downloads as a real ZIP
  await studio.getByText(/Get the project/).click();
  await studio.getByLabel("App name").fill("Mill Lane");
  await studio.getByLabel(/Bundle ID/).fill("com.milllane.app");
  const dl = page.waitForEvent("download");
  await studio.getByRole("button", { name: /download the expo project/i }).click();
  const d = await dl;
  expect(d.suggestedFilename()).toBe("mill-lane-expo.zip");
  const path = await d.path();
  expect(readFileSync(path).subarray(0, 2).toString()).toBe("PK");
  // no blue buttons on this page
  const blue = await studio.locator("button").evaluateAll((els) => els.filter((e) => { const m = getComputedStyle(e).backgroundColor.match(/\d+(\.\d+)?/g)?.map(Number) ?? []; return m.length >= 3 && m[2] > m[0] + 40 && m[2] > m[1] + 25; }).length);
  expect(blue).toBe(0);
});
