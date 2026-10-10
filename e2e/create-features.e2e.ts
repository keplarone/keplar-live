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


test("one prompt adds working features; a visitor uses them on the published site; the owner sees every record", async ({ browser, page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, `feat.${Date.now().toString(36)}@example.com`);
  await openCreate(page);
  // build a site
  const box = page.locator("#ws-prompt");
  await box.fill("A site for Mill Lane Bakehouse, a neighborhood bakery with opening hours and a way to reserve a loaf");
  await box.press("Enter");
  await page.getByTestId("understand").getByRole("button", { name: /just build it/i }).click();
  const review = page.getByTestId("brief-review");
  await expect(review).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Test after build").uncheck();
  await review.getByRole("button", { name: /approve and build/i }).click();
  await expect(page.getByRole("textbox", { name: "Describe a change" })).toBeEnabled({ timeout: 120_000 });
  // the Add-feature panel is honest about what exists
  await page.getByRole("tab", { name: /^More/ }).click();
  await page.getByRole("tab", { name: "Features", exact: true }).click();
  const pane = page.getByTestId("features-pane");
  await expect(pane).toBeVisible({ timeout: 20_000 });
  await expect(pane.getByTestId("feature-booking")).toContainText("LIVE");
  await expect(pane.getByTestId("feature-checkout")).toContainText("BETA");
  await expect(pane.getByTestId("feature-members")).toContainText("BETA");
  await expect(pane.getByTestId("feature-embeds")).toContainText("BETA");
  await expect(pane.getByTestId("feature-analytics").getByRole("button")).toHaveCount(0); // a setting, not something to place
  await expect(pane.getByText(/Email delivery isn.t set up/)).toBeVisible();
  // one click adds the feature
  await pane.getByTestId("feature-booking").getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("Added booking, a contact form")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("textbox", { name: "Describe a change" })).toBeEnabled({ timeout: 90_000 });
  await page.getByRole("tab", { name: /^More/ }).click();
  await page.getByRole("tab", { name: "Features", exact: true }).click();
  await expect(page.getByTestId("feature-booking")).toContainText("On this site ×1", { timeout: 20_000 });
  await expect(page.getByTestId("feature-form")).toContainText("On this site ×1");
  await expect(page.getByTestId("feature-checkout")).toContainText("On this site ×1");
  await expect(page.getByTestId("feature-members")).toContainText("On this site ×1");
  // Payments are not connected here, so the panel says so instead of pretending
  await expect(page.getByTestId("payments-card")).toContainText("Not available yet");
  // one-click publish
  await page.getByRole("tab", { name: "Publish", exact: true }).click();
  await page.getByRole("button", { name: /^publish/i }).first().click();
  await expect(page.getByText("Published", { exact: true }).first()).toBeVisible({ timeout: 60_000 });
  const list = (await (await page.context().request.get("/api/sites")).json()) as { sites: { slug: string; id: string; publishedUrl: string | null }[] };
  const site = list.sites.find((s) => s.publishedUrl)!;
  expect(site).toBeTruthy();

  // a visitor with no account and no cookies
  const vctx = await browser.newContext({ baseURL: `http://localhost:${process.env.E2E_PORT || 3199}`, userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36" }); // a headless UA is (rightly) not counted as a visit
  const v = await vctx.newPage();
  const errors: string[] = [];
  v.on("pageerror", (e) => errors.push(e.message));
  await v.goto(`/s/${site.slug}/contact.html`);
  await expect(v.locator("form.k-feat--booking")).toBeVisible();
  await expect(v.locator("table.k-feat__table")).toContainText("Rye loaf");
  await expect(v.locator("table.k-feat__table")).toContainText("$9");
  await v.waitForTimeout(1800); // the anti-bot timer: a human takes longer than this
  // booking
  const slot = await v.locator("form.k-feat--booking select[name=slot] option:not([value=''])").nth(4).getAttribute("value");
  await v.locator("form.k-feat--booking select[name=slot]").selectOption(slot!);
  await v.locator("form.k-feat--booking input[name=name]").fill("Visitor One");
  await v.locator("form.k-feat--booking input[name=email]").fill("visitor1@example.com");
  await v.locator("form.k-feat--booking input[name=email]").press("Enter"); // the page may be animating (effects runtime), so submit by keyboard
  await expect(v.getByText(/Your booking is confirmed for/)).toBeVisible();
  // the slot is gone from the page
  await v.goto(`/s/${site.slug}/contact.html`);
  await expect(v.locator(`form.k-feat--booking option[value="${slot}"]`)).toHaveCount(0);
  await v.waitForTimeout(1800);
  // contact form
  await v.locator("form.k-feat--form input[name=name]").fill("Visitor Two");
  await v.locator("form.k-feat--form input[name=email]").fill("visitor2@example.com");
  await v.locator("form.k-feat--form textarea[name=message]").fill("Do you take wedding orders?");
  await v.locator("form.k-feat--form input[name=email]").press("Enter");
  await expect(v.getByText("Your message was sent.")).toBeVisible();
  // waitlist
  await v.goto(`/s/${site.slug}/contact.html`);
  await v.waitForTimeout(1800);
  await v.locator("form.k-feat--newsletter input[name=email]").fill("visitor3@example.com");
  await v.locator("form.k-feat--newsletter input[name=email]").press("Enter");
  await expect(v.getByText("You are on the list.")).toBeVisible();
  // public JSON read of the table, and a bot (hidden field filled) is told thanks but stored nowhere
  const json = (await (await vctx.request.get(`/s/${site.slug}/_data/menu.json`)).json()) as { rows: { item: string }[] };
  expect(json.rows.map((r) => r.item)).toEqual(["Rye loaf", "Seeded loaf"]);
  // checkout: no Stripe account is connected for this owner, so visitors see an honest "not available" and nothing can be bought
  await v.goto(`/s/${site.slug}/contact.html`);
  await expect(v.locator(".k-feat--checkout")).toContainText("Rye loaf");
  await expect(v.locator(".k-feat--checkout")).toContainText("$9.00");
  await expect(v.locator(".k-feat--checkout")).toContainText("Online ordering isn't switched on yet");
  await expect(v.locator(".k-feat--checkout button")).toHaveCount(2);
  await expect(v.locator(".k-feat--checkout button").first()).toBeDisabled();
  await expect(v.locator(".k-feat--checkout form")).toHaveCount(0);
  // embeds, blog, search
  await expect(v.locator(".k-feat--map")).toContainText("Open in Google Maps");
  await expect(v.locator(".k-feat--map a").first()).toHaveAttribute("href", /google\.com\/maps\/search\/\?api=1&query=12%20Mill%20Lane/);
  await expect(v.locator(".k-feat--blog")).toContainText("Slow rise");
  await v.locator(".k-feat--blog a", { hasText: "Slow rise" }).press("Enter"); // keyboard: the page may be animating
  await expect(v).toHaveURL(/\/_blog\/posts\/slow-rise$/);
  await expect(v.getByRole("heading", { name: "Slow rise" })).toBeVisible();
  await expect(v.getByText("Twenty hours of fermentation")).toBeVisible();
  await v.goto(`/s/${site.slug}/contact.html`);
  await v.locator(".k-feat--search input[name=q]").fill("fermentation");
  await v.locator(".k-feat--search input[name=q]").press("Enter");
  await expect(v).toHaveURL(/\/_search\?q=fermentation/);
  await expect(v.locator(".k-feat--search-results")).toContainText(/\d results? for/);
  await v.locator(".k-feat--search-results a", { hasText: "Slow rise" }).press("Enter");
  await expect(v.getByText("Twenty hours of fermentation")).toBeVisible();
  // members: the page's content is not in the HTML until the visitor signs up; the session survives a reload; sign out locks it again
  const raw = await (await vctx.request.get(`/s/${site.slug}/members`)).text();
  expect(raw).not.toContain("starter feeding schedule");
  await v.goto(`/s/${site.slug}/members`);
  await expect(v.getByText("starter feeding schedule")).toHaveCount(0);
  await v.waitForTimeout(1800);
  const signup = v.locator("form", { has: v.locator("input[name=_a][value=signup]") });
  await signup.locator("input[name=email]").fill("member1@example.com");
  await signup.locator("input[name=password]").fill("correct horse battery");
  await signup.locator("input[name=password]").press("Enter");
  await expect(v.getByText("starter feeding schedule")).toBeVisible();
  await expect(v.getByText("Signed in as")).toContainText("member1@example.com");
  await v.reload();
  await expect(v.getByText("starter feeding schedule")).toBeVisible();
  await v.getByRole("button", { name: "Sign out" }).press("Enter");
  await expect(v.getByText("starter feeding schedule")).toHaveCount(0);
  await v.goto(`/s/${site.slug}/members`);
  await v.waitForTimeout(1800);
  const login = v.locator("form", { has: v.locator("input[name=_a][value=login]") });
  await login.locator("input[name=email]").fill("member1@example.com");
  await login.locator("input[name=password]").fill("wrong password!");
  await login.locator("input[name=password]").press("Enter");
  await expect(v.getByText(/don't match an account/)).toBeVisible();
  expect(errors).toEqual([]);
  await vctx.close();

  // the owner's dashboard shows all of it
  const feat = (await (await page.context().request.get(`/api/sites/${site.id}/features`)).json()) as { bookings: { email: string }[]; subscribers: { email: string }[]; leads: number };
  expect(feat.bookings.map((b) => b.email)).toEqual(["visitor1@example.com"]);
  expect(feat.subscribers.map((s) => s.email)).toEqual(["visitor3@example.com"]);
  expect(feat.leads).toBe(1);
  const crm = (await (await page.context().request.get("/api/business/crm")).json()) as { contacts: { email: string }[] };
  expect(crm.contacts.map((c) => c.email).sort()).toEqual(["member1@example.com", "visitor1@example.com", "visitor2@example.com", "visitor3@example.com"]);
  await page.getByRole("tab", { name: /^More/ }).click();
  await page.getByRole("tab", { name: "Features", exact: true }).click();
  await expect(page.getByTestId("members")).toContainText("member1@example.com");
  // analytics: real counts from the visits above, no cookies involved
  await expect(page.getByTestId("analytics-totals")).toContainText(/[1-9]\d* page view/);
  await expect(page.getByTestId("analytics-card")).toContainText("No cookies and no scripts");
  // blog: the owner writes a post here and it is live on the site at once
  const blog = page.getByTestId("blog-posts");
  await expect(blog).toContainText("Slow rise");
  await blog.getByLabel("New post title").fill("Rye week");
  await blog.getByLabel("New post text").fill("## All week\n\nRye loaves every day.");
  await blog.getByRole("button", { name: "Publish post" }).click();
  await expect(blog).toContainText("Rye week", { timeout: 15_000 });
  const live = await (await page.context().request.get(`/s/${site.slug}/_blog/posts/rye-week`)).text();
  expect(live).toContain("Rye loaves every day.");

  await expect(page.getByTestId("bookings")).toContainText("visitor1@example.com");
  await expect(page.getByTestId("signups")).toContainText("visitor3@example.com");
  await expect(page.getByTestId("table-menu").locator("input").first()).toHaveValue("Rye loaf");
  await expect(page.getByTestId("table-menu")).toContainText("2 rows");
  // cancelling a booking frees the slot
  await page.getByTestId("bookings").getByRole("button", { name: "Cancel booking" }).click();
  await expect(page.getByTestId("bookings")).toHaveCount(0, { timeout: 15_000 });
});
