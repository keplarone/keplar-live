import { test, expect, type Page } from "playwright/test";
import { mkdirSync } from "node:fs";

/**
 * Home > Creation ("From answers to outcomes."): the preview cards (Website, App, Image, Video, Code, Research) must never clip their content,
 * once the scroll animation has spread the stacked cards into the grid. Light and Dark, desktop to phone.
 * Set SHOTS_DIR to also save a screenshot per width/theme.
 */
const WIDTHS: [number, number][] = [[1440, 900], [1366, 768], [1536, 864], [1680, 1050], [1920, 1080], [2560, 1440], [3440, 1440], [1024, 768], [1024, 600], [1280, 500], [768, 1024], [390, 844]];
const THEMES = ["light", "dark"] as const;

async function settle(page: Page) {
  const pinned = await page.evaluate(async () => {
    const sec = document.querySelector<HTMLElement>('section[aria-labelledby="creation-title"]')!;
    const top = sec.getBoundingClientRect().top + window.scrollY;
    // the scroll animation runs from the section's top to its bottom meeting the viewport's bottom: scroll to the end of it
    window.scrollTo(0, Math.max(top, top + sec.offsetHeight - window.innerHeight));
    await new Promise((r) => setTimeout(r, 2800)); // scrub: 1 smoothing + settle
    return getComputedStyle(sec.firstElementChild!).position === "sticky";
  });
  // every card is back at identity: the cards are in their final grid places
  const moved = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('section[aria-labelledby="creation-title"] [data-tile]')].filter((t) => {
    const m = new DOMMatrixReadOnly(getComputedStyle(t).transform);
    return Math.abs(m.m41) > 0.5 || Math.abs(m.m42) > 0.5 || Math.abs(m.a - 1) > 0.002 || Math.abs(m.b) > 0.002;
  }).length);
  expect(moved, "cards still mid-animation").toBe(0);
  return pinned;
}

/** Every element in the section that hides overflow while its content is bigger than its box. */
async function clipped(page: Page) {
  return page.evaluate(() => {
    const sec = document.querySelector<HTMLElement>('section[aria-labelledby="creation-title"]')!;
    // Settled, the tiles sit at identity transforms. A preserve-3d + perspective stack makes browsers report a phantom, projected scrollWidth/Height
    // for every ancestor, so measure with the 3D context flattened (no layout change at identity).
    sec.querySelectorAll<HTMLElement>("ul").forEach((u) => { u.style.transformStyle = "flat"; });
    const out: string[] = [];
    for (const el of [sec, ...Array.from(sec.querySelectorAll<HTMLElement>("*"))]) {
      const cs = getComputedStyle(el);
      if (cs.display === "inline") continue;
      const clips = (v: string) => v === "hidden" || v === "clip" || v === "auto" || v === "scroll";
      // ellipsis captions truncate on purpose (text-overflow); everything else must fit
      if (cs.textOverflow === "ellipsis") continue;
      // scrollHeight also counts the element's own bottom padding, so measure real content: do any descendants' boxes fall outside this box?
      const box = el.getBoundingClientRect();
      const bw = (n: string) => parseFloat(n) || 0;
      const inner = { top: box.top + bw(cs.borderTopWidth), bottom: box.bottom - bw(cs.borderBottomWidth), left: box.left + bw(cs.borderLeftWidth), right: box.right - bw(cs.borderRightWidth) };
      let outV = false, outH = false;
      for (const d of Array.from(el.querySelectorAll<HTMLElement>("*"))) {
        const r = d.getBoundingClientRect();
        if (!r.width && !r.height) continue;
        if (getComputedStyle(d).visibility === "hidden") continue;
        if (r.bottom > inner.bottom + 1 || r.top < inner.top - 1) outV = true;
        if (r.right > inner.right + 1 || r.left < inner.left - 1) outH = true;
      }
      const v = clips(cs.overflowY) && el.scrollHeight > el.clientHeight + 1 && outV;
      const h = clips(cs.overflowX) && el.scrollWidth > el.clientWidth + 1 && outH;
      if (v || h) out.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]} scrollH ${el.scrollHeight} > clientH ${el.clientHeight} | scrollW ${el.scrollWidth} > clientW ${el.clientWidth}`);
    }
    return out;
  });
}

for (const [w, h] of WIDTHS) {
  for (const theme of THEMES) {
    test(`Creation cards never clip their content at ${w}x${h}, ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.addInitScript((t) => { try { localStorage.setItem("keplar-theme", t); } catch { /* ignore */ } }, theme);
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: /reject non-essential/i }).click({ timeout: 3000 }).catch(() => undefined);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await page.locator('section[aria-labelledby="creation-title"]').waitFor({ state: "attached" });
      const pinned = await settle(page);
      const dir = process.env.SHOTS_DIR;
      if (dir) {
        mkdirSync(dir, { recursive: true });
        // pinned: the screen as the visitor sees it; stacked (narrow) layout: the whole section, without scrolling away from the settled animation
        if (pinned) await page.screenshot({ path: `${dir}/${w}x${h}-${theme}.png` });
        else {
          const r = await page.locator('section[aria-labelledby="creation-title"]').evaluate((el) => { const b = el.getBoundingClientRect(); return { x: 0, y: b.top + window.scrollY, width: window.innerWidth, height: b.height }; });
          await page.screenshot({ path: `${dir}/${w}x${h}-${theme}.png`, fullPage: true, clip: r });
        }
      }
      // the code card's last line is on screen, inside its box
      const code = page.locator('section[aria-labelledby="creation-title"] [data-art="code"]');
      const pre = code.locator("pre");
      const box = await pre.boundingBox();
      const last = await pre.evaluate((el) => { const r = document.createRange(); r.selectNodeContents(el.firstElementChild!); const rs = r.getClientRects(); const b = rs[rs.length - 1]; return { bottom: b.bottom, right: b.right }; });
      expect(box).not.toBeNull();
      expect(last.bottom, "last code line inside the card").toBeLessThanOrEqual(box!.y + box!.height + 0.5);
      expect(last.right, "longest code line inside the card").toBeLessThanOrEqual(box!.x + box!.width + 0.5);
      expect(await clipped(page), "elements whose content is clipped by overflow").toEqual([]);
    });
  }
}
