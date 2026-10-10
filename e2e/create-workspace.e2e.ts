import { test, expect, type Page } from "playwright/test";

test.skip(true, "Site Create UI removed; site-builder backend remains for Apps");

/**
 * Create workspace, in a real browser against a production build and a fake model API (scripts/fake-llm.mjs):
 * three columns, the exact composer text, questions asked in the chat, the improved brief shown for approval, a build with a live
 * "Building preview" panel, an automatic browser test that fills the Screen Library, and no blue buttons or gradient template swatches.
 */
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

async function openCreate(page: Page) {
  await page.goto("/app", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /reject non-essential/i }).click({ timeout: 4000 }).catch(() => undefined);
  await page.getByRole("button", { name: /^create( an? (?:app|site) or image)?$/i }).first().click();
  await page.getByRole("tab", { name: /^site$/i }).click(); // App is the default Create tab; these tests cover the site builder
  await page.waitForSelector("[data-testid=workspace]", { timeout: 30_000 });
}

const isBlue = (rgb: string) => {
  const m = rgb.match(/\d+(\.\d+)?/g)?.map(Number) ?? [];
  const [r, g, b] = m;
  return m.length >= 3 && b > r + 40 && b > g + 25;
};


test.describe.serial("Create workspace", () => {
  const errors: string[] = [];
  test.beforeEach(async ({ page }) => {
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 160)}`));
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|favicon/.test(m.text()) && !(m.location().url === "about:srcdoc" && /Blocked script execution/.test(m.text())) /* the live preview frame is sandboxed without scripts on purpose; this is the test\u2019s own init script being refused there */) errors.push(m.text().slice(0, 160) + " @" + m.location().url.slice(0, 80)); });
  });

  test("desktop: three columns, the reference composer text, Screen Library tab, no blue buttons", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, `ws.${Date.now().toString(36)}@example.com`);
    await openCreate(page);
    const rail = page.getByRole("navigation", { name: "Projects" });
    await expect(rail.getByRole("button", { name: /new chat/i })).toBeVisible();
    await expect(page.getByRole("region", { name: "Conversation" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Preview and library" })).toBeVisible();
    await expect(page.getByPlaceholder("Describe what to build, change, or explore...")).toBeVisible();
    await expect(page.getByRole("tab", { name: /screen library 0/i })).toBeVisible();
    // columns sit side by side, left to right
    const boxes = await Promise.all([rail.boundingBox(), page.getByRole("region", { name: "Conversation" }).boundingBox(), page.getByRole("region", { name: "Preview and library" }).boundingBox()]);
    expect(boxes.every(Boolean)).toBeTruthy();
    expect(boxes[0]!.x).toBeLessThan(boxes[1]!.x);
    expect(boxes[1]!.x).toBeLessThan(boxes[2]!.x);
    // no blue on any button in the workspace
    const bgs = await page.locator("[data-testid=workspace] button").evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor + "|" + getComputedStyle(e).backgroundImage));
    for (const bg of bgs) expect(isBlue(bg.split("|")[0]), bg).toBeFalsy();
    expect(bgs.some((b) => /rgb\(255, 255, 255\)|linear-gradient/.test(b))).toBeTruthy(); // the glow-white primary exists
    // templates: typographic thumbnails, not gradient swatches
    await page.getByRole("button", { name: /start from a template/i }).click();
    const thumbs = page.locator("[data-testid=workspace] button[aria-pressed] span[aria-hidden=true]");
    await expect(thumbs.first()).toBeVisible();
    const imgs = await thumbs.evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundImage));
    for (const i of imgs) expect(i).toBe("none");
  });

  test("questions in the chat, improved brief for approval, live build, automatic browser test, Screen Library", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    // the dissolve lasts about a second; watch for it from inside the page so a slow poll can't miss it
    await page.addInitScript(() => {
      const seen: Record<string, boolean> = ((window as unknown as { __seen: Record<string, boolean> }).__seen = {});
      new MutationObserver(() => {
        const q = (x: string) => Boolean(document.querySelector(x));
        if (q("[data-testid=building] ul[aria-label=Files] li")) seen.chips = true;
        if (q("[data-testid=building] ul[aria-label=Files] li[data-done='1']")) seen.chipDone = true;
        if (q("[data-testid=building] canvas")) seen.canvas = true;
        if (q("[data-testid=building] iframe[title^='Live preview']")) { seen.live = true; }
        if (q("[data-testid=building][data-phase=dissolving]")) seen.dissolved = true;
        if (q("[data-testid=building] [data-working=busy]")) seen.working = true;
        if (q("[data-testid=testing-strip] [data-working=busy]")) seen.testing = true;
      }).observe(document, { subtree: true, childList: true, attributes: true });
    });
    await signIn(page, `ws2.${Date.now().toString(36)}@example.com`);
    await openCreate(page);
    const box = page.locator("#ws-prompt");
    await box.fill("A site for Mill Lane Bakehouse, a neighborhood bakery with opening hours and a way to reserve a loaf");
    await box.press("Enter");
    // first: how the idea was read, with three directions to pick from (all optional)
    const understand = page.getByTestId("understand");
    await expect(understand).toBeVisible({ timeout: 20_000 });
    await expect(understand.getByText("How I read your idea")).toBeVisible();
    const dirs = understand.getByRole("radio");
    expect(await dirs.count()).toBe(3);
    await expect(dirs.first()).toHaveAttribute("aria-checked", "true"); // the suggested one is preselected
    const pickedName = (await dirs.nth(1).locator("strong").innerText()).trim();
    await dirs.nth(1).click();
    await page.screenshot({ path: "test-results/understand.png" });
    await expect(dirs.nth(1)).toHaveAttribute("aria-checked", "true");
    await understand.getByRole("button", { name: /^continue$/i }).click();
    await expect(page.getByTestId("question")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("question")).toContainText(/Question 1 of/);
    // answer one question by typing it into the composer, then skip to the brief
    await box.fill("Reserve a loaf");
    await page.getByRole("button", { name: /^next$/i }).click();
    await page.getByRole("button", { name: /just build it/i }).click();
    const review = page.getByTestId("brief-review");
    await expect(review).toBeVisible({ timeout: 20_000 });
    await expect(review.getByText("Your idea")).toBeVisible();
    await expect(review.getByRole("button", { name: /use the improved version/i })).toBeVisible({ timeout: 20_000 });
    await review.getByRole("button", { name: /use the improved version/i }).click();
    await expect(review.getByText(/The improved description will be used/)).toBeVisible();
    await expect(review.getByRole("radiogroup", { name: "Art direction" })).toBeVisible();
    await expect(review.getByRole("radiogroup", { name: "Art direction" }).getByRole("radio", { checked: true })).toContainText(pickedName); // the choice made up front reached the brief
    await review.getByRole("button", { name: /approve and build/i }).click();
    // the live panel: real status lines from the build, the preview progress, then the test
    await expect(page.getByRole("button", { name: /building the site/i })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("building").or(page.getByText("Test finished"))).toBeVisible({ timeout: 20_000 });
    // streaming build, watched from inside the page so a slow poll can't miss a short state: file chips tick over as closing tags
    // arrive, the first finished page shows live in the sandboxed frame while the forge canvas runs, then the blocks dissolve
    await expect.poll(() => page.evaluate(() => (window as unknown as { __seen: Record<string, boolean> }).__seen.dissolved === true), { timeout: 120_000 }).toBe(true);
    const seen = await page.evaluate(() => (window as unknown as { __seen: Record<string, boolean> }).__seen);
    expect(seen).toMatchObject({ chips: true, chipDone: true, canvas: true, live: true, dissolved: true, working: true });
    await expect(page.getByText("Test finished").first()).toBeVisible({ timeout: 180_000 });
    // the fake site covers everything this brief asked for, so self-review has nothing to fix here
    await expect(page.getByText(/Self-review against the approved brief/)).toHaveCount(0);
    // the browser test showed the same "working" scene (lazy three.js, or its CSS fallback) while it ran
    expect(await page.evaluate(() => (window as unknown as { __seen: Record<string, boolean> }).__seen.testing)).toBe(true);
    await page.getByRole("button", { name: /building the site/i }).click(); // finished groups fold away; open it to read what was done
    await expect(page.getByText(/Reading the approved brief/)).toBeVisible();
    await expect(page.getByText(/Wrote index\.html/)).toBeVisible();
    await expect(page.getByText(/Opening the home page on a phone/)).toBeVisible();
    // requested vs built: the approved brief checked against the finished files, and honest that it is a text check
    await expect(page.getByText(/Requested vs built: \d+ of \d+ found \(a text check of the files\)/)).toBeVisible();
    await expect(page.getByText(/^Name: /).first()).toBeVisible();
    // the preview is a framed phone/desktop view of the saved site
    await page.getByRole("tab", { name: /^preview$/i }).click();
    await expect(page.locator("iframe[title^='Preview of']")).toBeVisible();
    // Screen Library has screenshots at three widths
    await page.getByRole("tab", { name: /screen library/i }).click();
    const imgs = page.locator("button[data-vp] img");
    await expect.poll(async () => imgs.count(), { timeout: 20_000 }).toBeGreaterThanOrEqual(5);
    const vps = await page.locator("button[data-vp]").evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute("data-vp")))]);
    expect(vps.sort()).toEqual(["desktop", "mobile", "tablet"]);
    await expect(imgs.first()).toHaveJSProperty("complete", true);
    // the project shows in the left rail
    await expect(page.getByRole("navigation", { name: "Projects" }).getByRole("button", { name: /^mill lane/i })).toBeVisible();
    // generation never shows round placeholder images
    const round = await page.locator("[data-testid=workspace] img").evaluateAll((els) => els.filter((e) => /50%/.test(getComputedStyle(e).borderRadius)).length);
    expect(round).toBe(0);
  });

  test("phone: chat and preview are separate panes, the project list is a drawer", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, `ws3.${Date.now().toString(36)}@example.com`);
    await openCreate(page);
    await expect(page.getByRole("region", { name: "Conversation" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Preview and library" })).toBeHidden();
    await page.getByRole("group", { name: "Show" }).getByRole("button", { name: "Preview" }).click();
    await expect(page.getByRole("region", { name: "Preview and library" })).toBeVisible();
    await page.getByRole("button", { name: "← Chat" }).click();
    await page.getByRole("button", { name: /open the project list/i }).click();
    await expect(page.getByRole("navigation", { name: "Projects" }).getByRole("button", { name: /new chat/i })).toBeInViewport();
    // nothing spills sideways
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(wide).toBeLessThanOrEqual(1);
  });

  async function toReviewWithExtraPage(page: Page, email: string) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, email);
    await openCreate(page);
    const box = page.locator("#ws-prompt");
    await box.fill("A site for Mill Lane Bakehouse, a neighborhood bakery with opening hours and a way to reserve a loaf");
    await box.press("Enter");
    await page.getByTestId("understand").getByRole("button", { name: /just build it/i }).click();
    const review = page.getByTestId("brief-review");
    await expect(review).toBeVisible({ timeout: 20_000 });
    await review.getByText("Edit details").click();
    const pages = review.getByLabel(/^Pages/);
    await pages.fill("Home, Menu, Contact, Wedding Cakes");
    await pages.blur();
    return review;
  }

  test("self-review: a page the brief asked for but the files lack is offered as one click, and the fix is one pass", async ({ page }) => {
    const review = await toReviewWithExtraPage(page, `ws3.${Date.now().toString(36)}@example.com`);
    await page.getByLabel("Test after build").uncheck();
    await review.getByRole("button", { name: /approve and build/i }).click();
    const offer = page.getByTestId("gap-offer");
    await expect(offer).toBeVisible({ timeout: 90_000 });
    await expect(offer).toContainText("1 thing you asked for isn't in the site yet");
    await offer.getByRole("button", { name: /add what.s missing/i }).click();
    await expect(page.getByText(/Self-review against the approved brief found these missing: page Wedding Cakes/)).toBeVisible({ timeout: 20_000 });
    await expect(offer).toHaveCount(0, { timeout: 90_000 }); // one pass; no loop and no second offer
    expect(await page.getByText(/Self-review against the approved brief found these missing/).count()).toBe(1);
  });

  test("regenerate one section: pick a page and a block, send a scoped edit, a new version appears", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, `ws5.${Date.now().toString(36)}@example.com`);
    await openCreate(page);
    const box = page.locator("#ws-prompt");
    await box.fill("A site for Mill Lane Bakehouse, a neighborhood bakery with opening hours and a way to reserve a loaf");
    await box.press("Enter");
    await page.getByTestId("understand").getByRole("button", { name: /just build it/i }).click();
    const review = page.getByTestId("brief-review");
    await expect(review).toBeVisible({ timeout: 20_000 });
    await page.getByLabel("Test after build").uncheck();
    await review.getByRole("button", { name: /approve and build/i }).click();
    await expect(page.getByRole("tab", { name: /^More/ })).toBeVisible({ timeout: 120_000 });
    await expect(page.getByRole("textbox", { name: "Describe a change" })).toBeEnabled({ timeout: 120_000 }); // build finished
    await page.getByRole("tab", { name: /^More/ }).click();
    await page.getByRole("tab", { name: "Sections", exact: true }).click();
    const pane = page.getByTestId("sections-pane");
    await expect(pane).toBeVisible({ timeout: 30_000 });
    await expect(pane.getByTestId("image-slots")).toBeVisible(); // the fake site has no pictures, so the honest empty state shows
    await expect(pane.getByTestId("slots-none")).toBeVisible();
    const rows = pane.getByTestId("section-row");
    expect(await rows.count()).toBeGreaterThan(0);
    await rows.first().getByRole("button", { name: "Regenerate" }).click();
    await pane.getByPlaceholder(/fresh take/i).fill("shorter and warmer");
    await pane.getByRole("button", { name: "Regenerate this section" }).click();
    await expect(page.getByText(/Rewrite only the .* on index\.html\. What I want from it: shorter and warmer/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Do not change any other section/).first()).toBeVisible();
    // the edit finished: History now has a second version and it is the current one
    await page.getByRole("tab", { name: /^More/ }).click();
    await page.getByRole("tab", { name: "History", exact: true }).click();
    await expect(page.getByText("v2 · current")).toBeVisible({ timeout: 90_000 });
    // compare v1 with the current version, with files that differ (served by a stub, since the fake model returns identical files for an edit)
    await page.route(/\/versions\?n=\d+/, (route) => {
      const n = Number(new URL(route.request().url()).searchParams.get("n"));
      return route.fulfill({ json: { n, summary: "", createdAt: "", files: n === 1 ? { "index.html": "<h1>One</h1>\n<p>same</p>", "old.css": "a{}" } : { "index.html": "<h1>Two</h1>\n<p>same</p>\n<p>new</p>", "new.html": "x" } } });
    });
    await page.getByRole("button", { name: "Compare" }).first().click();
    const cmp = page.getByTestId("compare");
    await expect(cmp).toBeVisible();
    await expect(cmp.getByTestId("compare-total")).toHaveText(/3 files differ · \+3 \/ −2 lines \(v1 → v2\)/, { timeout: 20_000 });
    await cmp.getByRole("button", { name: "Show lines" }).click();
    const lines = cmp.getByTestId("compare-lines");
    await expect(lines).toContainText("- <h1>One</h1>");
    await expect(lines).toContainText("+ <h1>Two</h1>");
    await expect(lines).toContainText("+ <p>new</p>");
    await cmp.getByLabel("To version").selectOption("1");
    await expect(cmp.getByTestId("compare-same")).toBeVisible();
    // on a phone the compare view and the long file names stay inside the screen
    await cmp.getByLabel("To version").selectOption("2");
    await cmp.getByRole("button", { name: "Show lines" }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(cmp).toBeVisible();
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over).toBeLessThanOrEqual(1);
    const cbox = await cmp.boundingBox();
    expect(cbox && cbox.x >= 0 && cbox.x + cbox.width <= 391).toBe(true);
  });

  test("self-review with 'Test after build' on: one automatic fix pass, then the browser test", async ({ page }) => {
    const review = await toReviewWithExtraPage(page, `ws4.${Date.now().toString(36)}@example.com`);
    await review.getByRole("button", { name: /approve and build/i }).click();
    await expect(page.getByText(/Self-review against the approved brief found these missing: page Wedding Cakes/)).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText("Test finished").first()).toBeVisible({ timeout: 180_000 });
    expect(await page.getByText(/Self-review against the approved brief found these missing/).count()).toBe(1);
    await expect(page.getByTestId("gap-offer")).toHaveCount(0);
  });

  test("no console or page errors across the run", () => {
    expect(errors).toEqual([]);
  });
});
