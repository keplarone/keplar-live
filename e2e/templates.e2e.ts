import { test, expect, type Page } from "playwright/test";

/**
 * Template gallery in a real browser: public gallery + detail (preview, report), one-click Remix into Create (signed in), the
 * sign-in prompt (signed out), sharing a site as a template and withdrawing it, and a 390px phone with no sideways scroll.
 */
let hop = 0;
const origin = () => `http://localhost:${process.env.E2E_PORT || 3199}`;
async function signIn(page: Page, email: string) {
  const ctx = page.context();
  const h = { "content-type": "application/json", origin: origin(), "x-forwarded-for": `10.88.${(Date.now() >> 3) & 255}.${++hop}` };
  expect((await ctx.request.post("/api/auth/sign-in/magic-link", { headers: h, data: { email, callbackURL: "/app" } })).ok()).toBeTruthy();
  const html = await (await ctx.request.get("/dev/outbox")).text();
  const link = [...html.matchAll(/href="(http[^"]*token=[^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"))[0];
  expect((await ctx.request.post("/api/auth/magic-link/confirm", { headers: h, data: { token: new URL(link).searchParams.get("token") } })).ok()).toBeTruthy();
}
const json = { "content-type": "application/json" };
const post = (page: Page, url: string, data: unknown) => page.context().request.post(url, { headers: { ...json, origin: origin() }, data });

test("gallery and detail are public: starters, honest labels, sandboxed preview, JSON-LD, report dialog, sitemap and share card", async ({ browser }) => {
  const visitor = await browser.newContext({ baseURL: origin() });
  const v = await visitor.newPage();
  const res = await v.goto("/templates");
  expect(res!.status()).toBe(200);
  await expect(v.getByRole("heading", { level: 1 })).toContainText("Start from a real site");
  await expect(v.getByRole("heading", { name: "Keplar starters" })).toBeVisible();
  await expect(v.locator("ul li h3 a")).toHaveCount(4);
  await expect(v.getByText("not by the AI model")).toBeVisible();
  await expect(v.getByRole("heading", { name: /Community templates/ }).getByText("Beta")).toBeVisible();
  await expect(v.getByText("No community templates yet")).toBeVisible();
  expect(await v.locator('script[type="application/ld+json"]').count()).toBeGreaterThanOrEqual(2);

  await v.getByRole("link", { name: "Local business" }).click();
  await expect(v).toHaveURL(/\/templates\/starter-business$/);
  await expect(v.getByRole("heading", { level: 1 })).toHaveText("Local business");
  await expect(v.locator("meta[property='og:image']")).toHaveAttribute("content", /\/templates\/starter-business\/og$/);
  const frame = v.frameLocator("iframe[title^='Preview of the Local business']");
  await expect(frame.getByRole("heading", { level: 1 })).toContainText("Honest work");
  // preview is read-only and sandboxed: strict CSP, no scripts, never indexed
  const pv = await visitor.request.get("/sites/template/starter-business");
  expect(pv.status()).toBe(200);
  expect(pv.headers()["content-security-policy"]).toContain("sandbox");
  expect(pv.headers()["x-robots-tag"]).toContain("noindex");
  expect(await pv.text()).not.toMatch(/<script/i);
  // inner pages resolve inside the preview
  expect((await visitor.request.get("/sites/template/starter-business/services")).status()).toBe(200);
  expect((await visitor.request.get("/sites/template/starter-business/styles.css")).headers()["content-type"]).toContain("text/css");

  await v.getByRole("button", { name: "Report this page" }).click();
  await expect(v.getByTestId("report-dialog")).toBeVisible();
  await v.keyboard.press("Escape");

  expect((await visitor.request.get("/templates/starter-nope")).status()).toBe(404);
  expect((await visitor.request.get("/sites/template/starter-nope")).status()).toBe(404);
  const og = await visitor.request.get("/templates/starter-business/og");
  expect(og.headers()["content-type"]).toContain("image/png");
  const map = await (await visitor.request.get("/templates-sitemap.xml")).text();
  expect(map).toContain("/templates/starter-business");
  expect(map).toContain("<loc>");
  await visitor.close();
});

test("signed out: Remix asks for sign-in and keeps the template page; nothing is created", async ({ browser }) => {
  const visitor = await browser.newContext({ baseURL: origin() });
  const v = await visitor.newPage();
  await v.goto("/templates/starter-portfolio");
  await expect(v.getByTestId("remix-panel")).toContainText("Not copied: the owner");
  await v.getByRole("button", { name: "Remix and open in Create" }).click();
  const alert = v.getByRole("alert").filter({ hasText: "Sign in to remix" });
  await expect(alert).toBeVisible();
  await expect(alert.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", /\/signin\?next=%2Ftemplates%2Fstarter-portfolio/);
  await expect(v).toHaveURL(/\/templates\/starter-portfolio$/);
  await visitor.close();
});

test("signed in: Remix copies the template into my workspace and opens Create with a prompt box to change it; credit is optional", async ({ page }) => {
  await signIn(page, `tpl-e2e-${Date.now().toString(36)}@example.com`);
  await page.goto("/templates/starter-restaurant");
  await page.getByLabel("Name of your site").fill("Corner Table");
  await expect(page.getByRole("checkbox", { name: /Based on this template/ })).not.toBeChecked(); // credit is off by default
  await page.getByRole("button", { name: "Remix and open in Create" }).click();
  await page.waitForURL(/\/app\/create/);
  const hint = page.getByTestId("remix-hint");
  await expect(hint).toContainText("Remixed from the “Cafe or restaurant” template");
  const box = page.locator("#ws-prompt");
  await expect(box).toBeVisible();
  await expect(box).toHaveAttribute("placeholder", /Change this template/);
  const sites = (await (await page.context().request.get("/api/sites")).json()) as { sites: { name: string; headVersion: number }[] };
  expect(sites.sites.map((s) => s.name)).toContain("Corner Table");
  expect(sites.sites.find((s) => s.name === "Corner Table")!.headVersion).toBe(1);
});

test("share a site as a template, see it in the gallery, remix it from another account, withdraw it", async ({ page, browser }) => {
  await signIn(page, `tpl-owner-${Date.now().toString(36)}@example.com`);
  const made = await post(page, "/api/sites", { name: "Harbor Bikes", template: "business" });
  expect(made.status()).toBe(201);
  const siteId = ((await made.json()) as { site: { id: string } }).site.id;
  const refused = await post(page, "/api/templates", { siteId, title: "Bike shop", description: "A friendly one-page-per-topic bike repair shop site.", category: "business", consent: false });
  expect(refused.status()).toBe(400);
  const shared = await post(page, "/api/templates", { siteId, title: "Bike shop starter", description: "A friendly bike repair shop site with prices, about page and contact form.", category: "business", consent: true, credit: "Harbor Bikes" });
  expect(shared.status()).toBe(201);
  const { slug, url } = (await shared.json()) as { slug: string; url: string };
  expect(url).toContain(`/templates/${slug}`);

  const visitor = await browser.newContext({ baseURL: origin() });
  const v = await visitor.newPage();
  await v.goto("/templates");
  await expect(v.getByRole("link", { name: "Bike shop starter" })).toBeVisible();
  await v.getByRole("link", { name: "Bike shop starter" }).click();
  await expect(v.getByText("Shared by Harbor Bikes")).toBeVisible();
  await expect(v.getByText("Community template (beta)")).toBeVisible();
  expect((await visitor.request.get(`/templates-sitemap.xml`)).status()).toBe(200);
  expect(await (await visitor.request.get(`/templates-sitemap.xml`)).text()).toContain(slug);
  await visitor.close();

  // another account remixes it with credit
  const other = await browser.newContext({ baseURL: origin() });
  const o = await other.newPage();
  await signIn(o, `tpl-remixer-${Date.now().toString(36)}@example.com`);
  await o.goto(`/templates/${slug}`);
  await o.getByRole("checkbox", { name: /Based on this template by Harbor Bikes/ }).check();
  await o.getByRole("button", { name: "Remix and open in Create" }).click();
  await o.waitForURL(/\/app\/create/);
  await expect(o.getByTestId("remix-hint")).toContainText("Bike shop starter");
  await other.close();

  // withdraw: gone everywhere at once
  const del = await page.context().request.delete("/api/templates", { headers: { ...json, origin: origin() }, data: { slug } });
  expect(del.status()).toBe(200);
  expect((await page.context().request.get(`/templates/${slug}`)).status()).toBe(404);
  expect((await page.context().request.get(`/sites/template/${slug}`)).status()).toBe(404);
});

test("phone: gallery and detail fit a 390px screen with no sideways scroll and 44px controls", async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: origin(), viewport: { width: 390, height: 844 }, hasTouch: true });
  const p = await ctx.newPage();
  for (const path of ["/templates", "/templates/starter-landing"]) {
    await p.goto(path);
    await p.waitForLoadState("networkidle");
    const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over, `${path} overflow`).toBeLessThanOrEqual(1);
  }
  const btn = await p.getByRole("button", { name: "Remix and open in Create" }).boundingBox();
  expect(btn!.height).toBeGreaterThanOrEqual(44);
  const report = await p.getByRole("button", { name: "Report this page" }).boundingBox();
  expect(report!.height).toBeGreaterThanOrEqual(44);
  await ctx.close();
});
