import { test, expect, type Page } from "playwright/test";

/** /simulation: a guided, auto-playing, scroll-driven walkthrough. Labelled as a simulation, no live calls, controls and keyboard work, text fits at phone width. */
const chapter = (page: Page) => page.getByTestId("simulation").getAttribute("data-chapter");

test("labelled, auto-plays, pauses, steps, keyboard, agent approval is scripted", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const calls: string[] = [];
  page.on("request", (r) => { if (/\/api\/(chat|ask|orchestrat|answer|agents)/.test(r.url())) calls.push(r.url()); });
  await page.goto("/simulation");
  await page.getByRole("button", { name: /reject non-essential/i }).click({ timeout: 3000 }).catch(() => undefined);
  const sim = page.getByTestId("simulation");
  await expect(sim.getByText("SIMULATION", { exact: true })).toBeVisible();
  await expect(sim.getByText(/No model is called/)).toBeVisible();
  expect(await chapter(page)).toBe("intro");
  // it starts by itself and moves on without any input
  await expect.poll(() => chapter(page), { timeout: 40_000 }).not.toBe("intro");
  await expect(sim.getByRole("button", { name: "Pause" })).toBeVisible();
  await sim.getByRole("button", { name: "Pause" }).click();
  const held = await chapter(page);
  await page.waitForTimeout(2500);
  expect(await chapter(page)).toBe(held);
  await expect(sim.getByRole("button", { name: "Play" })).toBeVisible();
  // step by button and by keyboard
  await page.getByRole("button", { name: "Go to Start", exact: true }).click();
  await expect.poll(() => chapter(page)).toBe("intro");
  await sim.getByRole("button", { name: "Next step" }).click();
  await expect.poll(() => chapter(page)).toBe("ask");
  await page.locator("body").press("ArrowRight");
  await expect.poll(() => chapter(page)).toBe("route");
  await page.locator("body").press("ArrowLeft");
  await expect.poll(() => chapter(page)).toBe("ask");
  await page.locator("body").press("End");
  await expect.poll(() => chapter(page)).toBe("end");
  await expect(sim.getByRole("link", { name: /try keplar/i })).toHaveAttribute("href", "/app");
  // the disagreement and the final answer are on screen in their chapters
  await sim.getByRole("button", { name: "Go to Disagree", exact: true }).click();
  await expect(sim.getByRole("heading", { name: "3 of 4 agree" })).toBeVisible();
  await sim.getByRole("button", { name: "Go to Answer", exact: true }).click();
  await expect.poll(() => chapter(page)).toBe("final");
  await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.9)); // the title types itself in as you scroll
  await expect(sim.getByText("Don't leave it out overnight.").first()).toBeVisible();
  // the agent asks first; approving is only a simulation
  await sim.getByRole("button", { name: "Go to Agent", exact: true }).click();
  await expect.poll(() => chapter(page)).toBe("agent");
  const appr = sim.getByTestId("approval");
  await expect.poll(async () => Number(await appr.evaluate((e) => getComputedStyle(e).opacity)), { timeout: 8000 }).toBeGreaterThan(0.9).catch(async () => {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.5));
  });
  await expect(sim.getByText("Nothing is sent until you choose.")).toBeVisible();
  await appr.getByRole("button", { name: /approve and send/i }).click();
  await expect(sim.getByText(/Simulation: nothing was sent/)).toBeVisible();
  expect(calls).toEqual([]);
});

test("every chapter fits its frame at phone and desktop widths, in Light and Dark, with no blue", async ({ page }) => {
  for (const [w, h, theme] of [[390, 800, "dark"], [1440, 900, "light"]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.emulateMedia({ colorScheme: theme });
    await page.addInitScript((t) => { try { localStorage.setItem("keplar-theme", t); } catch { /* */ } }, theme);
    await page.goto("/simulation");
    await page.getByRole("button", { name: /reject non-essential/i }).click({ timeout: 3000 }).catch(() => undefined);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const sim = page.getByTestId("simulation");
    await sim.getByRole("button", { name: /^(Pause|Play)$/ }).click();
    if (await sim.getByRole("button", { name: "Pause" }).count()) await sim.getByRole("button", { name: "Pause" }).click();
    const ids = ["intro", "ask", "route", "answer", "split", "verify", "final", "create", "agent", "end"];
    const labels = ["Start", "Ask", "Route", "Answers", "Disagree", "Verify", "Answer", "Create", "Agent", "Try it"];
    for (let i = 0; i < ids.length; i++) {
      await sim.getByRole("button", { name: `Go to ${labels[i]}`, exact: true }).click();
      await expect.poll(() => chapter(page), { timeout: 8000 }).toBe(ids[i]);
      // scroll to the end of the chapter so its content is fully built
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.5));
      await page.waitForTimeout(350);
      const bad = await page.evaluate(() => {
        const out: string[] = [];
        const slide = document.querySelector<HTMLElement>('[data-testid=simulation] [class*="slide"]');
        const controls = document.querySelector<HTMLElement>('[data-testid=simulation] [class*="controls"]');
        if (!slide || !controls) return ["missing slide/controls"];
        const sr = slide.getBoundingClientRect();
        const cr = controls.getBoundingClientRect();
        const isBlue = (c: string) => { const m = (c.match(/[\d.]+/g) ?? []).map(Number); return m.length >= 3 && m[2] > m[0] + 40 && m[2] > m[1] + 25; };
        for (const e of slide.querySelectorAll<HTMLElement>("*")) {
          const r = e.getBoundingClientRect();
          if (r.width < 2 || r.height < 2) continue;
          const cs = getComputedStyle(e);
          if (cs.visibility === "hidden" || Number(cs.opacity) < 0.05) continue;
          if (r.right > window.innerWidth + 1 || r.left < -1) out.push("x:" + e.tagName + (e.textContent || "").slice(0, 20));
          if (r.bottom > cr.top + 1 && (e.children.length === 0 || e.tagName === "BUTTON") && r.top < cr.bottom) out.push("under controls:" + (e.textContent || "").slice(0, 20));
          if (r.top < sr.top - 1 && (e.children.length === 0)) out.push("above:" + (e.textContent || "").slice(0, 20));
          if (isBlue(cs.color) || isBlue(cs.backgroundColor) || isBlue(cs.borderTopColor)) out.push("blue:" + (e.textContent || "").slice(0, 20));
        }
        if (document.documentElement.scrollWidth > window.innerWidth) out.push("page scrolls sideways");
        return out;
      });
      expect(bad, `${w}px ${theme} ${ids[i]}`).toEqual([]);
      if (process.env.SIM_SHOTS) await page.screenshot({ path: `${process.env.SIM_SHOTS}/${w}-${theme}-${ids[i]}.png` });
    }
  }
});

test("reduced motion: no auto-play, still steppable", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/simulation");
  await page.waitForTimeout(2500);
  expect(await chapter(page)).toBe("intro");
  await expect(page.getByTestId("simulation").getByRole("button", { name: "Play" })).toBeVisible();
  await page.getByTestId("simulation").getByRole("button", { name: "Next step" }).click();
  await expect.poll(() => chapter(page)).toBe("ask");
});
