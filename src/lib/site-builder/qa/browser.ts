/**
 * A real headless Chromium for testing generated sites (not a simulation): @sparticuz/chromium on Vercel and locally, driven by
 * playwright-core. One browser per QA run, always closed. If the browser cannot start the caller says so; nothing is faked.
 * Playwright is loaded only when launchBrowser() runs so list/config API routes never pull it into the serverless bundle.
 */
import type { Browser } from "playwright-core";

export class BrowserUnavailable extends Error {}

export async function launchBrowser(): Promise<Browser> {
  try {
    const [{ default: chromium }, { chromium: pw }] = await Promise.all([
      import("@sparticuz/chromium"),
      import("playwright-core"),
    ]);
    const executablePath = process.env.KEPLAR_QA_CHROMIUM?.trim() || (await chromium.executablePath());
    return await pw.launch({ executablePath, args: [...chromium.args.filter((a) => a !== "--single-process"), "--font-render-hinting=none"], headless: true, timeout: 30_000 });
  } catch (e) {
    throw new BrowserUnavailable(`The test browser could not start (${e instanceof Error ? e.message.split("\n")[0].slice(0, 120) : "unknown error"}).`);
  }
}

export async function withBrowser<T>(fn: (b: Browser) => Promise<T>): Promise<T> {
  const b = await launchBrowser();
  try {
    return await fn(b);
  } finally {
    await b.close().catch(() => undefined);
  }
}
