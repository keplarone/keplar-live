import { test, expect, request as pwRequest, type Page } from "playwright/test";
import { execFileSync } from "node:child_process";
import { DATA_DIR, SECRET } from "./playwright.config";

/**
 * Public API (beta) in a real browser and over real HTTP: create a key in Account (shown once), call POST /api/v1/ask with ONLY the bearer
 * key (no cookies) in JSON and streaming forms, read the OpenAPI spec and /developers, revoke in the UI and see the next call refused.
 * Free accounts get an honest "not available" message. The answer used is the creator reply (needs no model).
 */
let hop = 0;
const origin = () => `http://localhost:${process.env.E2E_PORT || 3199}`;
const run = (script: string, ...args: string[]) =>
  execFileSync("node", ["--import", "tsx", `e2e/${script}`, ...args], { cwd: process.cwd(), env: { ...process.env, KEPLAR_DATA_DIR: DATA_DIR, BETTER_AUTH_SECRET: SECRET, BETTER_AUTH_URL: origin(), KEPLAR_DEV_TOOLS: "1" }, stdio: "pipe" });

async function signIn(page: Page, email: string) {
  const ctx = page.context();
  const h = { "content-type": "application/json", origin: origin(), "x-forwarded-for": `10.92.${(Date.now() >> 3) & 255}.${++hop}` };
  expect((await ctx.request.post("/api/auth/sign-in/magic-link", { headers: h, data: { email, callbackURL: "/app" } })).ok()).toBeTruthy();
  // The email for THIS address (the outbox lists everyone's, and delivery can trail the response by a moment).
  let link = "";
  for (let i = 0; i < 40 && !link; i++) {
    const html = await (await ctx.request.get("/dev/outbox")).text();
    const at = html.indexOf(email);
    if (at >= 0) link = [...html.slice(at).matchAll(/href="(http[^"]*token=[^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"))[0] ?? "";
    if (!link) await new Promise((r) => setTimeout(r, 250));
  }
  expect(link).not.toBe("");
  expect((await ctx.request.post("/api/auth/magic-link/confirm", { headers: h, data: { token: new URL(link).searchParams.get("token") } })).ok()).toBeTruthy();
  await ctx.request.get("/api/compute");
}

const openApiTab = async (page: Page) => {
  await page.goto("/account");
  await page.getByRole("tab", { name: /^advanced$/i }).click(); // Developer API lives in Settings > Advanced
  await expect(page.locator("[data-api-panel]")).toBeVisible();
};

test("create a key (shown once), ask with only the bearer key (JSON and stream), then revoke it", async ({ browser, baseURL }) => {
  const mail = `dev-${Date.now().toString(36)}@example.com`;
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await signIn(page, mail);
  run("set-plan.ts", mail, "plus");
  await openApiTab(page);
  await page.getByLabel("Key name").fill("e2e script");
  await page.getByRole("button", { name: "Create key" }).click();
  const shown = page.locator("[data-new-key] code");
  await expect(shown).toBeVisible();
  const key = (await shown.textContent())!.trim();
  expect(key).toMatch(/^kpl_[A-Za-z0-9_-]{32}$/);
  await page.getByRole("button", { name: /I've saved it/ }).click();
  await page.reload();
  await page.getByRole("tab", { name: /^advanced$/i }).click(); // Developer API lives in Settings > Advanced
  await expect(page.locator("[data-key='e2e script']")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(key); // never shown again

  // No cookies at all: a fresh request context.
  const api = await pwRequest.newContext({ baseURL });
  const auth = { authorization: `Bearer ${key}` };
  expect((await api.post("/api/v1/ask", { data: { question: "Who created Keplar?" } })).status()).toBe(401);
  const res = await api.post("/api/v1/ask", { headers: auth, data: { question: "Who created Keplar?" } });
  expect(res.status()).toBe(200);
  const a = await res.json();
  expect(a.object).toBe("answer");
  expect(a.answer.length).toBeGreaterThan(10);
  expect(a).toHaveProperty("agreement.summary");
  expect(a).toHaveProperty("disagreement");

  const st = await api.post("/api/v1/ask", { headers: auth, data: { question: "Who created Keplar?", stream: true } });
  expect(st.headers()["content-type"]).toContain("text/event-stream");
  const text = await st.text();
  expect(text).toContain("event: answer");
  expect(text.trim().endsWith("data: {}")).toBeTruthy();

  const spec = await (await api.get("/api/v1/openapi.json")).json();
  expect(spec.openapi).toBe("3.1.0");
  expect(spec.paths["/api/v1/ask"]).toBeTruthy();
  const pre = await api.fetch("/api/v1/ask", { method: "OPTIONS", headers: { origin: "chrome-extension://abc", "access-control-request-method": "POST", "access-control-request-headers": "authorization,content-type" } });
  expect(pre.status()).toBe(204);

  await page.reload();
  await page.getByRole("tab", { name: /^advanced$/i }).click(); // Developer API lives in Settings > Advanced
  page.once("dialog", (d) => void d.accept());
  await page.locator("[data-key='e2e script']").getByRole("button", { name: "Revoke" }).click();
  await expect(page.locator("[data-key='e2e script']")).toHaveCount(0);
  expect((await api.post("/api/v1/ask", { headers: auth, data: { question: "Who created Keplar?" } })).status()).toBe(401);
  await api.dispose();
  await context.close(); // a page left open keeps animating and starves the next test of CPU
});

test("a Free account is told honestly that keys aren't available", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await signIn(page, `free-${Date.now().toString(36)}@example.com`);
  await openApiTab(page);
  await expect(page.locator("[data-api-unavailable]")).toContainText(/start on Lite/i);
  await expect(page.getByRole("button", { name: "Create key" })).toHaveCount(0);
  await context.close();
});

test("/developers renders on a 390px phone with no sideways scroll, labeled beta, with the plan table", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto("/developers");
  await expect(page.getByRole("heading", { level: 1, name: "Keplar API" })).toBeVisible();
  await expect(page.getByText("Developers · Beta")).toBeVisible();
  await expect(page.getByText("Not available").first()).toBeVisible();
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over).toBeLessThanOrEqual(1);
  await ctx.close();
});
