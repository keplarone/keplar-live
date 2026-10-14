import { test, expect, type Page, type BrowserContext } from "playwright/test";

/** The sidebar Recents list: open by default (it can fold), remembered per account, keyboard operable, reveals a selected chat, delete + undo still work, fits on a phone. */
const stamp = Date.now().toString(36);
const EMAIL = `recents.${stamp}@example.com`;
const T = ["Alpha roadmap", "Bravo budget", "Charlie notes"].map((t) => `${t} ${stamp}`);

async function signIn(page: Page, email: string) {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.95.${(Date.now() >> 4) & 255}.${Math.floor(Math.random() * 200) + 1}` });
  await page.goto("/signin?next=%2Fapp");
  await page.getByLabel(/email/i).first().fill(email);
  await page.getByRole("button", { name: /email me a sign-in link/i }).click();
  let href: string | null = null;
  await expect(async () => {
    await page.goto("/dev/outbox");
    const all = await page.locator("a[href*='/signin/verify']").evaluateAll((as, em) => as.filter((a) => (a.parentElement?.parentElement?.textContent ?? "").includes(`to ${em}`)).map((a) => (a as HTMLAnchorElement).href), email); // this address's mail only
    href = all[0] ?? null;
    expect(href).toBeTruthy();
  }).toPass({ timeout: 30_000 });
  await page.goto(href!);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL(/\/(app|welcome)/, { timeout: 30_000 });
}
const seed = async (ctx: BrowserContext, id: string, title: string) => {
  const r = await ctx.request.put(`/api/chats/${id}`, { data: { title: title, messages: [{ id: `u-${id}`, role: "user", text: `Question about ${title}`, attachments: [], modes: { web: false, deepResearch: false, create: false, agent: false }, createdAt: Date.now() }] } });
  expect(r.status()).toBe(200);
};
const toggle = (page: Page) => page.locator("[data-recents-toggle]").first();
const region = (page: Page) => page.locator("[data-recents] > [role=region]").first(); // hidden from the accessibility tree while collapsed
async function load(page: Page) {
  await expect(async () => {
    await page.goto("/app");
    await toggle(page).waitFor({ timeout: 20_000 });
    await expect(page.locator("[data-recents-count]").first()).toHaveText("3", { timeout: 8_000 });
  }).toPass({ timeout: 60_000 });
}

test.describe.serial("sidebar Recents", () => {
  let ctx: BrowserContext;
  let page: Page;
  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    page = await ctx.newPage();
    page.on("dialog", (d) => void d.dismiss());
    await signIn(page, EMAIL);
    for (const [i, t] of T.entries()) await seed(ctx, `e2e-r${i}-${stamp}`, t);
  });
  test.afterAll(async () => { await ctx.close(); });

  test("open by default with a count; folds with Enter and Space; the choice is remembered per account", async () => {
    await load(page);
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "true"); // minimal pass: Recents shows directly
    await expect(toggle(page)).toContainText("Recents");
    await expect(page.getByRole("button", { name: T[0], exact: true })).toBeVisible();
    await toggle(page).focus();
    await page.keyboard.press("Enter");
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("button", { name: T[0], exact: true })).toBeHidden(); // folded: not shown, not focusable
    await page.keyboard.press("Space");
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Enter");
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
    const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("keplar.recents.open.v1:")));
    expect(keys.length).toBe(1);
    expect(keys[0]).not.toMatch(/:anon$/); // stored under this account
    await load(page); // reload: stays folded
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
    await toggle(page).click();
    await load(page);
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
    await toggle(page).click(); // leave it folded for the tests below
    await load(page);
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
  });

  test("animates the height, and not with reduced motion", async () => {
    const dur = () => region(page).evaluate((e) => getComputedStyle(e).transitionDuration);
    expect(await dur()).toContain("0.22s");
    const rm = await ctx.newPage();
    await rm.emulateMedia({ reducedMotion: "reduce" });
    await rm.goto("/app");
    await rm.locator("[data-recents-toggle]").first().waitFor({ timeout: 30_000 });
    expect(await rm.locator("[data-recents] > [role=region]").first().evaluate((e) => getComputedStyle(e).transitionDuration)).toBe("0s");
    await rm.close();
  });

  test("picking a chat from History reveals it in the list and highlights it, without changing the saved choice", async () => {
    await load(page);
    const more = page.locator("[data-more]").first();
    const hist = page.locator("nav[aria-label=Keplar] [data-nav=history]").first(); // a /app/history link since 941a5c1
    if (!(await hist.isVisible())) await more.click();
    await hist.click();
    await page.getByRole("button", { name: new RegExp(`^${T[1]}`) }).first().click();
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("[data-recents-toggle] ~ div button[aria-current=page]")).toHaveText(T[1]);
    await load(page); // reload: the saved choice (closed) is unchanged
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
  });

  test("delete and undo still work inside it", async () => {
    await toggle(page).click();
    const row = page.locator("li", { has: page.getByRole("button", { name: T[2], exact: true }) }).first();
    await row.hover();
    await row.getByRole("button", { name: /^Delete chat/ }).click();
    await page.locator("[data-delete-yes]").click();
    await expect(page.getByRole("button", { name: T[2], exact: true })).toHaveCount(0);
    await expect(page.locator("[data-recents-count]").first()).toHaveText("2");
    // The undo toast is the kit's (notify): find it in the Notifications list.
    await page.getByRole("list", { name: "Notifications" }).getByRole("listitem").filter({ hasText: "Deleted" }).getByRole("button", { name: "Undo" }).click();
    await expect(page.getByRole("button", { name: T[2], exact: true })).toBeVisible();
    await expect(page.locator("[data-recents-count]").first()).toHaveText("3");
  });

  test("works in the phone drawer and its text fits", async () => {
    await page.setViewportSize({ width: 340, height: 900 });
    await page.goto("/app");
    await page.getByRole("button", { name: "Open sidebar" }).click();
    const t = toggle(page);
    await expect(t).toBeVisible({ timeout: 30_000 });
    if ((await t.getAttribute("aria-expanded")) !== "true") await t.click();
    await expect(page.getByRole("button", { name: T[0], exact: true })).toBeVisible();
    const bad = await page.locator("#keplar-sidebar").evaluate((nav) => {
      const box = nav.getBoundingClientRect();
      return [...nav.querySelectorAll<HTMLElement>("[data-recents-toggle], [data-recents-toggle] *, [data-recents=open] ul button")].filter((e) => e.offsetParent !== null && (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).textOverflow !== "ellipsis" || e.getBoundingClientRect().right > box.right + 1)).map((e) => e.textContent?.slice(0, 30));
    });
    expect(bad).toEqual([]);
    await t.click();
    await expect(t).toHaveAttribute("aria-expanded", "false");
    await page.setViewportSize({ width: 1280, height: 800 });
  });
});

/**
 * Regression: with a long list and a window shorter than the sidebar's content, the Recents row used to be squeezed to zero height and drawn
 * under the usage card (its top border ran through the word "Recents"), and opening it showed nothing. The nav and Recents now scroll as one
 * area above a pinned card (or the whole sidebar scrolls on short windows), and a count above the 14 shown ends with "See all".
 */
test.describe.serial("sidebar Recents with a long list", () => {
  const EMAIL2 = `recents.long.${stamp}@example.com`;
  const N = 16;
  let ctx: BrowserContext;
  let page: Page;
  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    page = await ctx.newPage();
    await signIn(page, EMAIL2);
    for (let i = 0; i < N; i++) await seed(ctx, `e2e-long${i}-${stamp}`, `Long list chat ${String(i + 1).padStart(2, "0")} ${stamp}`);
  });
  test.afterAll(async () => { await ctx.close(); });

  const geometry = (p: Page) =>
    p.evaluate(() => {
      const nav = document.querySelector<HTMLElement>("nav[aria-label=Keplar]")!;
      const toggle = document.querySelector<HTMLElement>("[data-recents-toggle]")!;
      const meter = [...nav.children].find((c) => /meter/.test(c.className)) as HTMLElement;
      const rows = [...document.querySelectorAll<HTMLElement>("[data-recents] ul > li:not(:has([data-recents-all]))")];
      const r = (e: Element) => e.getBoundingClientRect();
      return {
        toggleH: Math.round(r(toggle).height),
        toggleAboveCard: r(toggle).bottom <= r(meter).top + 1,
        rows: rows.length,
        // the area the rows live in ends above the card (rows scrolled out of it are clipped, not drawn under the card)
        rowsAboveCard: r(document.querySelector("[data-side-scroll]")!).bottom <= r(meter).top + 1,
        meterTop: Math.round(r(meter).top),
        cardInsideSidebar: r(meter).bottom <= r(nav).bottom + 1 || nav.scrollHeight > nav.clientHeight, // either fits, or the sidebar scrolls
      };
    });

  for (const h of [800, 600, 480]) {
    test(`at ${h}px tall the row keeps its height and sits above the usage card, and opening it shows the chats`, async () => {
      await page.setViewportSize({ width: 1280, height: h });
      await expect(async () => {
        await page.goto("/app");
        await toggle(page).waitFor({ timeout: 20_000 });
        await expect(page.locator("[data-recents-count]").first()).toHaveText(String(N), { timeout: 8_000 });
      }).toPass({ timeout: 60_000 });
      if ((await toggle(page).getAttribute("aria-expanded")) !== "true") await toggle(page).click();
      await expect(page.getByRole("button", { name: new RegExp(`^Long list chat 16 `) })).toBeVisible();
      const g = await geometry(page);
      expect(g.toggleH).toBeGreaterThanOrEqual(30);
      expect(g.toggleAboveCard).toBe(true);
      expect(g.rowsAboveCard).toBe(true);
      expect(g.cardInsideSidebar).toBe(true);
      // the newest chat can be brought into view inside the sidebar
      const first = page.getByRole("button", { name: new RegExp(`^Long list chat 16 `) });
      await first.scrollIntoViewIfNeeded();
      const box = await first.boundingBox();
      const side = await page.locator("nav[aria-label=Keplar]").boundingBox();
      expect(box!.y).toBeGreaterThanOrEqual(side!.y - 1);
      expect(box!.y + box!.height).toBeLessThanOrEqual(side!.y + side!.height + 1);
      expect(box!.y + box!.height).toBeLessThanOrEqual((await geometry(page)).meterTop + 1);
      await toggle(page).click(); // leave it closed for the next size
    });
  }

  /**
   * Regression (bug-0006): opening Recents called Element.scrollIntoView, which scrolls every scrollable ancestor. Fired 30 ms into the
   * expand, before the sidebar had room, it pushed the fixed overflow:hidden app shell itself up (~70-90px) whenever anything in the shell
   * reached below the screen: the logo and top bar went off screen, a blank band opened at the bottom, and the wheel could never undo it.
   * Now only the sidebar's own scroll area moves, and the shell is overflow:clip (never a scroll container).
   */
  for (const h of [800, 600]) {
    test(`at ${h}px tall opening Recents and wheeling the sidebar never moves the app shell; every row renders at bottom, middle and top`, async () => {
      await page.setViewportSize({ width: 1280, height: h });
      await expect(async () => {
        await page.goto("/app");
        await toggle(page).waitFor({ timeout: 20_000 });
        await expect(page.locator("[data-recents-count]").first()).toHaveText(String(N), { timeout: 8_000 });
      }).toPass({ timeout: 60_000 });
      if ((await toggle(page).getAttribute("aria-expanded")) === "true") { await toggle(page).click(); await page.waitForTimeout(400); }
      // something in the shell reaching below the screen (as on the recorded account) used to make the shell scrollable by script
      await page.evaluate(() => { const d = document.createElement("div"); d.style.cssText = "position:absolute;left:0;top:100%;width:1px;height:90px"; document.querySelector("[data-app-ready]")!.appendChild(d); });
      const shell = () => page.evaluate(() => {
        const app = document.querySelector<HTMLElement>("[data-app-ready]")!;
        const nav = document.querySelector<HTMLElement>("nav[aria-label=Keplar]")!;
        const r = (e: Element) => e.getBoundingClientRect();
        const rows = [...nav.querySelectorAll<HTMLElement>("[data-recents=open] ul > li")];
        return {
          appTop: app.scrollTop,
          overflow: getComputedStyle(app).overflowY,
          navTop: Math.round(r(nav).top),
          topbarTop: Math.round(r(document.querySelector("header")!).top),
          flatRows: rows.filter((li) => r(li).height < 20).length,
          rows: rows.length,
          brandTop: Math.round(r(nav.querySelector("a[aria-label='Keplar home']")!).top),
          meterBottom: Math.round(r([...nav.children].find((c) => /meter/.test(c.className))!).bottom),
          navBottom: Math.round(r(nav).bottom),
        };
      });
      await toggle(page).click();
      await page.waitForTimeout(700);
      const opened = await shell();
      expect(opened.overflow).toBe("clip");
      expect(opened.appTop).toBe(0);
      expect(opened.topbarTop).toBe(0);
      expect(opened.navTop).toBeGreaterThanOrEqual(0);
      expect(opened.rows).toBe(15); // 14 chats + "See all"
      expect(opened.flatRows).toBe(0);
      await page.mouse.move(100, h / 2);
      for (let i = 0; i < 16; i++) await page.mouse.wheel(0, 200);
      await page.waitForTimeout(400);
      const bottom = await shell();
      expect(bottom.appTop).toBe(0);
      expect(bottom.flatRows).toBe(0);
      expect(bottom.meterBottom).toBeLessThanOrEqual(bottom.navBottom + 1); // the usage card is reachable, inside the sidebar
      await expect(page.locator("[data-recents-all]")).toBeInViewport();
      await page.mouse.wheel(0, -250);
      await page.waitForTimeout(400);
      expect((await shell()).appTop).toBe(0);
      for (let i = 0; i < 16; i++) await page.mouse.wheel(0, -200);
      await page.waitForTimeout(400);
      const top = await shell();
      expect(top.appTop).toBe(0);
      expect(top.brandTop).toBeGreaterThanOrEqual(top.navTop); // logo, New chat and Search are back at the top
      await expect(page.locator("nav[aria-label=Keplar] [data-nav=search]")).toBeInViewport();
      await toggle(page).click();
    });
  }

  test("the badge is the true total; the list shows 14 and ends with a way to the rest", async () => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/app");
    await toggle(page).waitFor({ timeout: 20_000 });
    await expect(page.locator("[data-recents-count]").first()).toHaveText(String(N), { timeout: 15_000 });
    if ((await toggle(page).getAttribute("aria-expanded")) !== "true") await toggle(page).click();
    expect((await geometry(page)).rows).toBe(14);
    const all = page.locator("[data-recents-all]");
    await expect(all).toHaveText(`See all ${N} chats`);
    await all.scrollIntoViewIfNeeded();
    await all.click();
    await expect(page.locator("[data-nav=history]").first()).toHaveAttribute("aria-current", "page");
  });

  test("on a phone the open list is reachable in the drawer (390x844)", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/app");
    await page.getByRole("button", { name: "Open sidebar" }).click();
    const t = toggle(page);
    await expect(t).toBeVisible({ timeout: 30_000 });
    if ((await t.getAttribute("aria-expanded")) !== "true") await t.click();
    const g = await geometry(page);
    expect(g.toggleH).toBeGreaterThanOrEqual(30);
    expect(g.toggleAboveCard && g.rowsAboveCard).toBe(true);
    const last = page.getByRole("button", { name: new RegExp(`^Long list chat 03 `) });
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeVisible();
  });
});
