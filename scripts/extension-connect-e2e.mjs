#!/usr/bin/env node
/**
 * Connect (no API key to paste), end to end in a real browser: the popup's Connect starts a request with a PKCE challenge, opens
 * the keplar.one approval page in a new tab, waits with the code, and once keplar.one says "connected" the popup shows the account
 * and its credits; the verifier is checked against the challenge; Disconnect revokes the connection with its own key; a stopped
 * approval says so. keplar.one is stubbed here (the server side is tested in tests/extension-connect.test.ts). Also writes screenshots.
 * Run: KEPLAR_SHOTS_CHANNEL=msedge node scripts/extension-connect-e2e.mjs [outDir]
 */
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";

const EXT = resolve("extension");
const OUT = resolve(process.argv[2] || join(tmpdir(), "keplar-connect-e2e"));
mkdirSync(OUT, { recursive: true });
const work = mkdtempSync(join(tmpdir(), "keplar-connect-ext-"));
const copy = join(work, "extension");
cpSync(EXT, copy, { recursive: true, filter: (p) => !/[\\/](dist|store|tools)([\\/]|$)/.test(p) }); // the shipped manifest, unchanged

const RID = "R".repeat(32);
const KEY = `kpl_${"e".repeat(32)}`;
const seen = { connect: [], token: [], disconnect: [] };
let tokenAnswer = () => ({ status: "pending" });

const ctx = await chromium.launchPersistentContext(join(work, "profile"), {
  channel: process.env.KEPLAR_SHOTS_CHANNEL || "chromium",
  headless: true,
  viewport: { width: 420, height: 640 },
  args: [`--disable-extensions-except=${copy}`, `--load-extension=${copy}`],
});
try {
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
  const extId = new URL(sw.url()).host;
  const json = (r, body, status = 200) => r.fulfill({ status, headers: { "content-type": "application/json", "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
  await ctx.route("https://keplar.one/api/extension/connect", async (r) => {
    seen.connect.push(JSON.parse(r.request().postData() || "{}"));
    await json(r, { rid: RID, code: "K7F-2QM", url: `https://keplar.one/desktop/connect?rid=${RID}`, expiresIn: 600 });
  });
  await ctx.route("https://keplar.one/api/extension/token", async (r) => {
    seen.token.push(JSON.parse(r.request().postData() || "{}"));
    await json(r, tokenAnswer());
  });
  await ctx.route("https://keplar.one/api/extension/disconnect", async (r) => {
    seen.disconnect.push(r.request().headers().authorization ?? "");
    await r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
  });
  await ctx.route("https://keplar.one/api/v1/usage", (r) => json(r, { object: "usage", plan: "plus", credits: { used: 766, total: 2000, left: 1234 } }));
  await ctx.route("https://keplar.one/desktop/connect**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Connect</title><h1>Connect Keplar One extension</h1>" }));

  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.waitForSelector("#setup:not([hidden])");
  assert.equal(await popup.locator("#ask").isHidden(), true);
  await popup.screenshot({ path: join(OUT, "1-connect.png") });

  // 1. Connect: a request with a PKCE challenge, the approval page opens in a new tab, and the popup waits with the code.
  const opened = ctx.waitForEvent("page", { predicate: (p) => p.url().startsWith("https://keplar.one/desktop/connect") });
  await popup.click("#connect");
  const tab = await opened;
  assert.equal(new URL(tab.url()).searchParams.get("rid"), RID);
  await popup.bringToFront();
  await popup.waitForSelector("#connect-wait:not([hidden])");
  assert.match(await popup.textContent("#connect-wait"), /K7F-2QM/);
  assert.equal(await popup.isDisabled("#connect"), true, "one request at a time");
  await popup.screenshot({ path: join(OUT, "2-waiting.png") });
  assert.equal(seen.connect.length, 1);
  assert.match(seen.connect[0].challenge, /^[A-Za-z0-9_-]{43}$/);
  assert.match(seen.connect[0].label, /^Keplar One extension \((Chrome|Edge)\)$/);

  // 2. keplar.one says pending a few times, then connected: the popup shows the account and its credits.
  await popup.waitForTimeout(2500);
  assert.ok(seen.token.length >= 1, "the worker polls while the person approves");
  tokenAnswer = () => ({ status: "connected", key: KEY, email: "e2e@example.com" });
  await popup.waitForSelector("#ask:not([hidden])", { timeout: 15000 });
  await popup.waitForFunction(() => /credits left/.test(document.getElementById("who")?.textContent ?? ""));
  assert.equal(await popup.textContent("#who"), "Connected as e2e@example.com. 1,234 credits left this period.");
  assert.equal(await popup.locator("#forget").isVisible(), true);
  await popup.screenshot({ path: join(OUT, "3-connected.png") });
  const verifier = seen.token[0].verifier;
  assert.equal(seen.token[0].rid, RID);
  assert.equal(createHash("sha256").update(verifier).digest("base64url"), seen.connect[0].challenge, "PKCE: the poll proves it started the request");
  const stored = await sw.evaluate(async () => ({ local: await chrome.storage.local.get(["apiKey", "account"]), session: await chrome.storage.session.get("connect") }));
  assert.equal(stored.local.apiKey, KEY);
  assert.equal(stored.local.account.email, "e2e@example.com");
  assert.equal(stored.session.connect, undefined, "the verifier is gone once connected");
  const polls = seen.token.length;
  await popup.waitForTimeout(2500);
  assert.equal(seen.token.length, polls, "polling stops once connected");

  // 3. Disconnect: revoked on keplar.one with the connection's own key, forgotten here, and Connect is offered again.
  await popup.click("#forget");
  await popup.waitForSelector("#setup:not([hidden])");
  assert.deepEqual(seen.disconnect, [`Bearer ${KEY}`]);
  assert.deepEqual(await sw.evaluate(() => chrome.storage.local.get(["apiKey", "account"])), {});

  // 4. A stopped approval says so, and Connect works again.
  tokenAnswer = () => ({ status: "denied" });
  const again = ctx.waitForEvent("page", { predicate: (p) => p.url().startsWith("https://keplar.one/desktop/connect") });
  await popup.click("#connect");
  await again;
  await popup.bringToFront();
  await popup.waitForFunction(() => /stopped on keplar\.one/.test(document.getElementById("setup-msg")?.textContent ?? ""), null, { timeout: 15000 });
  assert.equal(await popup.isDisabled("#connect"), false);
  await popup.screenshot({ path: join(OUT, "4-stopped.png") });
  console.log("connect e2e passed; screenshots in", OUT);
} finally {
  await ctx.close();
  rmSync(work, { recursive: true, force: true });
}
