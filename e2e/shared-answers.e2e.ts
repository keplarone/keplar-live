import { test, expect, type Page } from "playwright/test";

/**
 * Shareable answer pages in a real browser: create a private link, open it signed-out (noindex, question, models, disagreement view,
 * preview card, report dialog), revoke it (404), then the public page with its owner toggle. Desktop and a 390px phone.
 */
let hop = 0;
const origin = () => `http://localhost:${process.env.E2E_PORT || 3199}`;
async function signIn(page: Page, email: string) {
  const ctx = page.context();
  const h = { "content-type": "application/json", origin: origin(), "x-forwarded-for": `10.78.${(Date.now() >> 3) & 255}.${++hop}` };
  expect((await ctx.request.post("/api/auth/sign-in/magic-link", { headers: h, data: { email, callbackURL: "/app" } })).ok()).toBeTruthy();
  const html = await (await ctx.request.get("/dev/outbox")).text();
  const link = [...html.matchAll(/href="(http[^"]*token=[^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"))[0];
  expect((await ctx.request.post("/api/auth/magic-link/confirm", { headers: h, data: { token: new URL(link).searchParams.get("token") } })).ok()).toBeTruthy();
}

const long = "Use a JSONB column for preferences that change shape, and a normal column for anything you filter on. ".repeat(6);
const answer = {
  id: "ans_e2e",
  markdown: long,
  consensus: { level: "partial", agree: 2, disagree: 1, responded: 3, consulted: 3 },
  models: [{ name: "Model A", provider: "P", slot: "panel", status: "responded", stance: "JSONB" }, { name: "Model B", provider: "P", slot: "panel", status: "responded", stance: "JSONB" }, { name: "Model C", provider: "Q", slot: "panel", status: "responded", stance: "Columns" }],
  disagreements: [{ topic: "Storage shape", positions: [{ stance: "JSONB", models: ["Model A", "Model B"], summary: "Flexible." }, { stance: "Columns", models: ["Model C"], summary: "Typed." }], resolution: "JSONB for variable shapes, columns for filters." }],
  checks: [{ kind: "reasoning", finding: "Filtering on JSONB needs an index", models: [], outcome: "held", resolution: "Kept." }],
  reviewer: "Reviewer One (verifier)",
};
const Q = "Should I store user preferences as JSONB or in columns?";

test("private link: noindex, question + models + side-by-side disagreement, preview card, report, revoke", async ({ page, browser }) => {
  await signIn(page, `share-e2e-${Date.now().toString(36)}@example.com`);
  const created = await page.context().request.post("/api/share", { headers: { "content-type": "application/json", origin: origin() }, data: { consent: true, answer, question: Q, includeQuestion: true } });
  expect(created.status()).toBe(201);
  const { token, url } = (await created.json()) as { token: string; url: string };
  expect(url).toContain(`/r/${token}`);

  // a visitor with no account
  const visitor = await browser.newContext({ baseURL: origin(), extraHTTPHeaders: { "x-forwarded-for": `10.79.${(Date.now() >> 3) & 255}.${++hop}` } });
  const v = await visitor.newPage();
  const res = await v.goto(`/r/${token}`);
  expect(res!.status()).toBe(200);
  expect(res!.headers()["x-robots-tag"]).toContain("noindex");
  await expect(v.locator("meta[name=robots]")).toHaveAttribute("content", /noindex/);
  await expect(v.locator("meta[property='og:image']")).toHaveAttribute("content", new RegExp(`/r/${token}/og$`));
  await expect(v.getByText(Q)).toBeVisible();
  await expect(v.getByRole("region", { name: "How the models compared" }).getByText("Model C")).toBeVisible();
  const split = v.locator("[data-split]");
  await expect(split).toContainText("2 of 3 models agree");
  await expect(split).toContainText("JSONB for variable shapes");
  await expect(split).toContainText("Reviewer One");
  // personal / private things never appear
  await expect(v.locator("body")).not.toContainText("share-e2e-");

  // the preview card is a real image
  const og = await visitor.request.get(`/r/${token}/og`);
  expect(og.status()).toBe(200);
  expect(og.headers()["content-type"]).toContain("image/png");

  // side by side on desktop, stacked on a phone
  await v.setViewportSize({ width: 1280, height: 900 });
  let boxes = await split.locator("ul").first().locator("> li").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().y));
  expect(Math.abs(boxes[0] - boxes[1])).toBeLessThan(2);
  await v.setViewportSize({ width: 390, height: 844 });
  boxes = await split.locator("ul").first().locator("> li").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().y));
  expect(boxes[1]).toBeGreaterThan(boxes[0] + 20);
  expect(await v.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

  // abuse report from the page, signed out
  await v.getByRole("button", { name: "Report this page" }).click();
  const dlg = v.getByTestId("report-dialog");
  await expect(dlg).toBeVisible();
  await dlg.getByLabel("Reveals private information").check();
  await dlg.getByRole("button", { name: "Send report" }).click();
  await expect(dlg).toContainText("Thanks, we have your report");

  // owner revokes: the same URL is now a real 404 for everyone, and so is the card
  const del = await page.context().request.delete("/api/share", { headers: { "content-type": "application/json", origin: origin() }, data: { token } });
  expect(del.ok()).toBeTruthy();
  expect((await v.goto(`/r/${token}`))!.status()).toBe(404);
  expect((await visitor.request.get(`/r/${token}/og`)).status()).toBe(404);
  await visitor.close();
});

test("public page: opt-in with consent, indexable and listed; 'make private' makes it a 404 at once", async ({ page, browser }) => {
  await signIn(page, `share-pub-${Date.now().toString(36)}@example.com`);
  const h = { "content-type": "application/json", origin: origin() };
  const { token } = (await (await page.context().request.post("/api/share", { headers: h, data: { consent: true, answer, question: Q, includeQuestion: true } })).json()) as { token: string };
  expect((await page.context().request.patch("/api/share", { headers: h, data: { token, public: true } })).status()).toBe(400); // no consent, no page
  const pub = await page.context().request.patch("/api/share", { headers: h, data: { token, public: true, consent: true } });
  expect(pub.status()).toBe(200);
  const { url } = (await pub.json()) as { url: string };
  const path = new URL(url).pathname;

  const visitor = await browser.newContext({ baseURL: origin(), extraHTTPHeaders: { "x-forwarded-for": `10.80.${(Date.now() >> 3) & 255}.${++hop}` } });
  const v = await visitor.newPage();
  expect((await v.goto(path))!.status()).toBe(200);
  // (the whole site is noindex on localhost by design, so the page-level robots tag is covered by the unit tests instead)
  await expect(v.locator("h1")).toContainText(Q);
  await expect(v.locator("[data-split]")).toBeVisible();
  await expect(v.locator("meta[property='og:image']")).toHaveAttribute("content", /\/og$/);
  expect((await visitor.request.get(`${path}/og`)).status()).toBe(200);

  expect((await page.context().request.patch("/api/share", { headers: h, data: { token, public: false } })).ok()).toBeTruthy();
  expect((await v.goto(path))!.status()).toBe(404);
  // the private link keeps working
  expect((await v.goto(`/r/${token}`))!.status()).toBe(200);
  await visitor.close();
});
