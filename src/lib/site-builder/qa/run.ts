/**
 * The test run: open the draft in a real headless browser, look at it at three screen sizes, read the console, click through the
 * navigation, try the 404 page and a form, take screenshots for the Screen Library, and report what it saw as it goes.
 * Everything yielded is something that happened; there are no scripted "checks".
 */
import sharp from "sharp";
import type { Browser, BrowserContext, Page } from "playwright-core";
import { issuesFromConsole, issuesFromProbe, PROBE_JS, VIEWPORTS, type Probe, type QaIssue, type Viewport } from "./probe";
import { dnsResolve, guardContext, networkTransport, type Resolver, type Transport } from "@/lib/browser/run";

export type QaEvent =
  | { type: "step"; text: string }
  | { type: "issue"; issue: QaIssue }
  | { type: "shot"; page: string; viewport: Viewport["id"]; label: string; width: number; height: number; jpeg: Buffer }
  | { type: "check"; name: string; ok: boolean; detail: string }
  | { type: "done"; issues: QaIssue[]; pages: number; shots: number; homeShots: { viewport: Viewport["id"]; jpeg: Buffer }[] };

export type QaInput = {
  browser: Browser; baseUrl: string; siteId: string; version: number; token: string; pages: string[]; hasErrorPage: boolean; deadline: number;
  /** Tests inject these; production resolves DNS and fetches through the pinned SSRF-safe transport (src/lib/browser/run.ts). */
  resolve?: Resolver; transport?: Transport;
};

/**
 * The draft is user-authored HTML running in a browser on our servers: its images, scripts and fetches may only reach our own
 * origin (the draft itself) and the public web, never a private, loopback or metadata address (IN-6). Same guard as Keplar Browser.
 */
export async function guardQaContext(ctx: BrowserContext, i: Pick<QaInput, "baseUrl" | "resolve" | "transport">): Promise<void> {
  await guardContext(ctx, i.resolve ?? dnsResolve, i.transport ?? networkTransport, new Set(), new Set(), { trustedOrigin: new URL(i.baseUrl).origin });
}

const pageName = (f: string) => (f === "index.html" ? "the home page" : `the ${f.replace(/\.html$/, "").replace(/[-_]/g, " ")} page`);
const urlFor = (i: QaInput, file: string) => `${i.baseUrl}/sites/draft/${i.siteId}/${i.version}${file === "index.html" ? "" : `/${file}`}?t=${i.token}`;

async function shoot(page: Page, vp: Viewport): Promise<{ jpeg: Buffer; width: number; height: number }> {
  const raw = await page.screenshot({ type: "jpeg", quality: 78, fullPage: true, timeout: 20_000, animations: "disabled" });
  const meta = await sharp(raw).metadata();
  const maxW = vp.id === "desktop" ? 900 : vp.id === "tablet" ? 640 : 480;
  const fit = await sharp(raw).resize({ width: maxW, withoutEnlargement: true }).extract({ left: 0, top: 0, width: Math.min(maxW, meta.width ?? maxW), height: Math.min(Math.round(((meta.height ?? 0) * Math.min(maxW, meta.width ?? maxW)) / (meta.width || 1)), 4200) || 1 }).jpeg({ quality: 72, mozjpeg: true }).toBuffer();
  const m2 = await sharp(fit).metadata();
  return { jpeg: fit, width: m2.width ?? maxW, height: m2.height ?? 0 };
}

async function open(ctx: BrowserContext, vp: Viewport, url: string, log: { kind: "console" | "pageerror" | "request"; text: string }[]): Promise<{ page: Page; status: number }> {
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") log.push({ kind: "console", text: m.text() }); });
  page.on("pageerror", (e) => log.push({ kind: "pageerror", text: e.message }));
  page.on("requestfailed", (r) => log.push({ kind: "request", text: `${r.url().slice(0, 100)} ${r.failure()?.errorText ?? ""}` }));
  page.on("response", (r) => { if (r.status() >= 400 && r.request().resourceType() !== "document") log.push({ kind: "request", text: `${r.status()} ${r.url().slice(0, 100)}` }); });
  const res = await page.goto(url, { waitUntil: "load", timeout: 25_000 });
  await page.evaluate("document.fonts && document.fonts.ready.then(() => 1)").catch(() => undefined);
  await page.waitForTimeout(vp.id === "desktop" ? 900 : 600);
  return { page, status: res?.status() ?? 0 };
}

export async function* runQa(i: QaInput): AsyncGenerator<QaEvent> {
  const issues: QaIssue[] = [];
  const homeShots: { viewport: Viewport["id"]; jpeg: Buffer }[] = [];
  let shotsN = 0;
  let nav: Probe["links"] = [];
  let forms = 0;
  const left = () => i.deadline - Date.now();
  const pages = i.pages.slice(0, 8);
  for (const vp of VIEWPORTS) {
    const ctx = await i.browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.id === "mobile" ? 2 : 1, isMobile: vp.id === "mobile", hasTouch: vp.id !== "desktop", userAgent: vp.id === "mobile" ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1 KeplarQA" : undefined });
    try {
      await guardQaContext(ctx, i);
      // Phone and desktop see every page; the tablet only the home page (it sits between the two).
      const list = vp.id === "tablet" ? pages.slice(0, 1) : pages;
      for (const file of list) {
        if (left() < 25_000) {
          yield { type: "step", text: "Out of time for the remaining pages; skipping them" };
          break;
        }
        yield { type: "step", text: `Opening ${pageName(file)} on a ${vp.label} screen` };
        const log: { kind: "console" | "pageerror" | "request"; text: string }[] = [];
        let page: Page | null = null;
        try {
          const opened = await open(ctx, vp, urlFor(i, file), log);
          page = opened.page;
          if (opened.status >= 400) {
            const issue: QaIssue = { code: "page-status", severity: "error", page: file, viewport: vp.id, message: `${pageName(file)} answered HTTP ${opened.status}.` };
            issues.push(issue);
            yield { type: "issue", issue };
            continue;
          }
          const probe = (await page.evaluate(PROBE_JS)) as Probe;
          if (file === "index.html" && vp.id === "desktop") { nav = probe.links; forms = probe.forms; }
          const found = [...issuesFromProbe(probe, file, vp), ...issuesFromConsole(log, file, vp.id)];
          for (const issue of found) {
            issues.push(issue);
            yield { type: "issue", issue };
          }
          if (!found.length) yield { type: "check", name: `${pageName(file)}, ${vp.label}`, ok: true, detail: `No overflow, ${probe.fonts.length ? `fonts loaded (${probe.fonts.slice(0, 2).join(", ")}), ` : ""}no console errors` };
          const s = await shoot(page, vp);
          shotsN++;
          if (file === "index.html") homeShots.push({ viewport: vp.id, jpeg: s.jpeg });
          yield { type: "shot", page: file, viewport: vp.id, label: vp.label, width: s.width, height: s.height, jpeg: s.jpeg };
        } catch (e) {
          const issue: QaIssue = { code: "load-failed", severity: "error", page: file, viewport: vp.id, message: `${pageName(file)} did not finish loading (${e instanceof Error ? e.message.split("\n")[0].slice(0, 100) : "unknown"}).` };
          issues.push(issue);
          yield { type: "issue", issue };
        } finally {
          await page?.close().catch(() => undefined);
        }
      }

      if (vp.id === "desktop" && left() > 25_000) {
        // Click through the navigation the way a visitor would.
        const seen = new Set<string>();
        for (const l of nav) {
          const file = l.href.split(/[?#]/)[0].replace(/^\.?\//, "");
          if (!file.endsWith(".html") || seen.has(file) || !i.pages.includes(file)) continue;
          seen.add(file);
          if (seen.size > 6 || left() < 20_000) break;
          yield { type: "step", text: `Clicking "${l.text || file}" in the navigation` };
          const log: { kind: "console" | "pageerror" | "request"; text: string }[] = [];
          const home = await open(ctx, vp, urlFor(i, "index.html"), log).catch(() => null);
          if (!home) continue;
          try {
            const link = home.page.locator(`header a[href="${l.href}"], nav a[href="${l.href}"]`).first();
            await Promise.all([home.page.waitForLoadState("load", { timeout: 15_000 }), link.click({ timeout: 8_000 })]);
            const title = await home.page.title();
            const ok = home.page.url().includes(file.replace(/\.html$/, "")) || home.page.url().includes(file);
            const detail = ok ? `Opened ${file} ("${title.slice(0, 40)}")` : `Landed on ${home.page.url().slice(0, 80)} instead of ${file}`;
            yield { type: "check", name: `Navigation link "${l.text || file}"`, ok, detail };
            if (!ok) {
              const issue: QaIssue = { code: "nav-broken", severity: "error", page: "index.html", viewport: "desktop", message: `The navigation link "${l.text}" does not open ${file}.` };
              issues.push(issue);
              yield { type: "issue", issue };
            }
          } catch {
            const issue: QaIssue = { code: "nav-broken", severity: "error", page: "index.html", viewport: "desktop", message: `The navigation link "${l.text}" could not be clicked or did not open ${file}.` };
            issues.push(issue);
            yield { type: "issue", issue };
          } finally {
            await home.page.close().catch(() => undefined);
          }
        }

        // The page that does not exist.
        yield { type: "step", text: "Opening an address that does not exist, to see the 404 page" };
        const miss = await ctx.newPage();
        try {
          const r = await miss.goto(`${i.baseUrl}/sites/draft/${i.siteId}/${i.version}/this-page-does-not-exist?t=${i.token}`, { waitUntil: "load", timeout: 15_000 });
          const body = (await miss.evaluate("document.body ? document.body.innerText.length : 0").catch(() => 0)) as number;
          const ok = r?.status() === 404 && body > 20 && i.hasErrorPage;
          yield { type: "check", name: "404 page", ok, detail: i.hasErrorPage ? `The site's own 404 page answered (${r?.status()}).` : "The site has no 404.html of its own." };
          if (!i.hasErrorPage) {
            const issue: QaIssue = { code: "no-error-page", severity: "warn", page: "404.html", viewport: "all", message: "There is no error page of the site's own, so visitors see Keplar's generic one." };
            issues.push(issue);
            yield { type: "issue", issue };
          }
        } catch {
          /* the check above reports nothing when the browser could not even request it */
        } finally {
          await miss.close().catch(() => undefined);
        }

        // A form, filled in the way a visitor would.
        if (forms > 0 && left() > 25_000) {
          const formPage = i.pages.find((f) => /contact|visit|reserve|book|inquir|waitlist/i.test(f)) ?? "index.html";
          yield { type: "step", text: `Filling in and sending the form on ${pageName(formPage)}` };
          const log: { kind: "console" | "pageerror" | "request"; text: string }[] = [];
          const fp = await open(ctx, vp, urlFor(i, formPage), log).catch(() => null);
          if (fp) {
            try {
              const form = fp.page.locator("form").first();
              if (await form.count()) {
                for (const el of await form.locator("input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit]), textarea").all()) {
                  const type = (await el.getAttribute("type")) ?? "text";
                  await el.fill(type === "email" ? "qa@example.com" : type === "tel" ? "5550100" : type === "number" ? "2" : type === "date" ? "2030-01-01" : "Keplar test message").catch(() => undefined);
                }
                for (const sel of await form.locator("select").all()) await sel.selectOption({ index: 1 }).catch(() => sel.selectOption({ index: 0 }).catch(() => undefined));
                const [resp] = await Promise.all([fp.page.waitForResponse((r) => r.request().method() === "POST", { timeout: 12_000 }).catch(() => null), form.locator("[type=submit], button:not([type=button])").first().click({ timeout: 6_000 }).catch(() => undefined)]);
                const ok = Boolean(resp && resp.status() < 400);
                yield { type: "check", name: "Form", ok, detail: ok ? "The form submitted and the preview answered (nothing is saved from a preview)." : `The form did not submit cleanly${resp ? ` (HTTP ${resp.status()})` : ""}.` };
                if (!ok) {
                  const issue: QaIssue = { code: "form-failed", severity: "error", page: formPage, viewport: "desktop", message: `The form on ${formPage} did not submit${resp ? ` (HTTP ${resp.status()})` : ""}. Check required fields and labels.` };
                  issues.push(issue);
                  yield { type: "issue", issue };
                }
              }
            } catch {
              /* a form we cannot drive is not reported as broken */
            } finally {
              await fp.page.close().catch(() => undefined);
            }
          }
        }
      }
    } finally {
      await ctx.close().catch(() => undefined);
    }
  }
  yield { type: "done", issues, pages: pages.length, shots: shotsN, homeShots };
}
