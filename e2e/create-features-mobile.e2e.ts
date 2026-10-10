import { test, expect, type Page } from "playwright/test";

test.skip(true, "Site Create UI removed; site-builder backend remains for Apps");

/**
 * Real features on a published Create site, in a real browser against a production build and a fake model API:
 * the owner builds a site, adds booking + contact form + waitlist + a data table with one click, publishes, then a separate visitor
 * (no cookies) books a time, sends a note, joins the waitlist and reads the table; the owner then finds every record in their dashboard
 * (Features, Leads, CRM). Also: a bot is ignored, the booked slot disappears, nothing is emailed without the owner's opt-in.
 */
let hop = 0;
async function signIn(page: Page, email: string) {
  const ctx = page.context();
  const h = { "content-type": "application/json", origin: `http://localhost:${process.env.E2E_PORT || 3199}`, "x-forwarded-for": `10.88.${(Date.now() >> 3) & 255}.${++hop}` };
  expect((await ctx.request.post("/api/auth/sign-in/magic-link", { headers: h, data: { email, callbackURL: "/app" } })).ok()).toBeTruthy();
  const html = await (await ctx.request.get("/dev/outbox")).text();
  const link = [...html.matchAll(/href="(http[^"]*token=[^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&")).find((l) => html.includes(email)) ?? "";
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


test("Features tab on a phone (390px): nothing spills sideways, targets are tappable, long values wrap, every card fits", async ({ browser, page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, `featm.${Date.now().toString(36)}@example.com`);
  await openCreate(page);
  const box = page.locator("#ws-prompt");
  await box.fill("A site for Mill Lane Bakehouse, a neighborhood bakery with opening hours and a way to reserve a loaf");
  await box.press("Enter");
  await page.getByTestId("understand").getByRole("button", { name: /just build it/i }).click();
  const review = page.getByTestId("brief-review");
  await expect(review).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Test after build").uncheck();
  await review.getByRole("button", { name: /approve and build/i }).click();
  await expect(page.getByRole("textbox", { name: "Describe a change" })).toBeEnabled({ timeout: 120_000 });
  await page.getByRole("tab", { name: /^More/ }).click();
  await page.getByRole("tab", { name: "Features", exact: true }).click();
  await page.getByTestId("feature-booking").getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("textbox", { name: "Describe a change" })).toBeEnabled({ timeout: 90_000 });
  await page.getByRole("tab", { name: /^More/ }).click();
  await page.getByRole("tab", { name: "Features", exact: true }).click();
  await expect(page.getByTestId("feature-booking")).toContainText("On this site ×1", { timeout: 20_000 });
  await page.getByRole("tab", { name: "Publish", exact: true }).click();
  await page.getByRole("button", { name: /^publish/i }).first().click();
  await expect(page.getByText("Published", { exact: true }).first()).toBeVisible({ timeout: 60_000 });
  const list = (await (await page.context().request.get("/api/sites")).json()) as { sites: { slug: string; id: string; publishedUrl: string | null }[] };
  const site = list.sites.find((s) => s.publishedUrl)!;
  // visitors leave long values so wrapping is really exercised
  const vctx = await browser.newContext({ baseURL: `http://localhost:${process.env.E2E_PORT || 3199}` });
  const tokenOf = async (path: string) => (await (await vctx.request.get(path)).text()).match(/name="_t" value="([^"]+)"/)![1];
  const tok = await tokenOf(`/s/${site.slug}/contact.html`);
  const mtok = await tokenOf(`/s/${site.slug}/members`);
  await new Promise((r) => setTimeout(r, 1800));
  const long = `very.long.address.that.keeps.going.${"x".repeat(25)}@example-company-with-a-long-name.com`;
  const r1 = await vctx.request.post(`/s/${site.slug}/_f/newsletter`, { maxRedirects: 0, form: { _id: "wl", _page: "contact.html", _t: tok, email: long } });
  const r2 = await vctx.request.post(`/s/${site.slug}/_f/members`, { maxRedirects: 0, form: { _id: "area", _page: "members.html", _t: mtok, _a: "signup", email: `member.${"y".repeat(50)}@example.com`, password: "correct horse battery" } });
  const slot = (await (await vctx.request.get(`/s/${site.slug}/contact.html`)).text()).match(/<option value="(\d{4}-[^"]+)"/)![1];
  const r3 = await vctx.request.post(`/s/${site.slug}/_f/booking`, { maxRedirects: 0, form: { _id: "call", _page: "contact.html", _t: tok, slot, name: "Visitor With A Rather Long Name Indeed", email: long, message: "Please call me " + "back ".repeat(20) } });
  console.log("POSTS", r1.status(), r2.status(), r3.status(), r1.headers().location, r2.headers().location, r3.headers().location);
  expect([r1.status(), r2.status(), r3.status()]).toEqual([303, 303, 303]);
  await vctx.close();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: /^More/ }).click({ timeout: 20_000 });
  await page.getByRole("tab", { name: "Features", exact: true }).click();
  const pane = page.getByTestId("features-pane");
  await expect(pane.getByTestId("signups")).toBeVisible({ timeout: 20_000 });
  await expect(pane.getByTestId("members")).toBeVisible();
  await expect(pane.getByTestId("bookings")).toBeVisible();
  const m = await page.evaluate(() => {
    const pane = document.querySelector("[data-testid=features-pane]") as HTMLElement;
    const vw = window.innerWidth;
    const over = [...pane.querySelectorAll<HTMLElement>("*")].filter((e) => e.getBoundingClientRect().right > vw + 1 && getComputedStyle(e).position !== "absolute").map((e) => `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 30)}:${Math.round(e.getBoundingClientRect().right)}`);
    const small = [...pane.querySelectorAll<HTMLElement>("button, input, select, label.row, a")].filter((e) => { const t = (e.closest("label") as HTMLElement | null) ?? e; return e.offsetParent && (t.getBoundingClientRect().height < 40 || t.getBoundingClientRect().width < 40); }) // a checkbox is tapped through its label row.map((e) => `${e.tagName.toLowerCase()}:${(e.textContent || (e as HTMLInputElement).type || "").trim().slice(0, 18)}:${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`);
    return { docOver: document.documentElement.scrollWidth - vw, paneOver: pane.scrollWidth - pane.clientWidth, over, small, font: getComputedStyle(pane).fontSize };
  });
  console.log("MOBILE", JSON.stringify(m));
  await page.screenshot({ path: "/tmp/ref/mobile-features.png" });
  await pane.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await page.screenshot({ path: "/tmp/ref/mobile-features-bottom.png" });
  expect(m.docOver).toBeLessThanOrEqual(1);
  expect(m.paneOver).toBeLessThanOrEqual(1);
  expect(m.over).toEqual([]);
  expect(m.small).toEqual([]);
});
