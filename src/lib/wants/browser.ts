/**
 * Track B: Playwright scaffold for Keplar Wants.
 *
 * Dry-run by default: fields are filled, submit is not clicked.
 * A real click requires a server-verified PIN (`confirmed`) and KEPLAR_BROWSER_DRY_RUN=0.
 * Targets are allowlisted to this module's own file:// fixtures and localhost. Real sites and other files are refused.
 * Each run gets a fresh context with no stored session. Pages with a CAPTCHA or a
 * password field are refused. Logins, CAPTCHAs, paywalls and site terms are not bypassed.
 * On a driver error or a missing selector the browser is closed and a fallback card is returned.
 */
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Browser } from "playwright-core";
import { CAPTCHA_HTML, FORM_HTML } from "./fixtures";

const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1"]);
const BLOCK_SELECTORS = ["iframe[src*='captcha']", "[class*='captcha']", "input[type='password']"];

/**
 * file: only for this module's own fixtures (form.html / captcha.html in a keplar-wants-* folder it made under the temp
 * directory), never any other file on the server (/etc/passwd, the app's env files, another user's upload).
 */
function isOwnFixture(u: URL): boolean {
  if (u.host || u.search || u.hash) return false;
  let file: string;
  try {
    file = path.resolve(fileURLToPath(u));
  } catch {
    return false;
  }
  const dir = path.dirname(file);
  return path.dirname(dir) === path.resolve(tmpdir()) && /^keplar-wants-[A-Za-z0-9_-]+$/.test(path.basename(dir)) && (path.basename(file) === "form.html" || path.basename(file) === "captcha.html");
}

export function urlAllowed(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol === "file:") return isOwnFixture(u);
  return (u.protocol === "http:" || u.protocol === "https:") && ALLOWED_HOSTS.has(u.hostname);
}

export type FallbackCard = {
  status: "fallback";
  track: "B";
  reason: string;
  detail: string;
  ui: { type: "fallback_modal"; title: string; message: string };
};

export function fallback(reason: string, detail = ""): FallbackCard {
  return {
    status: "fallback",
    track: "B",
    reason,
    detail: detail.slice(0, 300),
    ui: {
      type: "fallback_modal",
      title: "Keplar couldn't finish this one",
      message: "The page didn't behave as expected, so Keplar stopped. Nothing was submitted.",
    },
  };
}

function writeFixture(name: string, html: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "keplar-wants-"));
  const file = path.join(dir, name);
  writeFileSync(file, html);
  return pathToFileURL(file).href;
}

let formUrl: string | null = null;
let captchaUrl: string | null = null;
export function formFixtureUrl(): string {
  formUrl ??= writeFixture("form.html", FORM_HTML);
  return formUrl;
}
export function captchaFixtureUrl(): string {
  captchaUrl ??= writeFixture("captcha.html", CAPTCHA_HTML);
  return captchaUrl;
}

export type PageDriver = {
  goto(url: string): Promise<void>;
  has(selector: string): Promise<boolean>;
  fill(selector: string, value: string): Promise<void>;
  waitFor(selector: string): Promise<void>;
  click(selector: string): Promise<void>;
  text(selector: string): Promise<string | null>;
  close(): Promise<void>;
};

export type OpenPage = (userId: string, timeoutMs: number) => Promise<PageDriver>;

function chromePath(): string | null {
  const fromEnv = process.env.KEPLAR_CHROME?.trim() || process.env.KEPLAR_QA_CHROMIUM?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  for (const p of ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"]) {
    if (existsSync(p)) return p;
  }
  return null;
}

/** Fresh headless Chromium. System Chrome when present, otherwise the repo's serverless Chromium. */
export async function openPlaywrightPage(userId: string, timeoutMs: number): Promise<PageDriver> {
  const { chromium } = await import("playwright-core");
  let browser: Browser;
  const exe = chromePath();
  try {
    browser = exe
      ? await chromium.launch({ executablePath: exe, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"], timeout: 30_000 })
      : await (await import("@/lib/site-builder/qa/browser")).launchBrowser();
  } catch (e) {
    throw new Error(`driver_unavailable: ${e instanceof Error ? e.message.split("\n")[0].slice(0, 180) : "launch failed"}`);
  }
  const ctx = await browser.newContext({ acceptDownloads: false, extraHTTPHeaders: { "X-Keplar-Sandbox-User": userId } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(timeoutMs);
  let closed = false;
  return {
    goto: async (url) => {
      await page.goto(url);
    },
    has: async (sel) => (await page.$(sel)) !== null,
    fill: (sel, value) => page.fill(sel, value),
    waitFor: async (sel) => {
      await page.waitForSelector(sel);
    },
    click: (sel) => page.click(sel),
    text: (sel) => page.textContent(sel),
    close: async () => {
      if (closed) return;
      closed = true;
      await browser.close().catch(() => undefined);
    },
  };
}

export type FormTaskResult =
  | { status: "refused"; track: "B"; reason: string }
  | { status: "needs_confirmation"; track: "B"; reason: string }
  | { status: "dry_run" | "submitted"; track: "B"; filled: string[]; submitted: boolean; result: string | null }
  | FallbackCard;

export async function runFormTask(opts: {
  userId: string;
  url: string;
  fields: Record<string, string>;
  submitSelector: string | null;
  dryRun?: boolean;
  confirmed?: boolean;
  timeoutMs?: number;
  open?: OpenPage;
  signal?: AbortSignal;
}): Promise<FormTaskResult> {
  const dryRun = opts.dryRun !== false;
  if (!urlAllowed(opts.url)) return { status: "refused", track: "B", reason: "Target not in sandbox allowlist (local fixtures only)." };
  if (!dryRun && !opts.confirmed) return { status: "needs_confirmation", track: "B", reason: "PIN confirmation required before submit." };
  if (opts.signal?.aborted) return fallback("timeout", "aborted");
  const timeoutMs = opts.timeoutMs ?? 8000;
  const open = opts.open ?? openPlaywrightPage;
  let page: PageDriver | null = null;
  try {
    page = await open(opts.userId, timeoutMs);
    if (opts.signal?.aborted) return fallback("timeout", "aborted");
    await page.goto(opts.url);
    for (const sel of BLOCK_SELECTORS) {
      if (await page.has(sel)) {
        return { status: "refused", track: "B", reason: "Page requires login/CAPTCHA; Keplar won't automate that. Use an official connection." };
      }
    }
    const filled: string[] = [];
    for (const [sel, val] of Object.entries(opts.fields)) {
      await page.fill(sel, val);
      filled.push(sel);
    }
    let submitted = false;
    if (opts.submitSelector) {
      await page.waitFor(opts.submitSelector);
      if (!dryRun && opts.confirmed) {
        await page.click(opts.submitSelector);
        submitted = true;
      }
    }
    const result = submitted && (await page.has("#result")) ? await page.text("#result") : null;
    return { status: dryRun ? "dry_run" : "submitted", track: "B", filled, submitted, result };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.startsWith("driver_unavailable")) return fallback("driver_unavailable", message);
    return fallback("driver_or_dom_error", `${e instanceof Error ? e.name : "Error"}: ${message}`);
  } finally {
    await page?.close().catch(() => undefined);
  }
}
