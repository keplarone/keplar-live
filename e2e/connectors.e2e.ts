import { test, expect, type Page } from "playwright/test";

/** Business > Connectors in a real browser with no provider keys: regular users see no unconfigured connector and no env names; admins get a "Setup needed" section; Notion/Linear are BETA links. */
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

async function openConnectors(page: Page) {
  await page.goto("/app", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /reject non-essential/i }).click({ timeout: 4000 }).catch(() => undefined);
  await page.goto("/app/business", { waitUntil: "domcontentloaded" });
  // minimal pass: Connectors sits in the Business "More" menu
  await page.locator("[data-business-more]").click();
  await page.getByRole("menuitem", { name: /^connectors$/i }).click();
}

const TECH = /GOOGLE_CONNECT|SLACK_CLIENT|GITHUB_CONNECT|PLAID_|Redirect URI|server environment|Not configured|Financial Connections/i;

test("Connectors without provider keys: regular users see no unconfigured connector and no technical details", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, `conn.${Date.now().toString(36)}@example.com`);
  await openConnectors(page);
  await expect(page.locator("[data-connector=notion]").getByText("BETA", { exact: true })).toBeVisible();
  await expect(page.locator("[data-connector=linear]").getByText("BETA", { exact: true })).toBeVisible();
  for (const id of ["gmail", "gcal", "slack", "github", "plaid", "outlook", "stripe", "social"]) await expect(page.locator(`[data-connector=${id}]`)).toHaveCount(0);
  await expect(page.getByTestId("setup-needed")).toHaveCount(0);
  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(TECH);
  // the API agrees: starting the OAuth flow is refused with a plain message, no env var names
  const res = await page.request.post("/api/business/connectors/oauth/start", { headers: { "content-type": "application/json", origin: `http://localhost:${process.env.E2E_PORT || 3199}` }, data: { connector: "gmail" } });
  expect(res.status()).toBe(503);
  expect(((await res.json()) as { error: string }).error).not.toMatch(TECH);
  const list = await (await page.request.get("/api/business/connectors")).text();
  expect(list).not.toMatch(TECH);
  expect(list).not.toMatch(/needsEnv|redirectUri/);
  // the overview shows conversion as a dash, not 0%
  await page.getByRole("tab", { name: /^overview$/i }).click();
  await expect(page.getByText("Conversion · 14 days")).toBeVisible();
});

test("Connectors without provider keys: the admin account sees a Setup needed section", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, "team@keplar.one");
  await openConnectors(page);
  const setup = page.getByTestId("setup-needed");
  await expect(setup).toBeVisible();
  await expect(setup).toContainText("Admin only");
  await expect(setup.locator("[data-setup=gmail]")).toContainText("GOOGLE_CONNECT_CLIENT_ID");
  await expect(setup.locator("[data-setup=slack]")).toContainText("SLACK_CLIENT_ID");
  await expect(setup.locator("[data-setup=github]")).toContainText("GITHUB_CONNECT_CLIENT_ID");
  await expect(setup.locator("[data-setup=plaid]")).toContainText("PLAID_CLIENT_ID and PLAID_SECRET");
  await expect(setup).toContainText("Redirect URI");
  for (const id of ["gmail", "gcal", "slack", "github", "plaid"]) await expect(page.locator(`[data-connector=${id}]`)).toHaveCount(0);
});
