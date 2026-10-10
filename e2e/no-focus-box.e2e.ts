import { test, expect, type Page } from "playwright/test";

/**
 * Regression: clicking or tapping anything draws no focus box (outline, ring, glow around the nav capsule / a section / a card / a canvas).
 * For each public page and /app, at 360 and 1440, Light and Dark: press (mouse down) on sections, cards, the canvas, nav items and buttons,
 * then assert no focused/active element or ancestor has an outline, and no ancestor's box-shadow changed because of the press.
 * Typing fields are the one exception (a field may show it is being typed in). Keyboard focus shows a non-box cue (filter + underline), never an outline.
 */
let hop = 0;
async function signIn(page: Page, email: string) {
  const ctx = page.context();
  const h = { "content-type": "application/json", origin: `http://localhost:${process.env.E2E_PORT || 3199}`, "x-forwarded-for": `10.57.${(Date.now() >> 3) & 255}.${++hop}` };
  expect((await ctx.request.post("/api/auth/sign-in/magic-link", { headers: h, data: { email, callbackURL: "/app" } })).ok()).toBeTruthy();
  const html = await (await ctx.request.get("/dev/outbox")).text();
  const link = [...html.matchAll(/href="(http[^"]*token=[^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"))[0];
  expect(link).toBeTruthy();
  expect((await ctx.request.post("/api/auth/magic-link/confirm", { headers: h, data: { token: new URL(link).searchParams.get("token") } })).ok()).toBeTruthy();
  await ctx.request.post("/api/onboarding", { headers: { "content-type": "application/json", origin: h.origin }, data: { action: "complete", answers: { name: "Alex" } } });
}

/** Chain of the pressed element up to <html>, with the facts that matter. */
type Facts = { tag: string; cls: string; outline: string; shadow: string; field: boolean; role: boolean };
const chainFacts = ([x, y]: [number, number]) => {
  const out: Facts[] = [];
  const hit = document.elementFromPoint(x, y);
  for (let el: Element | null = hit; el && el !== document.documentElement; el = el.parentElement) {
    const cs = getComputedStyle(el);
    out.push({
      tag: el.tagName.toLowerCase(),
      cls: String((el.className as unknown as { baseVal?: string }).baseVal ?? el.className).replace(/\S*__/g, "").slice(0, 40),
      outline: cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0 ? cs.outline : "none",
      shadow: cs.boxShadow,
      role: /^(button|tab|menuitem|link)$/.test(el.getAttribute("role") || ""),
      field: /^(input|textarea|select)$/i.test(el.tagName) || (el as HTMLElement).isContentEditable,
    });
  }
  return out;
};

async function press(page: Page, x: number, y: number) {
  await page.mouse.move(x, y);
  await page.waitForTimeout(300);
  const before = await page.evaluate(chainFacts, [x, y] as [number, number]);
  await page.mouse.down();
  await page.waitForTimeout(300);
  const after = await page.evaluate(chainFacts, [x, y] as [number, number]);
  const tap = await page.evaluate(() => getComputedStyle(document.body).getPropertyValue("-webkit-tap-highlight-color"));
  await page.mouse.move(2, 2); // leave before release: nothing is activated, no navigation
  await page.mouse.up();
  return { before, after, tap };
}

/** Pressing may shade a control (`[data-lit]:active` dims it inset) but no element in the chain may gain an outer glow/ring or an inset spread ring. */
function expectNoRing(before: Facts[], after: Facts[], where: string) {
  const parts = (s: string) => s.split(/,(?![^(]*\))/).map((x) => x.trim()).filter((x) => x && x !== "none");
  const key = (arr: Facts[], i: number) => `${arr.length - i}:${arr[i].tag}.${arr[i].cls}`; // depth from <html> + tag + class: four <li class=plan> stay distinct
  const was = new Map(before.map((_, i) => [key(before, i), before[i].shadow]));
  if (after.some((e) => e.field)) return; // a field being typed in may glow its group
  after.forEach((el, i) => {
    const b = was.get(key(after, i));
    if (b === undefined) return;
    const old = parts(b);
    for (const p of parts(el.shadow).filter((x) => !old.includes(x))) {
      expect(/inset/.test(p), `${where}: new outer ring/glow on ${el.tag}.${el.cls}: ${p}`).toBe(true);
      expect(/ 0px 0px 0px [1-9]\d*px inset/.test(p), `${where}: new inset ring on ${el.tag}.${el.cls}: ${p}`).toBe(false);
    }
  });
}

const PAGES = ["/", "/pricing", "/about", "/help", "/signin"];
for (const w of [360, 1440]) for (const theme of ["light", "dark"] as const) {
  test(`no focus box on press, public pages at ${w} ${theme}`, async ({ browser }) => {
    test.setTimeout(300_000);
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, colorScheme: theme });
    await ctx.addInitScript((t) => { try { localStorage.setItem("keplar-theme", t); } catch { /* ignore */ } }, theme);
    const page = await ctx.newPage();
    let pressed = 0;
    for (const path of PAGES) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: /reject non-essential/i }).click({ timeout: 2500 }).catch(() => undefined);
      await page.waitForTimeout(700);
      const targets = await page.evaluate(() => {
        const pick: { y: number; x: number; q: string }[] = [];
        const add = (q: string, n: number) => {
          let k = 0;
          for (const e of document.querySelectorAll(q)) {
            const r = e.getBoundingClientRect();
            if (r.width < 12 || r.height < 12 || getComputedStyle(e).visibility === "hidden" || e.closest("input,textarea,select")) continue;
            pick.push({ q, x: r.x + Math.min(r.width / 2, 120), y: r.y + window.scrollY + Math.min(r.height / 2, 40) });
            if (++k >= n) break;
          }
        };
        add("nav a, nav button", 4); add("main button, main a", 5); add("section", 4); add("li", 3); add("canvas", 1); add("summary", 2); add("h1, h2", 2);
        return pick;
      });
      for (const t of targets) {
        await page.evaluate((y) => window.scrollTo(0, Math.max(0, y - 260)), t.y);
        await page.waitForTimeout(120);
        const vy = t.y - (await page.evaluate(() => window.scrollY));
        if (vy < 4 || vy > 890 || t.x > w - 2) continue;
        const { before, after, tap } = await press(page, t.x, vy);
        pressed++;
        expect(tap, "tap highlight is transparent").toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
        for (const el of after) {
          if (el.field) continue;
          expect(el.outline, `${path} ${t.q}: outline on ${el.tag}.${el.cls}`).toBe("none");
        }
        expectNoRing(before, after, `${path} ${t.q}`);
      }
    }
    expect(pressed).toBeGreaterThan(15);
    await ctx.close();
  });
}

test("keyboard focus is a non-box cue (no outline, brightness + underline)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /reject non-essential/i }).click({ timeout: 2500 }).catch(() => undefined);
  await page.waitForTimeout(500);
  for (let i = 0; i < 4; i++) await page.keyboard.press("Tab");
  const f = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const cs = getComputedStyle(el);
    return { tag: el.tagName, vis: el.matches(":focus-visible"), outline: cs.outlineStyle, filter: cs.filter, deco: cs.textDecorationLine };
  });
  expect(f.vis).toBe(true);
  expect(f.outline).toBe("none");
  expect(f.filter).not.toBe("none");
  if (/^(A|BUTTON)$/.test(f.tag)) expect(f.deco).toContain("underline");
});

test("/app: pressing the composer's tool buttons and sidebar draws no box", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, `fb.${Date.now().toString(36)}@example.com`);
  await page.goto("/app", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /reject non-essential/i }).click({ timeout: 4000 }).catch(() => undefined);
  await page.waitForTimeout(1500);
  const spots = await page.evaluate(() => [...document.querySelectorAll("main button, aside button, nav button, header button")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 12 && r.height > 12 && r.y >= 0 && r.y < 880 && getComputedStyle(e).visibility !== "hidden"; }).slice(0, 8).map((e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }));
  expect(spots.length).toBeGreaterThan(2);
  for (const s of spots) {
    const { before, after } = await press(page, s.x, s.y);
    for (const el of after) {
      if (el.field) continue;
      expect(el.outline, `outline on ${el.tag}.${el.cls}`).toBe("none");
    }
    expectNoRing(before, after, "/app");
  }
});

for (const theme of ["light", "dark"] as const) {
  test(`hovering buttons adds no outer glow box (1440 ${theme})`, async ({ browser }) => {
    test.setTimeout(240_000);
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
    await ctx.addInitScript((t) => { try { localStorage.setItem("keplar-theme", t); } catch { /* ignore */ } }, theme);
    const page = await ctx.newPage();
    const outerOf = (s: string) => s.split(/,(?![^(]*\))/).map((x) => x.trim()).filter((x) => x && x !== "none" && !/inset/.test(x));
    let hovered = 0;
    for (const path of ["/", "/pricing", "/signin", "/download", "/help"]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: /reject non-essential/i }).click({ timeout: 2500 }).catch(() => undefined);
      await page.waitForTimeout(700);
      const n = await page.locator("button:visible, a[class*='button' i]:visible, [data-lit]:visible").count();
      for (let i = 0; i < Math.min(n, 14); i++) {
        const el = page.locator("button:visible, a[class*='button' i]:visible, [data-lit]:visible").nth(i);
        await el.scrollIntoViewIfNeeded().catch(() => undefined);
        const b = await el.boundingBox();
        if (!b || b.y < 4 || b.y + b.height > 896) continue;
        await page.mouse.move(2, 2);
        await page.waitForTimeout(450);
        const rest = outerOf(await el.evaluate((e) => getComputedStyle(e).boxShadow));
        await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
        await page.waitForTimeout(700);
        const hot = outerOf(await el.evaluate((e) => getComputedStyle(e).boxShadow));
        hovered++;
        for (const p of hot) expect(rest, `${path}: hover adds an outer glow/ring to button #${i}: ${p}`).toContain(p);
      }
    }
    expect(hovered).toBeGreaterThan(10);
    await ctx.close();
  });
}
