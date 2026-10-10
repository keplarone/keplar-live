import { test, expect, type Page } from "playwright/test";

/**
 * Voice mode (BETA) with a faithful stand-in for the browser's speech APIs (a headless browser has no microphone):
 * push-to-talk and tap-to-latch ask a question by voice, the answer card reads itself aloud, Stop / Escape / tapping Talk stop it,
 * a blocked microphone and an unsupported browser (Firefox-like) get honest messages, and nothing audio is ever sent to Keplar.
 */
const composer = "textarea[aria-describedby$='-hint']";

type Mock = { heard?: string; deny?: boolean; recognition?: boolean; synthesis?: boolean; hold?: boolean };
async function mockSpeech(page: Page, o: Mock = {}) {
  await page.addInitScript((opts) => {
    const w = window as unknown as Record<string, unknown>;
    const log = { started: 0, stopped: 0, aborted: 0, spoken: [] as string[], cancelled: 0, langs: [] as string[] };
    w.__speech = log;
    w.__hold = opts.hold ?? true; // spoken utterances stay "playing" until stopped, unless the test lets them end by themselves
    w.__heard = opts.heard ?? "who made keplar?";
    if (opts.recognition !== false) {
      class Rec {
        lang = ""; continuous = false; interimResults = false; maxAlternatives = 1;
        onstart: (() => void) | null = null; onend: (() => void) | null = null;
        onerror: ((e: { error: string }) => void) | null = null;
        onresult: ((e: unknown) => void) | null = null;
        start() {
          log.started++;
          log.langs.push(this.lang);
          setTimeout(() => {
            if (opts.deny) { this.onerror?.({ error: "not-allowed" }); this.onend?.(); return; }
            this.onstart?.();
          }, 10);
        }
        stop() {
          log.stopped++;
          setTimeout(() => {
            const r = [{ isFinal: true, 0: { transcript: w.__heard as string } }];
            this.onresult?.({ resultIndex: 0, results: Object.assign(r, { length: 1 }) });
            this.onend?.();
          }, 10);
        }
        abort() { log.aborted++; }
      }
      w.SpeechRecognition = Rec;
      w.webkitSpeechRecognition = Rec;
    } else {
      delete w.SpeechRecognition;
      delete w.webkitSpeechRecognition;
    }
    if (opts.synthesis !== false) {
      let current: { onend?: () => void } | null = null;
      Object.defineProperty(window, "speechSynthesis", {
        configurable: true,
        value: {
          getVoices: () => [],
          speak: (u: { text: string; onend?: () => void }) => { log.spoken.push(u.text); current = u; if (!w.__hold) setTimeout(() => u.onend?.(), 20); },
          cancel: () => { log.cancelled++; current = null; },
          finish: () => { current?.onend?.(); },
        },
      });
      w.SpeechSynthesisUtterance = function (this: { text: string }, t: string) { this.text = t; } as unknown;
    } else {
      Object.defineProperty(window, "speechSynthesis", { configurable: true, value: undefined });
      delete w.SpeechSynthesisUtterance;
    }
  }, o);
}
const log = (page: Page) => page.evaluate(() => (window as unknown as { __speech: { started: number; stopped: number; aborted: number; spoken: string[]; cancelled: number; langs: string[] } }).__speech);
async function open(page: Page) {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.86.${(Date.now() >> 4) & 255}.${Math.floor(Math.random() * 200) + 1}` });
  await page.goto("/app");
  await page.locator(composer).first().waitFor({ timeout: 30_000 });
}
const talk = (page: Page) => page.locator("button[data-talk]");

test("push-to-talk: hold to speak, release to send; the answer reads itself; tapping Talk (now Stop) stops it; no audio leaves the page", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (r) => requests.push(`${r.method()} ${r.url()} ${r.headers()["content-type"] ?? ""}`));
  await mockSpeech(page);
  await open(page);
  const btn = talk(page);
  await expect(btn).toBeVisible();
  await expect(btn).toContainText("Talk (beta)");
  await expect(btn).toHaveAttribute("aria-pressed", "false");

  await btn.hover();
  await page.mouse.down();
  await expect(btn).toHaveAttribute("data-voice-btn", "listening");
  await expect(page.getByRole("status").filter({ hasText: "Listening. Release to send" })).toBeAttached();
  await page.waitForTimeout(500); // a hold, not a tap
  await page.mouse.up();

  const card = page.locator("article").last();
  await expect(card).toContainText("Hassen", { timeout: 30_000 });
  await expect(page.getByText("who made keplar?").first()).toBeVisible();
  // the answer card reads itself once because the question was asked by voice
  await expect.poll(async () => (await log(page)).spoken.length, { timeout: 10_000 }).toBeGreaterThan(0);
  const spoken = (await log(page)).spoken.join(" ");
  expect(spoken).toContain("Hassen");
  expect(spoken).not.toMatch(/[*#`|]/);
  const listen = card.getByRole("button", { name: /Stop reading the answer aloud/ });
  await expect(listen).toHaveAttribute("aria-pressed", "true");
  await expect(btn).toContainText("Stop");

  // tap-to-stop with the Talk button
  const before = (await log(page)).cancelled;
  await btn.click();
  await expect(card.getByRole("button", { name: /Listen to the answer \(beta\)/ })).toHaveAttribute("aria-pressed", "false");
  expect((await log(page)).cancelled).toBeGreaterThan(before);
  await expect(btn).toContainText("Talk (beta)");

  // Listen again from the card, then Escape stops it
  await card.getByRole("button", { name: /Listen to the answer/ }).click();
  await expect(card.getByRole("button", { name: /Stop reading/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(card.getByRole("button", { name: /Listen to the answer/ })).toHaveAttribute("aria-pressed", "false");

  // the question left the page as text only: nothing audio, no blob upload, no speech endpoint
  const asked = requests.filter((r) => r.startsWith("POST") && r.includes("/api/keplar"));
  expect(asked.length).toBeGreaterThan(0);
  expect(requests.filter((r) => /audio|speech|voice|webm|wav|mpeg/i.test(r))).toEqual([]);
});

test("tap once to keep listening, tap again to send; Escape cancels and sends nothing", async ({ page }) => {
  await mockSpeech(page, { heard: "pricing", hold: false });
  await open(page);
  const btn = talk(page);
  await btn.click();
  await expect(btn).toContainText("Tap to send");
  await expect(btn).toHaveAttribute("aria-pressed", "true");
  await btn.click();
  await expect(page.locator("article").last()).toContainText(/Plus/, { timeout: 30_000 });

  // cancel path (once the spoken answer has finished by itself)
  await expect(btn).toContainText("Talk (beta)", { timeout: 15_000 });
  await btn.click();
  await expect(btn).toContainText("Tap to send");
  const articles = await page.locator("article").count();
  await page.keyboard.press("Escape");
  await expect(btn).toContainText("Talk (beta)");
  await expect(page.getByRole("status").filter({ hasText: "Canceled. Nothing was sent." })).toBeAttached();
  expect(await page.locator("article").count()).toBe(articles);
});

test("keyboard: hold Space to talk, release to send", async ({ page }) => {
  await mockSpeech(page);
  await open(page);
  await talk(page).focus();
  await page.keyboard.down("Space");
  await expect(talk(page)).toHaveAttribute("data-voice-btn", "listening");
  await page.waitForTimeout(500);
  await page.keyboard.up("Space");
  await expect(page.locator("article").last()).toContainText("Hassen", { timeout: 30_000 });
});

test("microphone blocked: honest message, typing still works, nothing is sent", async ({ page }) => {
  await mockSpeech(page, { deny: true });
  await open(page);
  await talk(page).click();
  await expect(page.getByRole("alert").filter({ hasText: "Microphone access is blocked" })).toBeVisible();
  await page.locator(composer).first().fill("who made keplar?");
  await page.getByRole("button", { name: /^Ask Keplar/ }).click();
  await expect(page.locator("article").last()).toContainText("Hassen", { timeout: 30_000 });
  // a typed question is not read aloud: only a question asked by voice arms the card
  expect((await log(page)).spoken).toEqual([]);
});

test("Firefox-like browser (no speech recognition, has read-aloud): Talk explains honestly; Listen still works", async ({ page }) => {
  await mockSpeech(page, { recognition: false });
  await open(page);
  const btn = page.getByRole("button", { name: /Voice mode \(beta\): not available in this browser/ });
  await expect(btn).toBeVisible();
  await btn.click();
  const note = page.getByTestId("voice-note");
  await expect(note).toContainText("can read answers aloud but can't turn your speech into text");
  await expect(note).toContainText("Firefox");
  await page.locator(composer).first().fill("who made keplar?");
  await page.getByRole("button", { name: /^Ask Keplar/ }).click();
  const card = page.locator("article").last();
  await expect(card).toContainText("Hassen", { timeout: 30_000 });
  await card.getByRole("button", { name: /Listen to the answer/ }).click();
  await expect.poll(async () => (await log(page)).spoken.length).toBeGreaterThan(0);
});

test("no speech support at all: honest message, no Listen button, typing unaffected", async ({ page }) => {
  await mockSpeech(page, { recognition: false, synthesis: false });
  await open(page);
  await page.getByRole("button", { name: /Voice mode \(beta\): not available in this browser/ }).click();
  await expect(page.getByTestId("voice-note")).toContainText("Voice mode isn't available in this browser");
  await page.locator(composer).first().fill("who made keplar?");
  await page.getByRole("button", { name: /^Ask Keplar/ }).click();
  const card = page.locator("article").last();
  await expect(card).toContainText("Hassen", { timeout: 30_000 });
  await expect(card.getByRole("button", { name: /Listen to the answer/ })).toHaveCount(0);
});

test("phone: Talk and Listen are 44px targets, nothing overflows sideways", async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: `http://localhost:${process.env.E2E_PORT || 3199}`, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await mockSpeech(page);
  await open(page);
  const box = await talk(page).boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await page.locator(composer).first().fill("who made keplar?");
  await page.getByRole("button", { name: /^Ask Keplar/ }).click();
  const card = page.locator("article").last();
  await expect(card).toContainText("Hassen", { timeout: 30_000 });
  const listen = await card.getByRole("button", { name: /Listen to the answer/ }).boundingBox();
  expect(listen!.width).toBeGreaterThanOrEqual(44);
  expect(listen!.height).toBeGreaterThanOrEqual(44);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(1);
  await ctx.close();
});
