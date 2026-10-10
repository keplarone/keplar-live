#!/usr/bin/env node
// Ask home screenshots (signed in, empty thread) at desktop 1280x800 and phone 390x844.
//   node scripts/ask-welcome-shots.mjs <base> <outdir> <prefix>     (base must have KEPLAR_DEV_TOOLS=1 for the magic-link outbox)
import fs from "node:fs";
import * as pw from "playwright";
const [base = "http://localhost:3473", out = "screenshots/ask-welcome", prefix = "after"] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const exe = fs.existsSync("/usr/bin/google-chrome") ? "/usr/bin/google-chrome" : undefined;
const browser = await pw.chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
const email = `ask-welcome-${Date.now().toString(36)}@example.com`;
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: "dark", extraHTTPHeaders: { "x-forwarded-for": `10.77.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}` } });
await ctx.addCookies([{ name: "keplar_consent", value: "1", url: base }]);
const page = await ctx.newPage();
await page.goto(base + "/signin?next=%2Fapp");
await page.getByLabel(/email/i).first().fill(email);
await page.getByRole("button", { name: /email me a sign-in link/i }).click();
let href = null;
for (let i = 0; i < 30 && !href; i++) {
  await page.waitForTimeout(1000);
  await page.goto(base + "/dev/outbox");
  href = (await page.locator("a[href*='/signin/verify']").evaluateAll((as, em) => as.filter((a) => (a.parentElement?.parentElement?.textContent ?? "").includes(`to ${em}`)).map((a) => a.href), email))[0] ?? null;
}
if (!href) throw new Error("no magic link");
await page.goto(href);
await page.getByRole("button", { name: /^sign in$/i }).click();
await page.waitForURL(/\/(app|welcome)/, { timeout: 30_000 });
// A fresh test account has no display name yet; show the page as a named user would see it.
await page.route("**/api/compute", async (route) => {
  const res = await route.fetch();
  const j = await res.json();
  if (j.account && !j.account.name) j.account.name = "Alex Rivera";
  await route.fulfill({ response: res, json: j });
});
for (const [w, h, name] of [[1280, 800, "desktop-1280x800"], [390, 844, "phone-390x844"]]) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(base + "/app/ask", { waitUntil: "load" });
  await page.waitForTimeout(2500);
  // A brand-new account is asked "What will you use Keplar for?" once; capture that, then the everyday page after Skip.
  const skip = page.locator("button", { hasText: /^Skip$/ }).first();
  if (await skip.isVisible().catch(() => false)) {
    await page.screenshot({ path: `${out}/${prefix}-${name}-first-visit.png` });
    console.log(`${out}/${prefix}-${name}-first-visit.png`);
    await skip.click();
    await page.waitForTimeout(600);
  }
  await page.screenshot({ path: `${out}/${prefix}-${name}.png` });
  console.log(`${out}/${prefix}-${name}.png`);
}
await browser.close();
