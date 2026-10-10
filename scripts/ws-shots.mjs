// Drives the Create workspace in a real browser against a local server (scripts/e2e-dev.sh + scripts/fake-llm.mjs) and saves screenshots.
//   node scripts/ws-shots.mjs http://localhost:3481 /tmp/wsshots [--build]
import { chromium } from "playwright";
import fs from "node:fs";
const base = process.argv[2] || "http://localhost:3481";
const out = process.argv[3] || "/tmp/wsshots";
const BUILD = process.argv.includes("--build");
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
async function signIn(ctx, email) {
  const h = { "content-type": "application/json", origin: base, "x-forwarded-for": `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` };
  const r1 = await ctx.request.post(base + "/api/auth/sign-in/magic-link", { headers: h, data: { email, callbackURL: "/app" } });
  if (!r1.ok()) throw new Error("magic link " + r1.status());
  const html = await (await ctx.request.get(base + "/dev/outbox")).text();
  const link = [...html.matchAll(/href="(http[^"]*token=[^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"))[0];
  const r2 = await ctx.request.post(base + "/api/auth/magic-link/confirm", { headers: h, data: { token: new URL(link).searchParams.get("token") } });
  if (!r2.ok()) throw new Error("confirm " + r2.status());
  await ctx.request.post(base + "/api/onboarding", { headers: { "content-type": "application/json", origin: base }, data: { action: "complete", answers: { name: "Alex" } } });
}
for (const [name, w, h] of [["desktop", 1440, 900], ["tablet", 1024, 768], ["phone", 390, 844]].filter((v) => !process.env.VP || v[0] === process.env.VP)) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: "dark", isMobile: w < 500, hasTouch: w < 500 });
  await signIn(ctx, `ws${Date.now() % 1e7}${name}@example.com`);
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push("PAGEERR " + e.message.slice(0, 200)));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 200)); });
  await p.goto(base + "/app", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2500);
  await p.getByRole("button", { name: /reject non-essential/i }).click({ timeout: 2000 }).catch(() => {});
  await p.getByRole("button", { name: /^create( a site or image)?$/i }).first().click();
  await p.waitForSelector("[data-testid=workspace]", { timeout: 20000 });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `${out}/${name}-1-welcome.png` });
  if (BUILD) {
    await p.locator("#ws-prompt").fill("A site for Mill Lane Bakehouse, a neighborhood bakery with opening hours and a way to reserve a loaf");
    await p.locator("#ws-prompt").press("Enter");
    await p.waitForSelector("[data-testid=question]", { timeout: 20000 });
    await p.waitForTimeout(500);
    await p.screenshot({ path: `${out}/${name}-2-question.png` });
    await p.getByRole("button", { name: /just build it/i }).click();
    await p.waitForSelector("[data-testid=brief-review]", { timeout: 20000 });
    await p.waitForTimeout(1500);
    await p.screenshot({ path: `${out}/${name}-3-brief.png`, fullPage: false });
    await p.getByRole("button", { name: /approve and build/i }).click();
    await p.waitForTimeout(Number(process.env.BUILD_SHOT_MS || 2500));
    await p.screenshot({ path: `${out}/${name}-4-building.png` });
    await p.waitForSelector("text=Test finished", { timeout: 180000 }).catch(() => console.log("no test finish"));
    await p.waitForTimeout(1500);
    await p.screenshot({ path: `${out}/${name}-5-done.png` });
    await p.getByRole("tab", { name: /screen library/i }).click().catch(() => {});
    await p.waitForTimeout(800);
    await p.screenshot({ path: `${out}/${name}-6-library.png` });
  }
  console.log(name, "errors:", JSON.stringify(errs));
  await ctx.close();
}
await b.close();
