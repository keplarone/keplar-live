import { test, expect, type Page } from "playwright/test";

/**
 * Keplar Studio with a stand-in for the desktop app's bridge (an in-memory Roblox Studio with one script) and scripted model
 * turns on /api/studio/agent. Everything else is the real app: the real overlay and full-page Workspace, the real
 * useStudioAgent loop, the real code engine and the real GET /api/studio/modes.
 *
 * - The overlay window (/app/studio/overlay) is transparent; its panel is an opaque surface. The Solar selector's technical
 *   details name the real model, Escape closes it, and the mode picked there goes with every turn. A run goes from waiting
 *   for approval to building to finished, and Studio | Blender switch.
 * - The full page (/app/studio): the Code tab shows the real execute_luau code of a proposed action, a multi_edit shows a diff
 *   whose before-content is Studio's script as read by script_read, Changes lists it, and Activity lists the real events in
 *   the order they happened.
 */

const SCRIPT_PATH = "game.ServerScriptService.Spawn";
const SCRIPT = "local speed = 16\nprint(\"spawned\", speed)\n";

type Turn = { text: string; actions: { id: string; name: string; args: Record<string, unknown>; risk: "read" | "change" | "destructive" }[]; done: boolean };

async function stage(page: Page, turns: Turn[], overlayOpen = true) {
  await page.addInitScript(([path, script, open]) => {
    const text = (t: string) => ({ ok: true, result: { content: [{ type: "text", text: t }] } });
    const status = { state: "connected", tools: ["list_roblox_studios", "screen_capture", "search_game_tree", "execute_luau", "script_read", "multi_edit"] };
    const blender = { state: "connected", file: "scene.blend", tools: [] };
    const scripts: Record<string, string> = { [path]: script };
    const w = window as unknown as { keplarStudio: unknown; __calls: string[]; __scripts: Record<string, string> };
    w.__calls = [];
    w.__scripts = scripts;
    w.keplarStudio = {
      version: 3, status: async () => status, connect: async () => status, disconnect: async () => status, tools: async () => [], onStatus: () => () => {},
      call: async (name: string, args: Record<string, unknown>) => {
        w.__calls.push(name);
        if (name === "list_roblox_studios") return text(JSON.stringify({ studios: [{ id: "s1", name: "Place1" }] }));
        if (name === "search_game_tree") return text("Workspace\n  Baseplate");
        if (name === "screen_capture") return { ok: true, result: { content: [] } };
        if (name === "script_read") {
          const src = scripts[String(args.target_file)];
          return src === undefined ? { ok: false, error: "No such script" } : text(src);
        }
        await new Promise((r) => setTimeout(r, 600));
        if (name === "multi_edit") {
          const file = String(args.file_path);
          let src = scripts[file] ?? "";
          for (const e of args.edits as { old_string: string; new_string: string }[]) src = src.replace(e.old_string, () => e.new_string);
          scripts[file] = src;
          return text(`Edited ${file}`);
        }
        return text("done");
      },
      blender: { status: async () => blender, connect: async () => blender, setup: async () => ({ ok: true, message: "" }), disconnect: async () => blender, tools: async () => [], call: async () => ({ ok: true, result: { content: [] } }), onStatus: () => () => {} },
      overlay: { state: async () => ({ open, collapsed: false, seeThrough: false }), open: async () => ({}), close: async () => ({}), collapse: async () => ({}), seeThrough: async () => ({}), onState: () => () => {} },
    };
  }, [SCRIPT_PATH, SCRIPT, overlayOpen] as const);
  await page.route("**/api/compute", (r) => r.fulfill({ json: { plan: "pro", signedIn: true, used: 0, total: null, resetsAt: null, paused: false, windows: null, account: { id: "e2e-studio", email: "studio@example.com", name: "Alex" } } }));
  await page.route("**/api/billing/studio-topup**", (r) => r.fulfill({ json: { enabled: false, choice: null } }));
  await page.route("**/api/studio/chats**", (r) => r.fulfill({ status: 404, json: {} }));
  const bodies: { mode?: string }[] = [];
  let turn = 0;
  await page.route("**/api/studio/agent", async (r) => {
    bodies.push(r.request().postDataJSON() as { mode?: string });
    const t = turns[Math.min(turn++, turns.length - 1)]!;
    await new Promise((res) => setTimeout(res, 300));
    await r.fulfill({ json: { message: { role: "assistant", content: t.text }, text: t.text, actions: t.actions, blocked: [], done: t.done, units: 100 } });
  });
  return bodies;
}

const OBBY: Turn[] = [
  { text: "Here is the plan:\n1. Lay a lava floor\n2. Add checkpoints\n3. Light the course", actions: [], done: false },
  { text: "Step 1: laying the floor.", actions: [{ id: "a1", name: "execute_luau", args: { code: "local p = Instance.new('Part')" }, risk: "change" }], done: false },
  { text: "Step 3: done. Play-test it.", actions: [], done: true },
];

const calls = (page: Page) => page.evaluate(() => (window as unknown as { __calls: string[] }).__calls);

test("overlay: transparent window, opaque panel, honest technical details, the chosen Solar mode in every turn, a real run", async ({ page }) => {
  await page.setViewportSize({ width: 440, height: 760 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const bodies = await stage(page, OBBY);
  await page.goto("/app/studio/overlay");
  const solar = page.getByRole("button", { name: /^Solar 5\.8 mode/ });
  await expect(solar).toBeVisible({ timeout: 30_000 });

  // The window behind shows around the panel; the panel itself is an opaque token surface (no transparency tricks, no blur).
  const paint = await page.evaluate(() => {
    const alpha = (c: string) => { const m = /rgba?\(([^)]+)\)/.exec(c); return m ? Number(m[1]!.split(/[ ,/]+/).filter(Boolean)[3] ?? 1) : 1; };
    const panel = document.querySelector("header")!.parentElement!;
    const cs = getComputedStyle(panel);
    return { page: alpha(getComputedStyle(document.body).backgroundColor), html: alpha(getComputedStyle(document.documentElement).backgroundColor), panel: alpha(cs.backgroundColor), blur: cs.backdropFilter };
  });
  expect(paint.page).toBe(0);
  expect(paint.html).toBe(0);
  expect(paint.panel).toBe(1);
  expect(["none", ""]).toContain(paint.blur);

  // Solar 5.8: five modes with the server's real per-step ceilings, and technical details that name the real model.
  await solar.click();
  const menu = page.getByRole("menu", { name: "Solar 5.8 mode" });
  await expect(menu.getByRole("menuitemradio")).toHaveCount(5);
  await expect(menu.getByRole("menuitemradio", { name: /^Medium/ })).toHaveAttribute("aria-checked", "true");
  await expect(menu).toContainText(/≤ [\d,]+ cr/);
  await menu.getByRole("button", { name: "Technical details" }).click();
  await expect(menu).toContainText("Runs on Claude Opus 5.5 (Anthropic) via OpenRouter");
  await expect(menu).toContainText("not separate models");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);

  // Pick High: it is persisted and sent with every turn of the run.
  await solar.click();
  await page.getByRole("menuitemradio", { name: /^High/ }).click();
  await expect(solar).toHaveAccessibleName("Solar 5.8 mode: High");
  expect(await page.evaluate(() => localStorage.getItem("keplar.studio.solar-mode"))).toBe("high");

  const control = page.getByRole("region", { name: "Control center" });
  const box = page.getByRole("textbox", { name: "Describe what to build in Roblox Studio" });
  await box.fill("A lava obby");
  await box.press("Enter");
  await expect(control).toContainText("Waiting for your approval", { timeout: 30_000 });
  expect(await calls(page)).not.toContain("execute_luau");
  await page.getByRole("region", { name: "Build with Keplar in Roblox Studio" }).getByRole("button", { name: /^Approve/ }).click();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await expect(control).toContainText("Finished", { timeout: 30_000 });
  await expect(page.getByText("3/3", { exact: true })).toBeVisible();
  expect(await calls(page)).toContain("execute_luau");
  expect(bodies.length).toBe(3);
  for (const b of bodies) expect(b.mode).toBe("high");

  // Chat | Code | Changes: Code shows the command that ran.
  await page.getByRole("radio", { name: "Code" }).click();
  await expect(page.getByText("Instance.new('Part')")).toBeVisible();
  await page.getByRole("radio", { name: "Chat" }).click();

  await page.getByRole("button", { name: "Blender", exact: true }).click();
  await expect(page.getByRole("button", { name: "Blender", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("scene.blend").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("full page: Code shows the proposed execute_luau, a multi_edit diffs Studio's real script, Changes and Activity follow the run", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const bodies = await stage(page, [
    {
      text: "Here is the plan:\n1. Speed up spawning\n2. Raise gravity\n3. Check the course",
      actions: [{ id: "e1", name: "multi_edit", args: { studio_id: "s1", file_path: SCRIPT_PATH, edits: [{ old_string: "local speed = 16", new_string: "local speed = 24" }] }, risk: "change" }],
      done: false,
    },
    { text: "Step 2: raising gravity.", actions: [{ id: "c1", name: "execute_luau", args: { code: "workspace.Gravity = 120" }, risk: "change" }], done: false },
    { text: "Step 3: done.", actions: [], done: true },
  ], false);
  await page.goto("/app/studio");
  const inspector = page.getByRole("region", { name: "Inspector" });
  await expect(inspector).toBeVisible({ timeout: 60_000 });
  const feed = page.getByRole("region", { name: "Build with Keplar in Roblox Studio" });
  const tab = (name: string) => inspector.getByRole("tab", { name: new RegExp(`^${name}`) });
  const panel = inspector.getByRole("tabpanel").first(); // the inspector's own panel (CodePanel has tabpanels inside)

  const box = page.getByRole("textbox", { name: "Describe what to build in Roblox Studio" });
  await box.fill("Make spawning faster and gravity heavier");
  await box.press("Enter");

  // The multi_edit waits for approval. Its before-content is Studio's script as script_read returned it.
  await expect(feed.getByRole("button", { name: /^Approve/ })).toBeVisible({ timeout: 30_000 });
  await tab("Changes").click();
  await expect(panel).toContainText(SCRIPT_PATH);
  await panel.getByText(SCRIPT_PATH).first().click();
  await expect(panel).toContainText("local speed = 16", { timeout: 15_000 });
  await expect(panel).toContainText("local speed = 24");
  await expect(panel).toContainText('print("spawned", speed)');
  expect((await calls(page)).filter((c) => c === "script_read").length).toBeGreaterThanOrEqual(1);
  expect(await calls(page)).not.toContain("multi_edit");

  await feed.getByRole("button", { name: /^Approve/ }).click();
  // The next step proposes an execute_luau; the Code tab shows its real code while it waits.
  await expect(feed.getByRole("button", { name: /^Approve/ })).toBeVisible({ timeout: 30_000 });
  await tab("Code").click();
  await expect(panel).toContainText("workspace.Gravity = 120", { timeout: 15_000 });
  await expect(panel).toContainText("execute_luau");
  await feed.getByRole("button", { name: /^Approve/ }).click();
  await expect(page.getByRole("region", { name: "Control center" })).toContainText("Finished", { timeout: 30_000 });
  expect(await page.evaluate((p) => (window as unknown as { __scripts: Record<string, string> }).__scripts[p], SCRIPT_PATH)).toBe(SCRIPT.replace("16", "24"));

  // Changes lists the edit; Activity lists what really happened, in order.
  await tab("Changes").click();
  await expect(panel).toContainText(SCRIPT_PATH);
  await tab("Activity").click();
  const rows = await inspector.getByRole("log").locator("li").allTextContents();
  const expected = [
    "Request 1 sent", "Reply received", "Plan: 3 steps", "Action proposed", "Waiting for approval", `Read ${SCRIPT_PATH}`, "Approved",
    `Read ${SCRIPT_PATH}`, "Running", "Done", `Read ${SCRIPT_PATH}`, "Edit confirmed",
    "Request 2 sent", "Reply received", "Action proposed", "Waiting for approval", "Approved", "Running", "Done",
    "Request 3 sent", "Reply received", "Finished",
  ];
  let at = 0;
  for (const row of rows) if (at < expected.length && row.includes(expected[at]!)) at++;
  expect(at, `activity rows in order (matched ${at}/${expected.length}): ${rows.join(" | ")}`).toBe(expected.length);
  for (const b of bodies) expect(b.mode).toBe("medium");
  expect(errors).toEqual([]);
});
