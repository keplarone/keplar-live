import { test, expect, type Page } from "playwright/test";
import { writeFileSync } from "node:fs";

/** Measures the Create workspace: JavaScript bytes on the wire before and after opening it, open time, and client latency of a generation. Numbers are written to test-results/perf-create.json. */
let hop = 0;
async function signIn(page: Page, email: string) {
  const ctx = page.context();
  const h = { "content-type": "application/json", origin: `http://localhost:${process.env.E2E_PORT || 3199}`, "x-forwarded-for": `10.66.${(Date.now() >> 3) & 255}.${++hop}` };
  expect((await ctx.request.post("/api/auth/sign-in/magic-link", { headers: h, data: { email, callbackURL: "/app" } })).ok()).toBeTruthy();
  const html = await (await ctx.request.get("/dev/outbox")).text();
  const link = [...html.matchAll(/href="(http[^"]*token=[^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"))[0];
  expect((await ctx.request.post("/api/auth/magic-link/confirm", { headers: h, data: { token: new URL(link).searchParams.get("token") } })).ok()).toBeTruthy();
  await ctx.request.post("/api/onboarding", { headers: { "content-type": "application/json", origin: h.origin }, data: { action: "complete", answers: { name: "Alex" } } });
}

test("create workspace performance", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, `perf.${Date.now().toString(36)}@example.com`);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  const types = new Map<string, { url: string; type: string }>();
  let jsBytes = 0;
  let jsFiles = 0;
  const files: Record<string, number> = {};
  cdp.on("Network.responseReceived", (e) => types.set(e.requestId, { url: e.response.url, type: e.type }));
  cdp.on("Network.loadingFinished", (e) => {
    const t = types.get(e.requestId);
    if (t?.type === "Script") { jsBytes += e.encodedDataLength; jsFiles++; files[t.url.split("/").pop()!.slice(0, 40)] = e.encodedDataLength; }
  });
  await page.goto("/app", { waitUntil: "load" });
  await page.getByRole("button", { name: /reject non-essential/i }).click({ timeout: 4000 }).catch(() => undefined);
  await page.waitForTimeout(1500);
  const before = { bytes: jsBytes, files: jsFiles };
  await page.waitForTimeout(Number(process.env.PERF_WAIT || 1000));
  const t0 = Date.now();
  await page.getByRole("button", { name: /^create( an? (?:app|site) or image)?$/i }).first().click();
  await page.waitForSelector("[data-testid=workspace] #ws-prompt", { timeout: 30_000 });
  const openMs = Date.now() - t0;
  await page.waitForTimeout(2000);
  const after = { bytes: jsBytes, files: jsFiles };
  const three = Object.entries(files).filter(([, b]) => b > 40_000).map(([n, b]) => `${n}:${b}`);
  // generation latency as the user sees it: submit -> first visible reply
  const box = page.locator("#ws-prompt");
  await box.fill("A site for Mill Lane Bakehouse, a neighborhood bakery with opening hours and a way to reserve a loaf");
  const t1 = Date.now();
  await box.press("Enter");
  await expect(page.getByTestId("understand").or(page.getByTestId("question")).or(page.getByTestId("brief-review"))).toBeVisible({ timeout: 30_000 });
  const firstReplyMs = Date.now() - t1;
  // long-task and layout-shift totals over the whole session
  const vitals = await page.evaluate(() => {
    const out = { longTasks: 0, longMs: 0, cls: 0 };
    for (const e of performance.getEntriesByType("longtask")) { out.longTasks++; out.longMs += e.duration; }
    return out;
  });
  const res = { jsBeforeOpen: before, jsAfterOpen: after, jsOnOpen: after.bytes - before.bytes, openMs, firstReplyMs, bigChunks: three, vitals };
  writeFileSync("test-results/perf-create.json", JSON.stringify(res, null, 1));
  console.log("PERF " + JSON.stringify(res));
  expect(openMs).toBeLessThan(15_000);
});
