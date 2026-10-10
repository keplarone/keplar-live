// Real-browser check of the Insert / overtype mode: node scripts/insert-e2e.mjs [baseUrl]
// Fails (exit 1) if the Insert key, the OVR badge (hidden in insert mode), the block-caret flag or overwrite typing do not work in the Ask composer
// and in an ordinary text input, with the setting at its default (nothing stored) and after it is switched off.
import { chromium } from "playwright";
const base = process.argv[2] || "http://localhost:3111";
const exe = process.env.CHROME || "/usr/bin/google-chrome";
const b = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
let bad = 0;
const ok = (c, m) => { console.log(c ? "ok  " : "FAIL", m); if (!c) bad++; };

async function run(label, path, sel, setup) {
  console.log("--", label);
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  if (setup) await p.addInitScript(setup);
  await p.goto(base + path, { waitUntil: "load" });
  await p.waitForTimeout(1500);
  const f = p.locator(sel).first();
  await f.click();
  // 1. before pressing Insert: insert mode is the normal state, so no badge shows (it appears only in overtype); typing inserts
  await p.waitForTimeout(150);
  ok((await p.locator(".ins-badge").count()) === 0, `${label}: no badge in normal insert mode (feature on by default)`);
  await f.fill("");
  await p.keyboard.type("hello world");
  await p.keyboard.press("Home");
  await p.keyboard.type("X");
  ok((await f.inputValue()) === "Xhello world", `${label}: default typing inserts`);
  await p.keyboard.press("Home");
  await p.keyboard.press("Insert");
  ok((await p.locator(".ins-badge").first().textContent()) === "OVR", `${label}: Insert -> badge OVR`);
  ok((await p.evaluate(() => document.documentElement.dataset.typingMode)) === "ovr", `${label}: html[data-typing-mode=ovr]`);
  ok((await p.evaluate((s) => getComputedStyle(document.querySelector(s)).caretShape, sel)) === "block", `${label}: caret-shape block`);
  await p.keyboard.type("ab");
  ok((await f.inputValue()) === "abello world", `${label}: overtype replaced next chars (got ${await f.inputValue()})`);
  await p.keyboard.press("Insert");
  ok((await p.locator(".ins-badge").first().textContent()) === "INS", `${label}: Insert again -> INS flashes`);
  await p.keyboard.type("Z");
  ok((await f.inputValue()) === "abZello world", `${label}: back to insert`);
  await p.waitForTimeout(1600);
  ok((await p.locator(".ins-badge").count()) === 0, `${label}: the INS flash goes away`);
  await ctx.close();
}

await run("ask composer", "/app", "textarea");
await run("ask composer (stored 1)", "/app", "textarea", () => localStorage.setItem("kp-insert-key", "1"));
await run("home hero prompt", "/", "textarea");

// switched off in Settings -> no badge, Insert does nothing special
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  await p.addInitScript(() => localStorage.setItem("kp-insert-key", "0"));
  await p.goto(base + "/app", { waitUntil: "load" });
  await p.waitForTimeout(1200);
  await p.locator("textarea").first().click();
  await p.keyboard.press("Insert");
  ok((await p.locator(".ins-badge").count()) === 0, "setting off: no badge");
  ok((await p.evaluate(() => document.documentElement.dataset.typingMode)) === undefined, "setting off: no typing mode");
  await ctx.close();
}
// autofocused composer: Insert works without clicking first, and the OVR badge appears
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  await p.goto(base + "/app", { waitUntil: "load" });
  await p.waitForTimeout(1500);
  const focused = await p.evaluate(() => document.activeElement?.tagName);
  console.log("note: active element on load =", focused);
  if (focused === "TEXTAREA") ok((await p.locator(".ins-badge").count()) === 0, "autofocused composer: no badge in insert mode");
  if (focused === "TEXTAREA") { await p.keyboard.type("hello"); await p.keyboard.press("Home"); await p.keyboard.press("Insert"); ok((await p.locator(".ins-badge").count()) === 1, "Insert key on an autofocused composer shows the OVR badge"); await p.keyboard.type("J"); ok((await p.locator("textarea").first().inputValue()) === "Jello", "autofocused composer: Insert then typing overwrites"); }
  await ctx.close();
}
await b.close();
process.exit(bad ? 1 : 0);
